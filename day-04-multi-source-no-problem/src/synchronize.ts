import { consensus } from "fintech-algorithms/market-data-engineering/data-quality/price-source-consensus-check";
import { previousTick } from "fintech-algorithms/market-data-engineering/time-synchronization/previous-tick-interpolation";
import { linearQuoteInterpolation } from "fintech-algorithms/market-data-engineering/time-synchronization/linear-quote-interpolation";
import { refreshTimeSample } from "fintech-algorithms/market-data-engineering/time-synchronization/refresh-time-sampling";
import {
  alignEvents,
  localWallToUtc,
  validateCalendar,
  type CalendarBundle,
} from "fintech-algorithms/market-data-engineering/time-synchronization/exchange-calendar-alignment";
import { diagnoseAsynchronousReturnAlignment } from "fintech-algorithms/market-data-engineering/time-synchronization/asynchronous-return-alignment";

import type {
  MarketCaptureResult,
  MarketDataProvider,
  NormalizedTrade,
} from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";

const OWNER: Record<MarketDataProvider, string> = {
  alpaca: "AlpacaDB",
  finnhub: "Finnhub",
  fmp: "Financial Modeling Prep",
};

function latest<T extends { timestamp: string }>(rows: T[]): T | undefined {
  return [...rows].sort((left, right) => left.timestamp.localeCompare(right.timestamp)).at(-1);
}

export function configuredCalendar(trades: NormalizedTrade[]): CalendarBundle {
  const dates = [...new Set(trades.map((trade) => trade.session))].sort();
  const sessions = dates.map((date) => ({
    session_id: `XNYS:${date}:configured`,
    session_date: date,
    local_open: `${date}T09:30:00`,
    local_close: `${date}T16:00:00`,
    open: localWallToUtc(`${date}T09:30:00`, "America/New_York"),
    close: localWallToUtc(`${date}T16:00:00`, "America/New_York"),
    session_type: "configured_regular",
    source_ids: ["tutorial-configuration:not-an-official-calendar"],
  }));
  const bundle: CalendarBundle = {
    calendar: {
      calendar_id: "tutorial-xnys-regular-hours",
      calendar_version: "configured-v1",
      retrieved_at: new Date(0).toISOString(),
      venue: "XNYS",
      market: "US equities",
      time_zone: "America/New_York",
      tzdb_version: "runtime-Intl",
      supported_dates: dates,
      boundary: "[open, close)",
      outside_coverage: "fail_closed",
      local_time_policy: "reject_nonexistent_require_fold_for_ambiguous",
    },
    sessions,
    closed_dates: [],
  };
  validateCalendar(bundle);
  return bundle;
}

export function synchronizeCaptures(captures: MarketCaptureResult[], maxAgeMs = 5_000) {
  if (captures.length < 2) throw new Error("Synchronization requires at least two successful providers.");
  const providers = captures.map((capture) => capture.provider.provider);
  if (new Set(providers).size !== providers.length) throw new Error("Each provider may appear only once.");
  const symbol = captures[0].tradeArrivals[0]?.symbol;
  if (!symbol || captures.some((capture) => capture.tradeArrivals.some((trade) => trade.symbol !== symbol))) {
    throw new Error("All captures must contain trades for the same normalized symbol.");
  }
  const allTrades = captures.flatMap((capture) => capture.tradeArrivals);
  const asOf = [...allTrades.map((trade) => trade.receivedAt)].sort().at(-1)!;
  const sourceObservations = captures.flatMap((capture) =>
    capture.tradeArrivals.map((trade, index) => ({
      partition: symbol,
      instrument: capture.provider.provider,
      record_id: `${capture.provider.provider}:${trade.tradeId}:${index}`,
      revision: 0,
      event_time: trade.timestamp,
      available_at: trade.receivedAt,
      value: trade.price,
    })),
  );
  const refresh = refreshTimeSample(sourceObservations, providers, maxAgeMs);
  const previous = previousTick(
    captures.flatMap((capture) =>
      capture.tradeArrivals.map((trade) => ({
        instrument: capture.provider.provider,
        event_time: trade.timestamp,
        available_time: trade.receivedAt,
        revision: 0,
        value: trade.price,
      })),
    ),
    [{ grid_time: asOf, query_time: asOf }],
    maxAgeMs,
  );
  const sourceQuotes = captures.flatMap((capture) => {
    const trade = latest(capture.tradeArrivals);
    return trade
      ? [{
          source_id: capture.provider.provider,
          owner_id: OWNER[capture.provider.provider],
          price: trade.price,
          instrument_id: symbol,
          currency: "USD",
          price_type: "last_trade",
          adjustment: "unadjusted",
          session: trade.session,
          event_time: trade.timestamp,
        }]
      : [];
  });
  const expectedSession = sourceQuotes[0]?.session;
  const sourceConsensus = consensus(
    { as_of: asOf, quotes: sourceQuotes },
    {
      minimum_independent_sources: 2,
      z_threshold: 3.5,
      absolute_tolerance: 0.01,
      maximum_tolerance: 1,
      max_age_ms: maxAgeMs,
      expected_contract: {
        instrument_id: symbol,
        currency: "USD",
        price_type: "last_trade",
        adjustment: "unadjusted",
        session: expectedSession,
      },
    },
  );
  const quoteInterpolation = captures.flatMap((capture) => {
    const quotes = [...capture.quotes].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (quotes.length < 2) {
      return [{
        provider: capture.provider.provider,
        status: "unavailable",
        reason: capture.provider.quotes ? "fewer_than_two_quotes" : "provider_has_no_quote_channel",
      }];
    }
    const left = quotes[0];
    const right = quotes.at(-1)!;
    const target = new Date((Date.parse(left.timestamp) + Date.parse(right.timestamp)) / 2).toISOString();
    return linearQuoteInterpolation(
      quotes.map((quote) => ({
        instrument: quote.symbol,
        venue: capture.provider.provider,
        session_id: quote.session,
        event_time: quote.timestamp,
        available_time: quote.receivedAt,
        bid: quote.bid,
        ask: quote.ask,
      })),
      [{
        instrument: symbol,
        venue: capture.provider.provider,
        session_id: left.session,
        target_time: target,
        evaluation_time: asOf,
      }],
      maxAgeMs,
    ).map((row) => ({ provider: capture.provider.provider, ...row }));
  });
  const calendar = configuredCalendar(allTrades);
  const calendarAlignment = alignEvents(
    allTrades.map((trade, index) => ({
      event_id: `${trade.source}:${trade.tradeId}:${index}`,
      timestamp: trade.timestamp,
      event_kind: "continuous",
    })),
    calendar,
  );
  const intervals = captures.flatMap((capture) => {
    const rows = [...capture.tradeArrivals].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const first = rows[0];
    const last = rows.at(-1);
    if (!first || !last || first.timestamp === last.timestamp) return [];
    return [{
      provider: capture.provider.provider,
      interval: {
        return_id: `${capture.provider.provider}:capture-return`,
        instrument: `${symbol}@${capture.provider.provider}`,
        partition: symbol,
        event_start: first.timestamp,
        event_end: last.timestamp,
        available_at: last.receivedAt,
        return_value: last.price / first.price - 1,
      },
    }];
  });
  const asynchronousReturns = intervals.length >= 2
    ? diagnoseAsynchronousReturnAlignment(
        [intervals[0].interval],
        [intervals[1].interval],
        asOf,
      )
    : { diagnostic_only: true, status: "unavailable", reason: "two_multi_trade_streams_required" };
  return {
    symbol,
    asOf,
    providers,
    providerOwnershipNote:
      "owner_id records vendor ownership only; it does not prove independent exchange or upstream-feed lineage.",
    consensus: sourceConsensus,
    previousTick: previous,
    refreshTime: refresh,
    quoteInterpolation,
    calendar: {
      provenance: "configured teaching schedule; replace with an official versioned exchange calendar in production",
      aligned: calendarAlignment,
    },
    asynchronousReturns,
  };
}

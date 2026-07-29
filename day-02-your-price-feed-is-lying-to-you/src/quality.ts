import { constructBars as constructTimeBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";
import { validateBars } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/ohlc-consistency-validator";
import { hampelFilter } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/hampel-bad-tick-filter";
import { madOutliers } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/median-absolute-deviation-outlier-filter";
import { classifyMarkets } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/crossed-locked-market-detector";
import { resolveTrades } from "fintech-algorithms/market-data-engineering/cleaning-and-validation/duplicate-trade-resolver";
import {
  DEFAULT_CONFIG,
  detectStaleQuotes,
  type DetectorConfig,
  type DetectorEvent,
  type SessionState,
} from "fintech-algorithms/market-data-engineering/cleaning-and-validation/stale-quote-detector";

import type {
  NormalizedCancelError,
  NormalizedCorrection,
  NormalizedQuote,
  NormalizedTrade,
  ProviderCapabilities,
} from "./providers/types.ts";

export interface BarInput {
  [key: string]: unknown;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: string;
  symbol: string;
  bar_id?: string;
}

export interface QualityInput {
  sourceLabel: string;
  capabilities: ProviderCapabilities;
  trades: NormalizedTrade[];
  tradeArrivals: NormalizedTrade[];
  quotes: NormalizedQuote[];
  corrections: NormalizedCorrection[];
  cancelErrors: NormalizedCancelError[];
  captureEnd: string;
  intervalSeconds?: number;
  barsOverride?: BarInput[];
  clockSyncVerified: boolean;
  sessionState: SessionState;
  activityExpected: boolean;
  staleConfig?: DetectorConfig;
}

export interface Finding {
  stage: "ohlc" | "hampel" | "mad" | "quotes" | "trades" | "staleness";
  row: string;
  rule: string;
  disposition: "quarantine" | "review" | "unavailable";
  detail: string;
}

type LifecycleInput = Parameters<typeof resolveTrades>[0];

function sessionStarts(trades: NormalizedTrade[]): Record<string, string> {
  return Object.fromEntries(
    [...new Set(trades.map((trade) => trade.session))].map((session) => [
      session,
      trades.find((trade) => trade.session === session)!.timestamp,
    ]),
  );
}

function buildBars(trades: NormalizedTrade[], intervalSeconds: number): BarInput[] {
  if (trades.length === 0) return [];
  return constructTimeBars(trades, {
    intervalSeconds,
    sessionStarts: sessionStarts(trades),
  }).map((bar) => ({
    timestamp: bar.startTime,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    source: "fintech-algorithms/time-bars",
    symbol: trades[0].symbol,
    bar_id: `${bar.session}:${bar.intervalIndex}`,
  }));
}

function lifecycleEvents(input: QualityInput): LifecycleInput {
  const events = [
    ...input.tradeArrivals.map((event) => ({ kind: "trade" as const, sequence: event.sequence, event })),
    ...input.corrections.map((event) => ({ kind: "correction" as const, sequence: event.sequence, event })),
    ...input.cancelErrors.map((event) => ({ kind: "cancel" as const, sequence: event.sequence, event })),
  ].sort((left, right) => left.sequence - right.sequence);

  const firstPayload = new Map<string, LifecycleInput[number]>();
  const rootByProviderId = new Map<string, string>();
  const headByProviderId = new Map<string, string>();
  const output: LifecycleInput = [];

  for (const item of events) {
    if (item.kind === "trade") {
      const trade = item.event;
      const providerId = trade.providerTradeId ?? trade.tradeId;
      const eventId = `trade:${providerId}`;
      const existing = firstPayload.get(eventId);
      if (existing) {
        output.push({ ...existing });
        continue;
      }
      const mapped: LifecycleInput[number] = {
        source_id: `${trade.source}:${trade.feed}:local-arrival-v1`,
        session_id: trade.session,
        instrument_id: trade.symbol,
        event_id: eventId,
        trade_id: `trade:${providerId}`,
        action: "NEW",
        receive_ts: trade.receivedAt,
        sequence: trade.sequence,
        price: trade.price,
        size: trade.volume,
        provider_event_time: trade.timestamp,
        provider_exchange: trade.exchange,
        provider_conditions: trade.conditions,
      };
      firstPayload.set(eventId, mapped);
      rootByProviderId.set(providerId, providerId);
      headByProviderId.set(providerId, eventId);
      output.push(mapped);
      continue;
    }

    if (item.kind === "correction") {
      const correction = item.event;
      const root = rootByProviderId.get(correction.originalProviderTradeId)
        ?? correction.originalProviderTradeId;
      const ref = headByProviderId.get(correction.originalProviderTradeId)
        ?? `trade:${correction.originalProviderTradeId}`;
      const eventId = `correction:${correction.correctedProviderTradeId}:${correction.sequence}`;
      output.push({
        source_id: `${correction.source}:${correction.feed}:local-arrival-v1`,
        session_id: correction.session,
        instrument_id: correction.symbol,
        event_id: eventId,
        trade_id: `trade:${root}`,
        action: "CORRECT",
        ref_event_id: ref,
        receive_ts: correction.receivedAt,
        sequence: correction.sequence,
        price: correction.correctedPrice,
        size: correction.correctedSize,
        provider_event_time: correction.timestamp,
        original_provider_trade_id: correction.originalProviderTradeId,
        corrected_provider_trade_id: correction.correctedProviderTradeId,
      });
      rootByProviderId.set(correction.correctedProviderTradeId, root);
      headByProviderId.set(correction.originalProviderTradeId, eventId);
      headByProviderId.set(correction.correctedProviderTradeId, eventId);
      continue;
    }

    const terminal = item.event;
    const providerId = terminal.providerTradeId ?? terminal.tradeId;
    const root = rootByProviderId.get(providerId) ?? providerId;
    const ref = headByProviderId.get(providerId)
      ?? `trade:${providerId}`;
    output.push({
      source_id: `${terminal.source}:${terminal.feed}:local-arrival-v1`,
      session_id: terminal.session,
      instrument_id: terminal.symbol,
      event_id: `${terminal.action.toLowerCase()}:${providerId}:${terminal.sequence}`,
      trade_id: `trade:${root}`,
      action: terminal.action,
      ref_event_id: ref,
      receive_ts: terminal.receivedAt,
      sequence: terminal.sequence,
      provider_event_time: terminal.timestamp,
      provider_exchange: terminal.exchange,
    });
  }
  return output;
}

function staleEvents(input: QualityInput): DetectorEvent[] {
  const quoteEvents: DetectorEvent[] = [...input.quotes]
    .sort((left, right) =>
      Date.parse(left.receivedAt) - Date.parse(right.receivedAt) || left.sequence - right.sequence
    )
    .map((quote) => ({
      kind: "quote",
      observed_ts: quote.receivedAt,
      source_event_ts: quote.timestamp,
      clock_sync_ok: input.clockSyncVerified,
      bid: quote.bid,
      ask: quote.ask,
      session_id: quote.session,
      session_state: input.sessionState,
      activity_expected: input.activityExpected,
      feed: `${quote.source}:${quote.feed}`,
      sequence: quote.sequence,
    }));
  if (quoteEvents.length === 0) return [];
  const lastObserved = Date.parse(quoteEvents.at(-1)!.observed_ts);
  const checkMs = Math.max(lastObserved, Date.parse(input.captureEnd));
  quoteEvents.push({
    kind: "check",
    observed_ts: new Date(checkMs).toISOString(),
    session_id: quoteEvents.at(-1)!.session_id,
    session_state: input.sessionState,
    activity_expected: input.activityExpected,
  });
  return quoteEvents;
}

export function runQualityGate(input: QualityInput) {
  const findings: Finding[] = [];
  const intervalSeconds = input.intervalSeconds ?? 10;
  const bars = input.barsOverride ?? buildBars(input.trades, intervalSeconds);
  const barValidation = validateBars(bars, { tickSize: 0.01, toleranceTicks: 0 });
  for (const row of barValidation.filter((value) => !value.valid)) {
    findings.push({
      stage: "ohlc",
      row: row.timestamp || `bar:${row.index}`,
      rule: row.issues.join("+"),
      disposition: "quarantine",
      detail: `bar index ${row.index}`,
    });
  }

  const logReturns: (number | null)[] = input.trades.map((trade, index) =>
    index === 0 ? null : Math.log(trade.price / input.trades[index - 1].price)
  );
  const hampel = hampelFilter(logReturns, {
    windowRadius: 5,
    threshold: 5,
    minHistory: 5,
    mode: "causal",
    repair: "none",
  });
  for (const point of hampel.filter((value) => value.flagged)) {
    findings.push({
      stage: "hampel",
      row: input.trades[point.index]?.timestamp ?? `trade:${point.index}`,
      rule: "LOCAL_PRICE_OUTLIER",
      disposition: "review",
      detail: `score=${String(point.score)}; raw value preserved`,
    });
  }

  const mad = madOutliers(logReturns, 5);
  for (const point of mad.points.filter((value) => value.outlier)) {
    findings.push({
      stage: "mad",
      row: input.trades[point.index]?.timestamp ?? `trade:${point.index}`,
      rule: "BATCH_PRICE_OUTLIER",
      disposition: "review",
      detail: `score=${String(point.score)}; retrospective capture review`,
    });
  }

  const marketInput = input.quotes.map((quote) => ({
    instrument: quote.symbol,
    market_scope: `${quote.source}-${quote.feed}-top-of-book`,
    feed: `${quote.source}:${quote.feed}`,
    event_time: quote.timestamp,
    receive_time: quote.receivedAt,
    sequence: quote.sequence,
    bid: quote.bid,
    ask: quote.ask,
    tick_size: 0.01,
    bid_source: quote.bidExchange,
    ask_source: quote.askExchange,
    conditions: quote.conditions,
  }));
  const markets = input.capabilities.quotes ? classifyMarkets(marketInput) : [];
  if (!input.capabilities.quotes) {
    findings.push({
      stage: "quotes",
      row: "provider-contract",
      rule: "QUOTES_NOT_SUPPLIED",
      disposition: "unavailable",
      detail: `${input.capabilities.provider}:${input.capabilities.feed} does not supply quotes on this endpoint.`,
    });
  }
  for (const row of markets.filter((value) => value.state !== "NORMAL")) {
    findings.push({
      stage: "quotes",
      row: `arrival:${String(marketInput[row.index]?.sequence ?? row.index)}`,
      rule: row.state,
      disposition: row.state === "INVALID" ? "quarantine" : "review",
      detail: row.reason ?? row.diagnostic,
    });
  }

  const lifecycleSupported =
    input.capabilities.providerTradeIds &&
    (input.capabilities.corrections || input.capabilities.cancelErrorsOrBreaks);
  const mappedLifecycle = lifecycleSupported ? lifecycleEvents(input) : [];
  const lifecycleResult = lifecycleSupported ? resolveTrades(mappedLifecycle) : null;
  if (!lifecycleSupported) {
    const reason = input.capabilities.cancelErrorsOrBreaks
      ? "Lifecycle messages are visible, but the provider contract lacks the trade identity needed to link them safely."
      : "This endpoint does not document correction, cancellation, error, or trade-break events.";
    findings.push({
      stage: "trades",
      row: "provider-contract",
      rule: "LIFECYCLE_NOT_RESOLVABLE",
      disposition: "unavailable",
      detail: reason,
    });
  } else {
    for (const row of lifecycleResult!.audit) {
      if (String(row.decision).startsWith("APPLY")) continue;
      findings.push({
        stage: "trades",
        row: String(row.event_id),
        rule: String(row.decision),
        disposition: String(row.decision) === "DROP_REPLAY" ? "review" : "quarantine",
        detail: String(row.reason),
      });
    }
  }

  let staleness:
    | { status: "ok"; rows: ReturnType<typeof detectStaleQuotes>; reason: null }
    | { status: "not_evaluated"; rows: []; reason: string };
  if (!input.capabilities.quotes) {
    const reason = "The selected provider endpoint does not supply quotes.";
    staleness = { status: "not_evaluated", rows: [], reason };
    findings.push({
      stage: "staleness",
      row: "provider-contract",
      rule: "QUOTES_NOT_SUPPLIED",
      disposition: "unavailable",
      detail: reason,
    });
  } else if (input.quotes.length === 0) {
    staleness = { status: "not_evaluated", rows: [], reason: "No quote arrived." };
  } else if (!input.clockSyncVerified) {
    const reason =
      "Source/receiver clock synchronization was not verified; freshness ages were not computed.";
    staleness = { status: "not_evaluated", rows: [], reason };
    findings.push({
      stage: "staleness",
      row: "capture",
      rule: "CLOCK_SYNC_UNVERIFIED",
      disposition: "unavailable",
      detail: reason,
    });
  } else {
    const rows = detectStaleQuotes(staleEvents(input), input.staleConfig ?? DEFAULT_CONFIG);
    staleness = { status: "ok", rows, reason: null };
    for (const row of rows.filter((value) => !value.usable_for_active_market)) {
      findings.push({
        stage: "staleness",
        row: row.observed_ts,
        rule: row.reasons[0] ?? "UNUSABLE",
        disposition: "quarantine",
        detail: row.reasons.join(", "),
      });
    }
  }

  return {
    sourceLabel: input.sourceLabel,
    capabilities: input.capabilities,
    bars,
    barValidation,
    logReturns,
    hampel,
    mad,
    markets,
    lifecycle: {
      status: lifecycleSupported ? "ok" as const : "not_evaluated" as const,
      reason: lifecycleSupported
        ? null
        : "The selected provider contract cannot safely resolve trade lineage.",
      orderingBasis:
        "adapter-local arrival order; not an exchange or SIP source-sequence guarantee",
      mappedInput: mappedLifecycle,
      result: lifecycleResult,
    },
    staleness,
    findings,
  };
}

export type QualityReport = ReturnType<typeof runQualityGate>;

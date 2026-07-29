import { Alpaca } from "@alpacahq/alpaca-trade-api";

export type AlpacaFeed = "iex" | "sip" | "delayed_sip";

export interface NormalizedTrade {
  tradeId: string;
  providerTradeId?: string;
  timestamp: string;
  sourceTimestampRaw?: string;
  session: string;
  symbol: string;
  price: number;
  volume: number;
  currency: "USD";
  sequence: number;
  receivedAt: string;
  exchange: string;
  conditions: string[];
  tape?: string;
  source: "alpaca";
  feed: AlpacaFeed;
}

export interface NormalizedQuote {
  timestamp: string;
  sourceTimestampRaw?: string;
  receivedAt: string;
  sequence: number;
  session: string;
  symbol: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  bidExchange?: string;
  askExchange?: string;
  conditions: string[];
  tape?: string;
  source: "alpaca";
  feed: AlpacaFeed;
}

export interface NormalizedCorrection {
  timestamp: string;
  sourceTimestampRaw?: string;
  receivedAt: string;
  sequence: number;
  session: string;
  symbol: string;
  originalTradeId: string;
  originalProviderTradeId: string;
  originalPrice: number;
  originalSize: number;
  correctedTradeId: string;
  correctedProviderTradeId: string;
  correctedPrice: number;
  correctedSize: number;
  exchange?: string;
  originalConditions: string[];
  correctedConditions: string[];
  tape?: string;
  source: "alpaca";
  feed: AlpacaFeed;
}

export interface NormalizedCancelError {
  timestamp: string;
  sourceTimestampRaw?: string;
  receivedAt: string;
  sequence: number;
  session: string;
  symbol: string;
  tradeId: string;
  providerTradeId: string;
  action: "CANCEL" | "ERROR";
  exchange: string;
  price: number;
  size: number;
  tape?: string;
  source: "alpaca";
  feed: AlpacaFeed;
}

export interface MarketCaptureOptions {
  symbol: string;
  feed: AlpacaFeed;
  durationSeconds: number;
  maxEvents?: number;
  includeTrades?: boolean;
  includeQuotes?: boolean;
}

export interface MarketCaptureResult {
  trades: NormalizedTrade[];
  tradeArrivals: NormalizedTrade[];
  quotes: NormalizedQuote[];
  corrections: NormalizedCorrection[];
  cancelErrors: NormalizedCancelError[];
  stoppedBy: "duration" | "event_limit";
  streamErrors: string[];
}

export interface CaptureOptions {
  symbol: string;
  feed: AlpacaFeed;
  durationSeconds: number;
  maxTrades?: number;
}

export interface CaptureResult {
  trades: NormalizedTrade[];
  stoppedBy: "duration" | "trade_limit";
}

const NEW_YORK_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function sessionDate(timestamp: Date): string {
  const parts = Object.fromEntries(
    NEW_YORK_DATE.formatToParts(timestamp)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function credentials(): { keyId: string; secret: string } {
  const keyId = process.env.APCA_API_KEY_ID?.trim();
  const secret = process.env.APCA_API_SECRET_KEY?.trim();
  if (!keyId || !secret) {
    throw new Error(
      "Missing Alpaca credentials. Set APCA_API_KEY_ID and APCA_API_SECRET_KEY in your environment.",
    );
  }
  return { keyId, secret };
}

function validateOptions(options: MarketCaptureOptions): {
  symbol: string;
  maxEvents: number;
  includeTrades: boolean;
  includeQuotes: boolean;
} {
  const symbol = options.symbol.trim().toUpperCase();
  const maxEvents = options.maxEvents ?? 25_000;
  const includeTrades = options.includeTrades ?? true;
  const includeQuotes = options.includeQuotes ?? true;
  if (!/^[A-Z][A-Z.-]{0,14}$/.test(symbol)) {
    throw new Error("SYMBOL must look like a US equity ticker, for example SPY or AAPL.");
  }
  if (!["iex", "sip", "delayed_sip"].includes(options.feed)) {
    throw new Error("ALPACA_FEED must be iex, sip, or delayed_sip.");
  }
  if (!Number.isFinite(options.durationSeconds) || options.durationSeconds < 10) {
    throw new Error("CAPTURE_SECONDS must be at least 10.");
  }
  if (!Number.isInteger(maxEvents) || maxEvents < 1) {
    throw new Error("MAX_EVENTS must be a positive integer.");
  }
  if (!includeTrades && !includeQuotes) {
    throw new Error("At least one of includeTrades or includeQuotes must be true.");
  }
  return { symbol, maxEvents, includeTrades, includeQuotes };
}

const providerId = (value: string | number | undefined): string => String(value ?? "");
const scopedTradeId = (
  feed: AlpacaFeed,
  symbol: string,
  session: string,
  id: string,
): string => `${feed}:${symbol}:${session}:${id}`;

/**
 * Capture observed Alpaca stock events without replacing a failed live run
 * with recorded or generated data.
 *
 * `sequence` is this adapter's local arrival order. Alpaca's documented stock
 * messages do not expose a universal exchange/SIP source sequence, so callers
 * must not relabel it as one.
 */
export async function captureAlpacaMarketData(
  options: MarketCaptureOptions,
): Promise<MarketCaptureResult> {
  const { symbol, maxEvents, includeTrades, includeQuotes } = validateOptions(options);
  const alpaca = new Alpaca(credentials());
  const stream = alpaca.marketData.stockStream({ feed: options.feed, reconnect: false });

  const trades: NormalizedTrade[] = [];
  const tradeArrivals: NormalizedTrade[] = [];
  const quotes: NormalizedQuote[] = [];
  const corrections: NormalizedCorrection[] = [];
  const cancelErrors: NormalizedCancelError[] = [];
  const streamErrors: string[] = [];
  const seenTrades = new Set<string>();
  let arrivalSequence = 0;
  let releaseLimit: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const eventLimit = new Promise<"event_limit">((resolve) => {
    releaseLimit = () => resolve("event_limit");
  });
  const duration = new Promise<"duration">((resolve) => {
    timer = setTimeout(() => resolve("duration"), options.durationSeconds * 1000);
  });
  const nextSequence = (): number => {
    arrivalSequence += 1;
    if (arrivalSequence >= maxEvents) releaseLimit?.();
    return arrivalSequence;
  };

  stream.onError((message) => streamErrors.push(String(message)));
  stream.onTrade((trade) => {
    if (!includeTrades || trade.symbol !== symbol || arrivalSequence >= maxEvents) return;
    const timestamp = trade.timestamp.toISOString();
    const session = sessionDate(trade.timestamp);
    const exactId = providerId(trade.idRaw ?? trade.id);
    const normalized: NormalizedTrade = {
      tradeId: scopedTradeId(options.feed, symbol, session, exactId),
      providerTradeId: exactId,
      timestamp,
      sourceTimestampRaw: trade.timestampRaw,
      session,
      symbol,
      price: trade.price,
      volume: trade.size,
      currency: "USD",
      sequence: nextSequence(),
      receivedAt: new Date().toISOString(),
      exchange: trade.exchange,
      conditions: [...trade.conditions],
      tape: trade.tape,
      source: "alpaca",
      feed: options.feed,
    };
    tradeArrivals.push(normalized);
    if (!seenTrades.has(normalized.tradeId)) {
      seenTrades.add(normalized.tradeId);
      trades.push(normalized);
    }
  });
  stream.onQuote((quote) => {
    if (!includeQuotes || quote.symbol !== symbol || arrivalSequence >= maxEvents) return;
    quotes.push({
      timestamp: quote.timestamp.toISOString(),
      sourceTimestampRaw: quote.timestampRaw,
      receivedAt: new Date().toISOString(),
      sequence: nextSequence(),
      session: sessionDate(quote.timestamp),
      symbol,
      bid: quote.bidPrice,
      ask: quote.askPrice,
      bidSize: quote.bidSize,
      askSize: quote.askSize,
      bidExchange: quote.bidExchange,
      askExchange: quote.askExchange,
      conditions: [...quote.conditions],
      tape: quote.tape,
      source: "alpaca",
      feed: options.feed,
    });
  });
  stream.onCorrection((correction) => {
    if (!includeTrades || correction.symbol !== symbol || arrivalSequence >= maxEvents) return;
    const timestamp = correction.timestamp.toISOString();
    const session = sessionDate(correction.timestamp);
    const originalId = providerId(correction.originalIdRaw ?? correction.originalId);
    const correctedId = providerId(correction.correctedIdRaw ?? correction.correctedId);
    corrections.push({
      timestamp,
      sourceTimestampRaw: correction.timestampRaw,
      receivedAt: new Date().toISOString(),
      sequence: nextSequence(),
      session,
      symbol,
      originalTradeId: scopedTradeId(options.feed, symbol, session, originalId),
      originalProviderTradeId: originalId,
      originalPrice: correction.originalPrice,
      originalSize: correction.originalSize,
      correctedTradeId: scopedTradeId(options.feed, symbol, session, correctedId),
      correctedProviderTradeId: correctedId,
      correctedPrice: correction.correctedPrice,
      correctedSize: correction.correctedSize,
      exchange: correction.exchange,
      originalConditions: [...correction.originalConditions],
      correctedConditions: [...correction.correctedConditions],
      tape: correction.tape,
      source: "alpaca",
      feed: options.feed,
    });
  });
  stream.onCancelError((event) => {
    if (!includeTrades || event.symbol !== symbol || arrivalSequence >= maxEvents) return;
    const timestamp = event.timestamp.toISOString();
    const session = sessionDate(event.timestamp);
    const exactId = providerId(event.idRaw ?? event.id);
    cancelErrors.push({
      timestamp,
      sourceTimestampRaw: event.timestampRaw,
      receivedAt: new Date().toISOString(),
      sequence: nextSequence(),
      session,
      symbol,
      tradeId: scopedTradeId(options.feed, symbol, session, exactId),
      providerTradeId: exactId,
      action: event.action === "E" ? "ERROR" : "CANCEL",
      exchange: event.exchange,
      price: event.price,
      size: event.size,
      tape: event.tape,
      source: "alpaca",
      feed: options.feed,
    });
  });

  stream.connect();
  const authentication = await stream.waitForAuthenticationResult(10_000);
  if (!authentication.authenticated) {
    if (timer) clearTimeout(timer);
    stream.disconnect();
    throw new Error(`Alpaca stream authentication failed: ${authentication.message}`);
  }

  if (includeTrades) stream.subscribeForTrades([symbol]);
  if (includeQuotes) stream.subscribeForQuotes([symbol]);
  const stoppedBy = await Promise.race([duration, eventLimit]);
  if (timer) clearTimeout(timer);
  stream.disconnect();

  if (trades.length === 0 && quotes.length === 0) {
    const detail = streamErrors.at(-1);
    throw new Error(
      detail
        ? `Alpaca returned no market events. Last stream error: ${detail}`
        : `Alpaca returned no ${symbol} trades or quotes. Try again while the selected feed is active.`,
    );
  }

  const orderedTrades = [...trades]
    .sort((left, right) =>
      Date.parse(left.timestamp) - Date.parse(right.timestamp) || left.sequence - right.sequence,
    )
    .map((trade, index) => ({ ...trade, sequence: index + 1 }));

  return {
    trades: orderedTrades,
    tradeArrivals,
    quotes,
    corrections,
    cancelErrors,
    stoppedBy,
    streamErrors,
  };
}

/** Preserve Day 1's original trade-only API and conservative correction rule. */
export async function captureAlpacaTrades(options: CaptureOptions): Promise<CaptureResult> {
  const capture = await captureAlpacaMarketData({
    symbol: options.symbol,
    feed: options.feed,
    durationSeconds: options.durationSeconds,
    maxEvents: options.maxTrades ?? 10_000,
    includeTrades: true,
    includeQuotes: false,
  });
  if (capture.corrections.length > 0 || capture.cancelErrors.length > 0) {
    throw new Error(
      `The capture received ${capture.corrections.length} correction(s) and ` +
      `${capture.cancelErrors.length} cancel/error event(s). This introductory build refuses ` +
      "to publish bars until those events are reconciled.",
    );
  }
  return {
    trades: capture.trades,
    stoppedBy: capture.stoppedBy === "event_limit" ? "trade_limit" : "duration",
  };
}

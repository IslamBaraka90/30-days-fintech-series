export type MarketDataProvider = "alpaca" | "finnhub" | "fmp";
export type IdentityBasis = "provider" | "adapter-arrival";
export type SequenceBasis = "adapter-arrival";

export interface ProviderCapabilities {
  provider: MarketDataProvider;
  feed: string;
  endpoint: string;
  trades: boolean;
  quotes: boolean;
  corrections: boolean;
  cancelErrorsOrBreaks: boolean;
  providerTradeIds: boolean;
  sourceSequence: boolean;
  notes: string[];
}

export interface NormalizedTrade {
  tradeId: string;
  providerTradeId?: string;
  identityBasis?: IdentityBasis;
  timestamp: string;
  sourceTimestampRaw?: string;
  session: string;
  symbol: string;
  price: number;
  volume: number;
  currency: "USD";
  sequence: number;
  sequenceBasis?: SequenceBasis;
  receivedAt: string;
  exchange?: string;
  conditions: string[];
  tape?: string;
  source: MarketDataProvider;
  feed: string;
  providerEventType?: string;
}

export interface NormalizedQuote {
  timestamp: string;
  sourceTimestampRaw?: string;
  receivedAt: string;
  sequence: number;
  sequenceBasis?: SequenceBasis;
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
  source: MarketDataProvider;
  feed: string;
  providerEventType?: string;
}

export interface NormalizedCorrection {
  timestamp: string;
  sourceTimestampRaw?: string;
  receivedAt: string;
  sequence: number;
  sequenceBasis?: SequenceBasis;
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
  source: MarketDataProvider;
  feed: string;
  providerEventType?: string;
}

export interface NormalizedCancelError {
  timestamp: string;
  sourceTimestampRaw?: string;
  receivedAt: string;
  sequence: number;
  sequenceBasis?: SequenceBasis;
  session: string;
  symbol: string;
  tradeId: string;
  providerTradeId?: string;
  identityBasis?: IdentityBasis;
  action: "CANCEL" | "ERROR";
  exchange?: string;
  price: number;
  size: number;
  tape?: string;
  source: MarketDataProvider;
  feed: string;
  providerEventType?: string;
}

export interface MarketCaptureResult {
  provider: ProviderCapabilities;
  trades: NormalizedTrade[];
  tradeArrivals: NormalizedTrade[];
  quotes: NormalizedQuote[];
  corrections: NormalizedCorrection[];
  cancelErrors: NormalizedCancelError[];
  stoppedBy: "duration" | "event_limit";
  streamErrors: string[];
}

const NEW_YORK_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function sessionDate(timestamp: Date): string {
  const parts = Object.fromEntries(
    NEW_YORK_DATE.formatToParts(timestamp)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function epochTimestamp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Provider timestamp must be a positive finite epoch value; received ${value}.`);
  }
  const milliseconds = value >= 100_000_000_000 ? value : value * 1_000;
  const parsed = new Date(milliseconds);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Provider timestamp could not be parsed: ${value}.`);
  }
  return parsed.toISOString();
}

export function validateCaptureOptions(options: {
  symbol: string;
  durationSeconds: number;
  maxEvents?: number;
  includeTrades?: boolean;
  includeQuotes?: boolean;
}): {
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

export function requireCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing provider credential. Set ${name} in your environment.`);
  }
  return value;
}

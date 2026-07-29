import type {
  NormalizedCancelError,
  NormalizedCorrection,
  NormalizedQuote,
  NormalizedTrade,
} from "./providers/types.ts";
import { alpacaCapabilities } from "./providers/alpaca.ts";
import type { BarInput, QualityInput } from "./quality.ts";

const session = "2026-07-29";
const symbol = "TEST";
const feed = "iex" as const;
const source = "alpaca" as const;
const baseMs = Date.parse("2026-07-29T14:30:00.000Z");
const at = (milliseconds: number): string => new Date(baseMs + milliseconds).toISOString();
const prices = [
  100.00, 100.01, 115.00, 100.02, 100.01, 100.00, 100.02,
  100.03, 100.01, 115.00, 100.02, 100.01, 100.00, 100.02,
];

export const fixtureTrades: NormalizedTrade[] = prices.map((price, index) => ({
  tradeId: `${feed}:${symbol}:${session}:p${index}`,
  providerTradeId: `p${index}`,
  timestamp: at(index * 250),
  session,
  symbol,
  price,
  volume: 100 + index,
  currency: "USD",
  sequence: index + 1,
  receivedAt: at(index * 250 + 20),
  exchange: "X",
  conditions: [],
  source,
  feed,
}));

const duplicateArrival: NormalizedTrade = { ...fixtureTrades[0] };
export const fixtureTradeArrivals = [fixtureTrades[0], duplicateArrival, ...fixtureTrades.slice(1)];

export const fixtureQuotes: NormalizedQuote[] = [
  { bid: 100.00, ask: 100.02, bidSize: 3, askSize: 2 },
  { bid: 100.01, ask: 100.01, bidSize: 2, askSize: 2 },
  { bid: 100.03, ask: 100.02, bidSize: 1, askSize: 4 },
  { bid: 100.03, ask: 100.04, bidSize: 1, askSize: 1 },
].map((quote, index) => ({
  ...quote,
  timestamp: at(index * 800),
  receivedAt: at(index * 800 + 40),
  sequence: 100 + index,
  session,
  symbol,
  bidExchange: "B",
  askExchange: "A",
  conditions: [],
  source,
  feed,
}));

export const fixtureCorrections: NormalizedCorrection[] = [{
  timestamp: at(4000),
  receivedAt: at(4020),
  sequence: 200,
  session,
  symbol,
  originalTradeId: fixtureTrades[0].tradeId,
  originalProviderTradeId: "p0",
  originalPrice: 100,
  originalSize: 100,
  correctedTradeId: `${feed}:${symbol}:${session}:p0c`,
  correctedProviderTradeId: "p0c",
  correctedPrice: 100.01,
  correctedSize: 150,
  exchange: "X",
  originalConditions: [],
  correctedConditions: [],
  source,
  feed,
}];

export const fixtureCancelErrors: NormalizedCancelError[] = [{
  timestamp: at(4500),
  receivedAt: at(4520),
  sequence: 201,
  session,
  symbol,
  tradeId: fixtureTrades[1].tradeId,
  providerTradeId: "p1",
  action: "CANCEL",
  exchange: "X",
  price: fixtureTrades[1].price,
  size: fixtureTrades[1].volume,
  source,
  feed,
}];

export const fixtureBars: BarInput[] = [
  {
    timestamp: at(0),
    open: 100,
    high: 100.10,
    low: 99.95,
    close: 100.05,
    volume: 1_000,
    source: "labeled-synthetic-fixture",
    symbol,
    bar_id: "valid",
  },
  {
    timestamp: at(10_000),
    open: 100,
    high: 99.90,
    low: 99.80,
    close: 100.05,
    volume: 1_000,
    source: "labeled-synthetic-fixture",
    symbol,
    bar_id: "high-below-body",
  },
];

export const fixtureInput: QualityInput = {
  sourceLabel: "labeled deterministic failure laboratory (not provider output)",
  capabilities: alpacaCapabilities("iex"),
  trades: fixtureTrades,
  tradeArrivals: fixtureTradeArrivals,
  quotes: fixtureQuotes,
  corrections: fixtureCorrections,
  cancelErrors: fixtureCancelErrors,
  captureEnd: at(7000),
  intervalSeconds: 2,
  barsOverride: fixtureBars,
  clockSyncVerified: true,
  sessionState: "ACTIVE",
  activityExpected: true,
  staleConfig: {
    max_source_event_age_ms: 1_200,
    max_transport_age_ms: 250,
    unchanged_threshold_ms: 3_000,
    heartbeat_timeout_ms: 1_200,
  },
};

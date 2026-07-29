import type {
  MarketCaptureResult,
  MarketDataProvider,
} from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";

function capture(
  provider: MarketDataProvider,
  offsetMs: number,
  prices: [number, number],
): MarketCaptureResult {
  const rows = prices.map((price, index) => {
    const timestamp = new Date(Date.parse("2025-01-02T14:30:00.000Z") + index * 1_000 + offsetMs).toISOString();
    return {
      tradeId: `${provider}-${index}`,
      timestamp,
      session: "2025-01-02",
      symbol: "SPY",
      price,
      volume: 100,
      currency: "USD" as const,
      sequence: index + 1,
      receivedAt: new Date(Date.parse(timestamp) + 20).toISOString(),
      conditions: [],
      source: provider,
      feed: "fixture",
    };
  });
  return {
    provider: {
      provider,
      feed: "fixture",
      endpoint: `fixture://${provider}`,
      trades: true,
      quotes: false,
      corrections: false,
      cancelErrorsOrBreaks: false,
      providerTradeIds: false,
      sourceSequence: false,
      notes: ["Deterministic teaching fixture."],
    },
    trades: rows,
    tradeArrivals: rows,
    quotes: [],
    corrections: [],
    cancelErrors: [],
    stoppedBy: "duration",
    streamErrors: [],
  };
}

export const MULTI_SOURCE_FIXTURE = [
  capture("alpaca", 0, [590, 590.02]),
  capture("finnhub", 50, [590.01, 590.01]),
  capture("fmp", 100, [589.99, 590]),
];

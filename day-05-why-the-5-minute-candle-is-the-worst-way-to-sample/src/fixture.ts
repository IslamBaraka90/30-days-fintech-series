import type { NormalizedTrade } from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";

export const BAR_FIXTURE: NormalizedTrade[] = Array.from({ length: 240 }, (_, index) => {
  const burst = Math.floor(index / 12) % 2 === 0 ? 1 : -1;
  const price = 590 + burst * (index % 12) * 0.01 + Math.floor(index / 24) * 0.005;
  return {
    tradeId: `fixture-${index + 1}`,
    timestamp: new Date(Date.parse("2025-01-02T14:30:00.000Z") + index * 250).toISOString(),
    session: "2025-01-02",
    symbol: "SPY",
    price,
    volume: 20 + (index % 5) * 10,
    currency: "USD",
    sequence: index + 1,
    receivedAt: new Date(Date.parse("2025-01-02T14:30:00.020Z") + index * 250).toISOString(),
    conditions: [],
    source: "alpaca",
    feed: "fixture",
  };
});

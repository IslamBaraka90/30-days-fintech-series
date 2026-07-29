import assert from "node:assert/strict";

import { compareBarRules } from "./bars.ts";
import type { NormalizedTrade } from "./types.ts";

const trades: NormalizedTrade[] = Array.from({ length: 12 }, (_, index) => ({
  tradeId: `test:${index + 1}`,
  timestamp: new Date(Date.UTC(2026, 6, 28, 13, 30, index)).toISOString(),
  session: "2026-07-28",
  symbol: "TEST",
  price: 100 + index,
  volume: 10,
  currency: "USD",
  sequence: index + 1,
  receivedAt: new Date(Date.UTC(2026, 6, 28, 13, 30, index, 5)).toISOString(),
  exchange: "TEST",
  conditions: [],
  source: "alpaca",
  feed: "iex",
}));

const comparison = compareBarRules(trades, 12, 3);

assert.equal(comparison.targetBars, 4);
assert.deepEqual(
  comparison.rules.map((row) => row.rule),
  ["time", "tick", "volume", "dollar"],
);
assert.equal(comparison.rules[0].ruleClosed, 3);
assert.equal(comparison.rules[0].partial, 1);
assert.equal(comparison.rules[1].threshold, "3 trades");
assert.equal(comparison.rules[1].ruleClosed, 4);
assert.equal(comparison.rules[2].threshold, "30 shares");
assert.equal(comparison.rules[2].ruleClosed, 4);
assert.ok(comparison.rules.every((row) => row.bars === row.ruleClosed + row.partial));
assert.ok(comparison.rules.every((row) => Number.isFinite(row.firstBar.close)));

console.log("Article #1 bar comparison: 12 labeled test trades passed all assertions.");

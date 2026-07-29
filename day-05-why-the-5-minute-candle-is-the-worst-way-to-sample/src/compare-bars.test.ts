import assert from "node:assert/strict";
import test from "node:test";

import { compareBarClocks } from "./compare-bars.ts";
import { BAR_FIXTURE } from "./fixture.ts";

test("all four clocks consume the same observed trade lineage", () => {
  const report = compareBarClocks(
    BAR_FIXTURE,
    { "2025-01-02": "2025-01-02T14:30:00.000Z" },
    {
      intervalSeconds: 30,
      initialTickSign: 1,
      initialExpectedTicks: 20,
      initialExpectedTickImbalance: 0.5,
      initialExpectedSignedVolume: 10,
      initialBuyProbability: 0.5,
    },
  );
  assert.equal(report.input.trades, 240);
  assert.equal(report.bars.time.length, 2);
  assert.equal(report.bars.tickImbalance.length > 1, true);
  assert.equal(report.bars.volumeImbalance.length > 1, true);
  assert.equal(report.bars.tickRun.length > 1, true);
});

test("provider tapes cannot be silently merged", () => {
  const mixed = [
    BAR_FIXTURE[0],
    { ...BAR_FIXTURE[1], source: "finnhub" as const },
  ];
  assert.throws(
    () => compareBarClocks(mixed, { "2025-01-02": "2025-01-02T14:30:00.000Z" }),
    /Do not merge provider tapes/,
  );
});

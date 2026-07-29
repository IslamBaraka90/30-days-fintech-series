import assert from "node:assert/strict";

import { fixtureInput } from "./fixture.ts";
import { runQualityGate } from "./quality.ts";

const report = runQualityGate(fixtureInput);

assert.equal(report.barValidation.filter((row) => !row.valid).length, 1);
assert.deepEqual(
  report.barValidation.find((row) => !row.valid)?.issues,
  ["HIGH_BELOW_BODY"],
);

assert.ok(report.hampel.some((row) => row.status === "insufficient_history"));
assert.ok(report.hampel.some((row) => row.flagged));
assert.ok(report.hampel.every((row) => row.lookaheadUsed === false));
assert.ok(report.mad.points.filter((row) => row.outlier).length >= 2);

assert.deepEqual(
  report.markets.map((row) => row.state),
  ["NORMAL", "LOCKED", "CROSSED", "NORMAL"],
);

assert.ok(report.lifecycle.result);
const lifecycleDecisions = report.lifecycle.result.audit.map((row) => row.decision);
assert.ok(lifecycleDecisions.includes("DROP_REPLAY"));
assert.ok(lifecycleDecisions.includes("APPLY_CORRECTION"));
assert.ok(lifecycleDecisions.includes("APPLY_CANCEL"));
assert.equal(report.lifecycle.result.tombstones.length, 1);

assert.equal(report.staleness.status, "ok");
if (report.staleness.status === "ok") {
  const final = report.staleness.rows.at(-1)!;
  assert.equal(final.usable_for_active_market, false);
  assert.ok(final.reasons.includes("HEARTBEAT_TIMEOUT"));
}

assert.ok(report.findings.some((row) => row.stage === "ohlc"));
assert.ok(report.findings.some((row) => row.stage === "quotes" && row.rule === "CROSSED"));
assert.ok(report.findings.some((row) => row.stage === "trades" && row.rule === "DROP_REPLAY"));
assert.ok(report.findings.some((row) => row.stage === "staleness"));

console.log(
  `Article #2 quality gate: ${report.findings.length} labeled findings across all six stages passed.`,
);

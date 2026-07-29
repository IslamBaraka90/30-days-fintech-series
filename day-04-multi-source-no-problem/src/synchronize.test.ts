import assert from "node:assert/strict";
import test from "node:test";

import { MULTI_SOURCE_FIXTURE } from "./fixture.ts";
import { synchronizeCaptures } from "./synchronize.ts";

test("three provider streams form a contract-compatible consensus", () => {
  const report = synchronizeCaptures(MULTI_SOURCE_FIXTURE);
  assert.deepEqual(report.providers, ["alpaca", "finnhub", "fmp"]);
  assert.equal(report.consensus.status, "consensus");
  assert.equal(report.refreshTime.rows.length > 0, true);
  assert.equal(report.calendar.aligned.every((row) => row.status === "in_session"), true);
  assert.equal(report.asynchronousReturns.diagnostic_only, true);
});

test("provider loss is visible and never replaced by fixture data", () => {
  const report = synchronizeCaptures(MULTI_SOURCE_FIXTURE.slice(0, 2));
  assert.equal(report.providers.length, 2);
  assert.equal(report.consensus.diagnostics.observed_source_count, 2);
});

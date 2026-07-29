import assert from "node:assert/strict";
import test from "node:test";

import { assessCaptureHealth } from "./health.ts";
import { HEALTH_FIXTURE } from "./fixture.ts";

test("a synchronized deterministic capture is healthy", () => {
  const report = assessCaptureHealth(HEALTH_FIXTURE, {
    clockProfile: {
      source_clock_domain: "fixture",
      ingress_clock_domain: "fixture",
      ready_clock_domain: "fixture",
      source_timestamp_owner: "fixture",
      ingress_timestamp_owner: "fixture",
      ready_timestamp_owner: "fixture",
      cross_domain_sync_status: "synchronized",
      max_abs_offset_ms: 0,
    },
    warningMs: 50,
    criticalMs: 100,
  });
  assert.equal(report.verdict, "healthy");
  assert.equal(report.schema.status, "unchanged");
  assert.equal(report.gap.classification, "present");
  assert.equal(report.pointInTime.leakage.length, 0);
});

test("unverified clocks cannot produce a healthy latency verdict", () => {
  const report = assessCaptureHealth(HEALTH_FIXTURE, {
    clockProfile: {
      source_clock_domain: "provider",
      ingress_clock_domain: "consumer",
      ready_clock_domain: "consumer",
      source_timestamp_owner: "provider",
      ingress_timestamp_owner: "us",
      ready_timestamp_owner: "us",
      cross_domain_sync_status: "unknown",
      max_abs_offset_ms: null,
    },
  });
  assert.equal(report.verdict, "attention");
  assert.equal(report.latencyTrustworthy, false);
  assert.equal(report.latency.counts.clock_untrusted, 2);
});

test("a negative observed latency is treated as a clock error", () => {
  const capture = structuredClone(HEALTH_FIXTURE);
  capture.tradeArrivals[0].receivedAt = "2025-01-02T14:29:59.999Z";
  capture.trades = [...capture.tradeArrivals];
  const report = assessCaptureHealth(capture, {
    clockProfile: {
      source_clock_domain: "fixture",
      ingress_clock_domain: "fixture",
      ready_clock_domain: "fixture",
      source_timestamp_owner: "fixture",
      ingress_timestamp_owner: "fixture",
      ready_timestamp_owner: "fixture",
      cross_domain_sync_status: "synchronized",
      max_abs_offset_ms: 0,
    },
  });
  assert.equal(report.verdict, "attention");
  assert.equal(report.latencyTrustworthy, false);
  assert.equal(report.latency.counts.clock_error_negative_latency, 1);
});

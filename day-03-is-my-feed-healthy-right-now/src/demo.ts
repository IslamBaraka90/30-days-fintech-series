import { assessCaptureHealth } from "./health.ts";
import { HEALTH_FIXTURE } from "./fixture.ts";

const report = assessCaptureHealth(HEALTH_FIXTURE, {
  clockProfile: {
    source_clock_domain: "fixture-clock",
    ingress_clock_domain: "fixture-clock",
    ready_clock_domain: "fixture-clock",
    source_timestamp_owner: "fixture",
    ingress_timestamp_owner: "fixture",
    ready_timestamp_owner: "fixture",
    cross_domain_sync_status: "synchronized",
    max_abs_offset_ms: 0,
  },
  warningMs: 50,
  criticalMs: 100,
});

console.log(JSON.stringify({ fixture: true, ...report }, null, 2));

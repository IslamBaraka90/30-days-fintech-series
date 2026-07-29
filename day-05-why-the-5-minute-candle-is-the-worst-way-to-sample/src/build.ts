import { alignEvents } from "fintech-algorithms/market-data-engineering/time-synchronization/exchange-calendar-alignment";

import {
  captureMarketData,
  capabilitiesFor,
  providerFromEnvironment,
} from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";
import { assessCaptureHealth, clockProfileFromEnvironment } from "../../day-03-is-my-feed-healthy-right-now/src/health.ts";
import { configuredCalendar } from "../../day-04-multi-source-no-problem/src/synchronize.ts";
import { compareBarClocks, TEACHING_PRIORS } from "./compare-bars.ts";

const provider = providerFromEnvironment();
const capabilities = capabilitiesFor(provider);
const capture = await captureMarketData({
  provider,
  symbol: (process.env.SYMBOL ?? "SPY").trim().toUpperCase(),
  durationSeconds: Number(process.env.CAPTURE_SECONDS ?? "60"),
  maxEvents: Number(process.env.MAX_EVENTS ?? "50000"),
  includeTrades: true,
  includeQuotes: capabilities.quotes,
});
const health = assessCaptureHealth(capture, {
  clockProfile: clockProfileFromEnvironment(),
});
if (capture.trades.length === 0) throw new Error("The selected provider returned no trades.");

const calendar = configuredCalendar(capture.trades);
const aligned = alignEvents(
  capture.trades.map((trade, index) => ({
    event_id: `${trade.source}:${trade.tradeId}:${index}`,
    timestamp: trade.timestamp,
    event_kind: "continuous",
  })),
  calendar,
);
const eligibleIds = new Set(
  aligned.filter((event) => event.eligible).map((event) => event.event_id),
);
const regularTrades = capture.trades.filter((trade, index) =>
  eligibleIds.has(`${trade.source}:${trade.tradeId}:${index}`),
);
if (regularTrades.length === 0) {
  throw new Error(
    "No trades fell inside the configured 09:30–16:00 America/New_York session. Retry during regular hours or use the deterministic demo.",
  );
}
const sessionStarts = Object.fromEntries(
  calendar.sessions.map((session) => [session.session_date, session.open]),
);
const intervalSeconds = Number(process.env.TIME_BAR_SECONDS ?? String(TEACHING_PRIORS.intervalSeconds));

console.log(JSON.stringify({
  live: true,
  health: {
    verdict: health.verdict,
    latencyTrustworthy: health.latencyTrustworthy,
    schema: health.schema.status,
    gap: health.gap.classification,
  },
  calendarProvenance:
    "configured teaching schedule; use an official, versioned exchange calendar in production",
  excludedOutsideConfiguredSession: capture.trades.length - regularTrades.length,
  comparison: compareBarClocks(
    regularTrades,
    sessionStarts,
    { ...TEACHING_PRIORS, intervalSeconds },
  ),
}, null, 2));

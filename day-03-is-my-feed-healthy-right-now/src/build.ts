import {
  captureMarketData,
  capabilitiesFor,
  providerFromEnvironment,
} from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";
import { assessCaptureHealth, clockProfileFromEnvironment } from "./health.ts";

const provider = providerFromEnvironment();
const capabilities = capabilitiesFor(provider);
const symbol = (process.env.SYMBOL ?? "SPY").trim().toUpperCase();
const durationSeconds = Number(process.env.CAPTURE_SECONDS ?? "30");
const maxEvents = Number(process.env.MAX_EVENTS ?? "25000");

const capture = await captureMarketData({
  provider,
  symbol,
  durationSeconds,
  maxEvents,
  includeTrades: true,
  includeQuotes: capabilities.quotes,
});

const report = assessCaptureHealth(capture, {
  clockProfile: clockProfileFromEnvironment(),
  warningMs: Number(process.env.LATENCY_WARNING_MS ?? "250"),
  criticalMs: Number(process.env.LATENCY_CRITICAL_MS ?? "1000"),
});

console.log(JSON.stringify(report, null, 2));

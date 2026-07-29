import {
  captureMarketData,
  capabilitiesFor,
  MARKET_DATA_PROVIDERS,
  type MarketCaptureResult,
  type MarketDataProvider,
} from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";
import { assessCaptureHealth, clockProfileFromEnvironment } from "../../day-03-is-my-feed-healthy-right-now/src/health.ts";
import { synchronizeCaptures } from "./synchronize.ts";

function selectedProviders(): MarketDataProvider[] {
  const values = (process.env.MARKET_DATA_PROVIDERS ?? MARKET_DATA_PROVIDERS.join(","))
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (values.some((value) => !MARKET_DATA_PROVIDERS.includes(value as MarketDataProvider))) {
    throw new Error("MARKET_DATA_PROVIDERS must be a comma-separated subset of alpaca,finnhub,fmp.");
  }
  return [...new Set(values)] as MarketDataProvider[];
}

const clockProfile = clockProfileFromEnvironment();
if (clockProfile.cross_domain_sync_status !== "synchronized") {
  throw new Error(
    "Day 4 compares provider event times. Verify clock synchronization, then set CLOCK_SYNC_VERIFIED=true and CLOCK_MAX_OFFSET_MS.",
  );
}
const providers = selectedProviders();
if (providers.length < 2) throw new Error("Select at least two providers for Day 4.");
const symbol = (process.env.SYMBOL ?? "SPY").trim().toUpperCase();
const durationSeconds = Number(process.env.CAPTURE_SECONDS ?? "30");
const maxEvents = Number(process.env.MAX_EVENTS ?? "25000");

const settled = await Promise.allSettled(
  providers.map(async (provider) => {
    const capabilities = capabilitiesFor(provider);
    return await captureMarketData({
      provider,
      symbol,
      durationSeconds,
      maxEvents,
      includeTrades: true,
      includeQuotes: capabilities.quotes,
    });
  }),
);
const captures: MarketCaptureResult[] = [];
const failures: Array<{ provider: MarketDataProvider; error: string }> = [];
settled.forEach((result, index) => {
  if (result.status === "fulfilled") captures.push(result.value);
  else failures.push({ provider: providers[index], error: String(result.reason) });
});
if (captures.length < 2) {
  throw new Error(`Provider quorum failed: ${JSON.stringify(failures)}`);
}
const health = captures.map((capture) =>
  assessCaptureHealth(capture, { clockProfile }),
);
if (health.some((report) => !report.latencyTrustworthy)) {
  throw new Error("At least one successful capture has untrustworthy timestamps; refusing cross-provider alignment.");
}

console.log(JSON.stringify({
  live: true,
  failures,
  health: health.map((report) => ({
    provider: report.provider.provider,
    verdict: report.verdict,
    latencyTrustworthy: report.latencyTrustworthy,
    sequenceGaps: report.latency.sequence_gaps,
  })),
  synchronization: synchronizeCaptures(captures, Number(process.env.MAX_SOURCE_AGE_MS ?? "5000")),
}, null, 2));

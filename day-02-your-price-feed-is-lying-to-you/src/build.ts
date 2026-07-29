import {
  capabilitiesFor,
  captureMarketData,
  providerFromEnvironment,
} from "./providers/index.ts";
import type { AlpacaFeed } from "./providers/alpaca.ts";
import { runQualityGate } from "./quality.ts";
import { formatQualityReport } from "./report.ts";

const symbol = (process.env.SYMBOL ?? "SPY").trim().toUpperCase();
const provider = providerFromEnvironment();
const alpacaFeed = (process.env.ALPACA_FEED ?? "iex") as AlpacaFeed;
const durationSeconds = Number(process.env.CAPTURE_SECONDS ?? 60);
const maxEvents = Number(process.env.MAX_EVENTS ?? 25_000);
const intervalSeconds = Number(process.env.QUALITY_BAR_SECONDS ?? 10);
const clockSyncVerified = process.env.CLOCK_SYNC_VERIFIED === "true";
const sessionState = process.env.MARKET_SESSION_STATE ?? "ACTIVE";
const activityExpected = process.env.ACTIVITY_EXPECTED !== "false";
const capabilities = capabilitiesFor(provider, alpacaFeed);

if (!["ACTIVE", "INACTIVE", "HALTED"].includes(sessionState)) {
  throw new Error("MARKET_SESSION_STATE must be ACTIVE, INACTIVE, or HALTED.");
}

console.log(`Connecting to ${provider.toUpperCase()} ${capabilities.feed} for ${symbol}...`);
console.log(
  `Capturing trades${capabilities.quotes ? " and quotes" : ""} for ` +
  `${durationSeconds} seconds with no synthetic fallback.`,
);

try {
  const capture = await captureMarketData({
    provider,
    symbol,
    alpacaFeed,
    durationSeconds,
    maxEvents,
    includeTrades: true,
    includeQuotes: capabilities.quotes,
  });
  const report = runQualityGate({
    sourceLabel: `observed ${provider} ${capabilities.feed} WebSocket capture for ${symbol}`,
    capabilities: capture.provider,
    trades: capture.trades,
    tradeArrivals: capture.tradeArrivals,
    quotes: capture.quotes,
    corrections: capture.corrections,
    cancelErrors: capture.cancelErrors,
    captureEnd: new Date().toISOString(),
    intervalSeconds,
    clockSyncVerified,
    sessionState: sessionState as "ACTIVE" | "INACTIVE" | "HALTED",
    activityExpected,
  });
  console.log();
  console.log(formatQualityReport(report));
  console.log();
  console.log(`capture stop   ${capture.stoppedBy}`);
  console.log(`corrections    ${capture.corrections.length}`);
  console.log(`cancel/errors  ${capture.cancelErrors.length}`);
  if (!clockSyncVerified && capture.provider.quotes) {
    console.log(
      "freshness      not evaluated; set CLOCK_SYNC_VERIFIED=true only after " +
      "verifying host/source clock synchronization",
    );
  }
} catch (error) {
  console.error();
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    "No recorded or generated data was substituted. " +
    "Run npm run demo:article:2 for the labeled fixture.",
  );
  process.exitCode = 1;
}

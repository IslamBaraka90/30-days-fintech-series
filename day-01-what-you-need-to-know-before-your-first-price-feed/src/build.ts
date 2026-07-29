import { captureAlpacaTrades } from "./alpaca.ts";
import { compareBarRules } from "./bars.ts";
import type { AlpacaFeed } from "./types.ts";

const SYMBOL = (process.env.SYMBOL ?? "SPY").toUpperCase();
const FEED = (process.env.ALPACA_FEED ?? "iex") as AlpacaFeed;
const CAPTURE_SECONDS = Number(process.env.CAPTURE_SECONDS ?? 60);
const TIME_BAR_SECONDS = Number(process.env.TIME_BAR_SECONDS ?? 10);
const MAX_TRADES = Number(process.env.MAX_TRADES ?? 10_000);

if (!["iex", "sip", "delayed_sip"].includes(FEED)) {
  throw new Error("ALPACA_FEED must be iex, sip, or delayed_sip.");
}

const number = (value: number): string => Math.round(value).toLocaleString("en-US");
const money = (value: number): string =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pad = (value: string | number, width: number): string => String(value).padStart(width);
const padRight = (value: string | number, width: number): string => String(value).padEnd(width);
const clock = (timestamp: string): string => timestamp.slice(11, 19);

console.log(`Connecting to Alpaca's ${FEED.toUpperCase()} trade feed for ${SYMBOL}...`);
console.log(`Capturing up to ${number(MAX_TRADES)} trades for ${CAPTURE_SECONDS} seconds.`);

try {
  const capture = await captureAlpacaTrades({
    symbol: SYMBOL,
    feed: FEED,
    durationSeconds: CAPTURE_SECONDS,
    maxTrades: MAX_TRADES,
  });
  const comparison = compareBarRules(capture.trades, CAPTURE_SECONDS, TIME_BAR_SECONDS);
  const first = capture.trades[0];
  const last = capture.trades.at(-1)!;

  console.log();
  console.log("LIVE CAPTURE");
  console.log(`source       Alpaca Market Data WebSocket (${FEED})`);
  console.log(`symbol       ${SYMBOL}`);
  console.log(`trades       ${number(capture.trades.length)} (${capture.stoppedBy})`);
  console.log(`event time   ${first.timestamp} to ${last.timestamp}`);
  console.log(`volume       ${number(comparison.totalVolume)} shares`);
  console.log(`notional     ${money(comparison.totalNotional)}`);
  console.log(`first trade  ${clock(first.timestamp)}  ${first.price} x ${number(first.volume)}  ${first.exchange}`);

  console.log();
  console.log("ONE TAPE, FOUR BAR-CLOSING RULES");
  console.log(
    padRight("rule", 10) +
      padRight("threshold", 20) +
      pad("bars", 7) +
      pad("rule", 7) +
      pad("partial", 10) +
      pad("first ticks", 13),
  );
  for (const row of comparison.rules) {
    console.log(
      padRight(row.rule, 10) +
        padRight(row.threshold, 20) +
        pad(row.bars, 7) +
        pad(row.ruleClosed, 7) +
        pad(row.partial, 10) +
        pad(row.firstBar.tickCount, 13),
    );
  }

  console.log();
  console.log("FIRST BAR FROM EACH RULE");
  for (const row of comparison.rules) {
    const bar = row.firstBar;
    console.log(
      `${padRight(row.rule, 8)} ${clock(bar.startTime)}-${clock(bar.endTime)}  ` +
      `O ${bar.open}  H ${bar.high}  L ${bar.low}  C ${bar.close}  ` +
      `${number(bar.volume)} sh  ${bar.closeReason}`,
    );
  }

  console.log();
  console.log("Partial bars were cut off by the capture boundary. Keep them visible; do not");
  console.log("quietly mix them into statistics that assume the closing rule fired.");
} catch (error) {
  console.error();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

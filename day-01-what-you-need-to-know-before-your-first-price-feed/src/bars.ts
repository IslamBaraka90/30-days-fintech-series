import { constructBars as constructTimeBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";
import { constructBars as constructTickBars } from "fintech-algorithms/market-data-engineering/bar-construction/tick-bars";
import { constructBars as constructVolumeBars } from "fintech-algorithms/market-data-engineering/bar-construction/volume-bars";
import { constructBars as constructDollarBars } from "fintech-algorithms/market-data-engineering/bar-construction/dollar-bars";

import type { NormalizedTrade } from "./types.ts";

interface CommonBar {
  startTime: string;
  endTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dollarValue: number;
  tickCount: number;
  closeReason: string;
}

export interface FirstBar {
  startTime: string;
  endTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickCount: number;
  closeReason: string;
}

export interface RuleSummary {
  rule: "time" | "tick" | "volume" | "dollar";
  threshold: string;
  bars: number;
  ruleClosed: number;
  partial: number;
  firstBar: FirstBar;
}

export interface Comparison {
  targetBars: number;
  totalVolume: number;
  totalNotional: number;
  rules: RuleSummary[];
}

function summarize(
  rule: RuleSummary["rule"],
  threshold: string,
  bars: readonly CommonBar[],
): RuleSummary {
  if (bars.length === 0) throw new Error(`${rule} bars returned no output`);
  const ruleClosed = bars.filter(
    (bar) => bar.closeReason === "interval" || bar.closeReason === "threshold",
  ).length;
  const first = bars[0];

  return {
    rule,
    threshold,
    bars: bars.length,
    ruleClosed,
    partial: bars.length - ruleClosed,
    firstBar: {
      startTime: first.startTime,
      endTime: first.endTime,
      open: first.open,
      high: first.high,
      low: first.low,
      close: first.close,
      volume: first.volume,
      tickCount: first.tickCount,
      closeReason: first.closeReason,
    },
  };
}

/**
 * Apply four bar-closing rules to the same captured tape.
 *
 * The threshold rules target roughly the same bar count as the time rule. This
 * keeps the comparison about grouping, not about one rule creating far more
 * observations than another.
 */
export function compareBarRules(
  trades: readonly NormalizedTrade[],
  captureSeconds: number,
  intervalSeconds: number,
): Comparison {
  if (trades.length === 0) throw new Error("At least one trade is required.");
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error("TIME_BAR_SECONDS must be positive.");
  }

  const input = [...trades];
  const totalVolume = input.reduce((sum, trade) => sum + trade.volume, 0);
  const totalNotional = input.reduce((sum, trade) => sum + trade.price * trade.volume, 0);
  const targetBars = Math.max(1, Math.round(captureSeconds / intervalSeconds));
  const targetTicks = Math.max(1, Math.round(input.length / targetBars));
  const targetVolume = Math.max(1, Math.round(totalVolume / targetBars));
  const targetDollar = Math.max(1, Math.round(totalNotional / targetBars));

  // This is a capture-window comparison, so each session is anchored to its
  // first observed trade. Production exchange bars should use an official
  // session calendar and the exchange open instead.
  const sessionStarts = Object.fromEntries(
    [...new Set(input.map((trade) => trade.session))].map((session) => [
      session,
      input.find((trade) => trade.session === session)!.timestamp,
    ]),
  );

  const timeBars = constructTimeBars(input, { intervalSeconds, sessionStarts });
  const tickBars = constructTickBars(input, { targetTicks });
  const volumeBars = constructVolumeBars(input, { targetVolume });
  const dollarBars = constructDollarBars(input, {
    targetDollar,
    currency: "USD",
    priceDecimals: 8,
    quantityDecimals: 0,
  });

  return {
    targetBars,
    totalVolume,
    totalNotional,
    rules: [
      summarize("time", `${intervalSeconds}s`, timeBars),
      summarize("tick", `${targetTicks} trades`, tickBars),
      summarize("volume", `${targetVolume.toLocaleString("en-US")} shares`, volumeBars),
      summarize("dollar", `$${targetDollar.toLocaleString("en-US")}`, dollarBars),
    ],
  };
}

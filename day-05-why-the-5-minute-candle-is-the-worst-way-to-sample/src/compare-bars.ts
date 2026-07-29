import { constructBars as constructTimeBars } from "fintech-algorithms/market-data-engineering/bar-construction/time-bars";
import { constructBars as constructTickImbalanceBars } from "fintech-algorithms/market-data-engineering/bar-construction/tick-imbalance-bars";
import { constructBars as constructVolumeImbalanceBars } from "fintech-algorithms/market-data-engineering/bar-construction/volume-imbalance-bars";
import { constructBars as constructTickRunBars } from "fintech-algorithms/market-data-engineering/bar-construction/tick-run-bars";

import type { NormalizedTrade } from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";

export interface BarPriors {
  intervalSeconds: number;
  initialTickSign: -1 | 1;
  initialExpectedTicks: number;
  initialExpectedTickImbalance: number;
  initialExpectedSignedVolume: number;
  initialBuyProbability: number;
}

export const TEACHING_PRIORS: BarPriors = {
  intervalSeconds: 300,
  initialTickSign: 1,
  initialExpectedTicks: 20,
  initialExpectedTickImbalance: 0.5,
  initialExpectedSignedVolume: 10,
  initialBuyProbability: 0.5,
};

type SummaryBar = {
  tickCount: number;
  volume: number;
  closeReason: string;
  isComplete?: boolean;
};

function summarize(rows: SummaryBar[]) {
  const complete = rows.filter(
    (bar) => bar.isComplete ?? ["interval", "threshold"].includes(bar.closeReason),
  );
  const values = complete.map((bar) => bar.tickCount);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const variance = mean === null || values.length < 2
    ? null
    : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return {
    bars: rows.length,
    completeBars: complete.length,
    partialBars: rows.length - complete.length,
    meanTicksPerCompleteBar: mean,
    tickCountCoefficientOfVariation:
      mean && variance !== null ? Math.sqrt(variance) / mean : null,
    totalVolume: rows.reduce((sum, row) => sum + row.volume, 0),
  };
}

export function compareBarClocks(
  trades: NormalizedTrade[],
  sessionStarts: Record<string, string>,
  priors: BarPriors = TEACHING_PRIORS,
) {
  if (trades.length === 0) throw new Error("Bar comparison needs real normalized trades.");
  const sources = new Set(trades.map((trade) => `${trade.source}:${trade.feed}`));
  if (sources.size !== 1) {
    throw new Error("Do not merge provider tapes. Choose one ordered, corrected trade lineage.");
  }
  const ordered = [...trades].sort(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) ||
      left.sequence - right.sequence ||
      left.tradeId.localeCompare(right.tradeId),
  );
  const common = ordered.map((trade) => ({
    tradeId: trade.tradeId,
    timestamp: trade.timestamp,
    session: trade.session,
    symbol: trade.symbol,
    price: trade.price,
    volume: trade.volume,
    currency: trade.currency,
    sequence: trade.sequence,
  }));
  const bars = {
    time: constructTimeBars(common, {
      intervalSeconds: priors.intervalSeconds,
      sessionStarts,
      closePartial: true,
      emptyBarPolicy: "omit",
    }),
    tickImbalance: constructTickImbalanceBars(common, {
      closePartial: true,
      initialTickSign: priors.initialTickSign,
      initialExpectedTicks: priors.initialExpectedTicks,
      initialExpectedTickImbalance: priors.initialExpectedTickImbalance,
      alphaTicks: 0.2,
      alphaTickImbalance: 0.2,
      thresholdFloor: 4,
      thresholdMultiplier: 1,
    }),
    volumeImbalance: constructVolumeImbalanceBars(common, {
      closePartial: true,
      initialTickSign: priors.initialTickSign,
      initialExpectedTicks: priors.initialExpectedTicks,
      initialExpectedSignedVolume: priors.initialExpectedSignedVolume,
      alphaTicks: 0.2,
      alphaSignedVolume: 0.2,
      thresholdFloorShares: 100,
      thresholdScale: 1,
    }),
    tickRun: constructTickRunBars(common, {
      closePartial: true,
      initialTickSign: priors.initialTickSign,
      initialExpectedTicks: priors.initialExpectedTicks,
      initialBuyProbability: priors.initialBuyProbability,
      alphaTicks: 0.2,
      alphaBuyProbability: 0.2,
      thresholdFloorTicks: 4,
      thresholdMultiplier: 1,
    }),
  };
  return {
    sourceLineage: [...sources][0],
    priors: {
      ...priors,
      provenance:
        "declared teaching priors; calibrate on an earlier, non-overlapping sample before production use",
    },
    input: {
      symbol: ordered[0].symbol,
      trades: ordered.length,
      firstEventTime: ordered[0].timestamp,
      lastEventTime: ordered.at(-1)!.timestamp,
    },
    summaries: Object.fromEntries(
      Object.entries(bars).map(([name, rows]) => [name, summarize(rows)]),
    ),
    bars,
  };
}

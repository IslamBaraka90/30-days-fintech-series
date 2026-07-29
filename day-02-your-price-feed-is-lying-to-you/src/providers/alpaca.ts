import {
  captureAlpacaMarketData as capturePublishedAlpacaMarketData,
  type AlpacaFeed,
} from "../../../shared/data/alpaca.ts";

import type {
  MarketCaptureResult,
  ProviderCapabilities,
} from "./types.ts";

export type { AlpacaFeed } from "../../../shared/data/alpaca.ts";

export interface MarketCaptureOptions {
  symbol: string;
  feed: AlpacaFeed;
  durationSeconds: number;
  maxEvents?: number;
  includeTrades?: boolean;
  includeQuotes?: boolean;
}

export function alpacaCapabilities(feed: AlpacaFeed): ProviderCapabilities {
  return {
    provider: "alpaca",
    feed,
    endpoint: `wss://stream.data.alpaca.markets/v2/${feed}`,
    trades: true,
    quotes: true,
    corrections: true,
    cancelErrorsOrBreaks: true,
    providerTradeIds: true,
    sourceSequence: false,
    notes: [
      "Feed coverage and entitlement depend on the selected Alpaca feed.",
      "The sequence is adapter-local arrival order, not a universal exchange or SIP sequence.",
    ],
  };
}

export async function captureAlpacaMarketData(
  options: MarketCaptureOptions,
): Promise<MarketCaptureResult> {
  const capture = await capturePublishedAlpacaMarketData(options);
  return {
    provider: alpacaCapabilities(options.feed),
    ...capture,
  };
}

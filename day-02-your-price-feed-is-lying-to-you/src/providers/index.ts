import {
  alpacaCapabilities,
  captureAlpacaMarketData,
  type AlpacaFeed,
} from "./alpaca.ts";
import {
  captureFinnhubMarketData,
  finnhubCapabilities,
} from "./finnhub.ts";
import {
  captureFmpMarketData,
  fmpCapabilities,
} from "./fmp.ts";
import type {
  MarketCaptureResult,
  MarketDataProvider,
  ProviderCapabilities,
} from "./types.ts";

export type {
  IdentityBasis,
  MarketCaptureResult,
  MarketDataProvider,
  NormalizedCancelError,
  NormalizedCorrection,
  NormalizedQuote,
  NormalizedTrade,
  ProviderCapabilities,
  SequenceBasis,
} from "./types.ts";

export const MARKET_DATA_PROVIDERS = ["alpaca", "finnhub", "fmp"] as const;

export interface UnifiedMarketCaptureOptions {
  provider: MarketDataProvider;
  symbol: string;
  durationSeconds: number;
  maxEvents?: number;
  includeTrades?: boolean;
  includeQuotes?: boolean;
  alpacaFeed?: AlpacaFeed;
}

export function providerFromEnvironment(): MarketDataProvider {
  const value = (process.env.MARKET_DATA_PROVIDER ?? "alpaca").trim().toLowerCase();
  if (!MARKET_DATA_PROVIDERS.includes(value as MarketDataProvider)) {
    throw new Error("MARKET_DATA_PROVIDER must be alpaca, finnhub, or fmp.");
  }
  return value as MarketDataProvider;
}

export function capabilitiesFor(
  provider: MarketDataProvider,
  alpacaFeed: AlpacaFeed = "iex",
): ProviderCapabilities {
  if (provider === "alpaca") return alpacaCapabilities(alpacaFeed);
  if (provider === "finnhub") return finnhubCapabilities();
  return fmpCapabilities(process.env.FMP_WEBSOCKET_URL?.trim() || undefined);
}

export async function captureMarketData(
  options: UnifiedMarketCaptureOptions,
): Promise<MarketCaptureResult> {
  const common = {
    symbol: options.symbol,
    durationSeconds: options.durationSeconds,
    maxEvents: options.maxEvents,
    includeTrades: options.includeTrades,
    includeQuotes: options.includeQuotes,
  };
  if (options.provider === "alpaca") {
    return await captureAlpacaMarketData({
      ...common,
      feed: options.alpacaFeed ?? "iex",
    });
  }
  if (options.provider === "finnhub") {
    return await captureFinnhubMarketData(common);
  }
  return await captureFmpMarketData(common);
}

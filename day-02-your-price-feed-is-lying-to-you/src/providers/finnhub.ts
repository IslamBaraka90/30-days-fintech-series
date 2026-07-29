import WebSocket, { type RawData } from "ws";

import {
  epochTimestamp,
  requireCredential,
  sessionDate,
  validateCaptureOptions,
  type MarketCaptureResult,
  type NormalizedTrade,
  type ProviderCapabilities,
} from "./types.ts";

const FINNHUB_ENDPOINT = "wss://ws.finnhub.io";
const FINNHUB_FEED = "websocket-trades";

export interface FinnhubCaptureOptions {
  symbol: string;
  durationSeconds: number;
  maxEvents?: number;
  includeTrades?: boolean;
  includeQuotes?: boolean;
}

export interface FinnhubTradeRow {
  s: string;
  p: number;
  t: number;
  v: number;
  c?: unknown[];
}

export interface FinnhubTradeMessage {
  type: "trade";
  data: FinnhubTradeRow[];
}

export function finnhubCapabilities(): ProviderCapabilities {
  return {
    provider: "finnhub",
    feed: FINNHUB_FEED,
    endpoint: FINNHUB_ENDPOINT,
    trades: true,
    quotes: false,
    corrections: false,
    cancelErrorsOrBreaks: false,
    providerTradeIds: false,
    sourceSequence: false,
    notes: [
      "The documented WebSocket Trades endpoint can batch multiple trades in one message.",
      "Trade identity and sequence are adapter-local because this payload does not document them.",
      "One API key can open one WebSocket connection at a time.",
    ],
  };
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Finnhub field ${field} must be a finite number.`);
  }
  return value;
}

export function normalizeFinnhubMessage(
  message: unknown,
  context: { symbol: string; receivedAt: string; startingSequence: number },
): NormalizedTrade[] {
  if (!message || typeof message !== "object") return [];
  const candidate = message as Partial<FinnhubTradeMessage>;
  if (candidate.type !== "trade" || !Array.isArray(candidate.data)) return [];

  const target = context.symbol.toUpperCase();
  const normalized: NormalizedTrade[] = [];
  for (const row of candidate.data) {
    if (!row || typeof row !== "object" || String(row.s).toUpperCase() !== target) continue;
    const timestampValue = finite(row.t, "t");
    const timestamp = epochTimestamp(timestampValue);
    const sequence = context.startingSequence + normalized.length;
    normalized.push({
      tradeId: `finnhub:${target}:${timestamp}:${sequence}`,
      identityBasis: "adapter-arrival",
      timestamp,
      sourceTimestampRaw: String(timestampValue),
      session: sessionDate(new Date(timestamp)),
      symbol: target,
      price: finite(row.p, "p"),
      volume: finite(row.v, "v"),
      currency: "USD",
      sequence,
      sequenceBasis: "adapter-arrival",
      receivedAt: context.receivedAt,
      conditions: Array.isArray(row.c) ? row.c.map(String) : [],
      source: "finnhub",
      feed: FINNHUB_FEED,
      providerEventType: "trade",
    });
  }
  return normalized;
}

function parse(raw: RawData): unknown {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  return JSON.parse(text);
}

export async function captureFinnhubMarketData(
  options: FinnhubCaptureOptions,
): Promise<MarketCaptureResult> {
  const validated = validateCaptureOptions(options);
  if (validated.includeQuotes) {
    throw new Error(
      "Finnhub's documented WebSocket Trades endpoint does not expose quotes. " +
      "Set includeQuotes=false or select a provider with quote capability.",
    );
  }
  if (!validated.includeTrades) {
    throw new Error("Finnhub WebSocket Trades requires includeTrades=true.");
  }

  const token = requireCredential("FINNHUB_API_KEY");
  const endpoint = `${FINNHUB_ENDPOINT}?token=${encodeURIComponent(token)}`;
  const trades: NormalizedTrade[] = [];
  const streamErrors: string[] = [];

  return await new Promise<MarketCaptureResult>((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const sanitized = (value: unknown): string => String(value).replaceAll(token, "[redacted]");
    const finish = (stoppedBy: "duration" | "event_limit", error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      if (error) {
        reject(error);
        return;
      }
      if (trades.length === 0) {
        reject(
          new Error(
            streamErrors.at(-1)
              ? `Finnhub returned no ${validated.symbol} trades. Last stream error: ${streamErrors.at(-1)}`
              : `Finnhub returned no ${validated.symbol} trades. Try again while the entitled market feed is active.`,
          ),
        );
        return;
      }
      resolve({
        provider: finnhubCapabilities(),
        trades: [...trades].sort(
          (left, right) =>
            Date.parse(left.timestamp) - Date.parse(right.timestamp) ||
            left.sequence - right.sequence,
        ),
        tradeArrivals: [...trades],
        quotes: [],
        corrections: [],
        cancelErrors: [],
        stoppedBy,
        streamErrors,
      });
    };

    timer = setTimeout(() => finish("duration"), options.durationSeconds * 1_000);
    socket.once("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", symbol: validated.symbol }));
    });
    socket.on("message", (raw) => {
      try {
        const payload = parse(raw);
        if (
          payload &&
          typeof payload === "object" &&
          "type" in payload &&
          (payload as { type?: string }).type === "error"
        ) {
          const detail = sanitized(JSON.stringify(payload));
          streamErrors.push(detail);
          finish("duration", new Error(`Finnhub stream error: ${detail}`));
          return;
        }
        const mapped = normalizeFinnhubMessage(payload, {
          symbol: validated.symbol,
          receivedAt: new Date().toISOString(),
          startingSequence: trades.length + 1,
        });
        const remaining = validated.maxEvents - trades.length;
        trades.push(...mapped.slice(0, remaining));
        if (trades.length >= validated.maxEvents) finish("event_limit");
      } catch (error) {
        const detail = sanitized(error instanceof Error ? error.message : error);
        streamErrors.push(detail);
        finish("duration", new Error(`Finnhub payload mapping failed: ${detail}`));
      }
    });
    socket.once("error", (error) => {
      const detail = sanitized(error.message);
      streamErrors.push(detail);
      finish("duration", new Error(`Finnhub connection failed: ${detail}`));
    });
    socket.once("close", () => {
      if (!settled) finish("duration");
    });
  });
}

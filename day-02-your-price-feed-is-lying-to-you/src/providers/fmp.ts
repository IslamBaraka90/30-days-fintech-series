import WebSocket, { type RawData } from "ws";

import {
  epochTimestamp,
  requireCredential,
  sessionDate,
  validateCaptureOptions,
  type MarketCaptureResult,
  type NormalizedCancelError,
  type NormalizedQuote,
  type NormalizedTrade,
  type ProviderCapabilities,
} from "./types.ts";

const FMP_FEED = "company-websocket";

export interface FmpCaptureOptions {
  symbol: string;
  durationSeconds: number;
  maxEvents?: number;
  includeTrades?: boolean;
  includeQuotes?: boolean;
}

export interface FmpMarketMessage {
  s: string;
  t: number | string;
  type: "T" | "Q" | "B";
  ap?: number | string | null;
  as?: number | string | null;
  bs?: number | string | null;
  bp?: number | string | null;
  lp?: number | string | null;
  ls?: number | string | null;
}

export interface FmpNormalizedEvents {
  trades: NormalizedTrade[];
  quotes: NormalizedQuote[];
  cancelErrors: NormalizedCancelError[];
  nextSequence: number;
}

export function fmpCapabilities(
  endpoint = "configured through FMP_WEBSOCKET_URL",
): ProviderCapabilities {
  let publicEndpoint = endpoint;
  if (endpoint.startsWith("wss://")) {
    const parsed = new URL(endpoint);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    publicEndpoint = parsed.toString();
  }
  return {
    provider: "fmp",
    feed: FMP_FEED,
    endpoint: publicEndpoint,
    trades: true,
    quotes: true,
    corrections: false,
    cancelErrorsOrBreaks: true,
    providerTradeIds: false,
    sourceSequence: false,
    notes: [
      "The company WebSocket is entitlement-controlled; use the cluster URL assigned to the paid account.",
      "The public response-field schema page is labeled legacy.",
      "Trade breaks are preserved, but the published payload does not provide an original-trade reference.",
      "Trade identity and sequence are adapter-local.",
    ],
  };
}

function finite(value: unknown, field: string): number {
  const parsed =
    typeof value === "number" ? value :
    typeof value === "string" && value.trim() !== "" ? Number(value) :
    Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(`FMP field ${field} must be a finite number.`);
  }
  return parsed;
}

function timestamp(value: number | string): string {
  if (typeof value === "number") return epochTimestamp(value);
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return epochTimestamp(Number(trimmed));
  const milliseconds = Date.parse(trimmed);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`FMP timestamp could not be parsed: ${value}.`);
  }
  return new Date(milliseconds).toISOString();
}

function empty(startingSequence: number): FmpNormalizedEvents {
  return {
    trades: [],
    quotes: [],
    cancelErrors: [],
    nextSequence: startingSequence,
  };
}

function normalizeOne(
  message: unknown,
  context: { symbol: string; receivedAt: string; startingSequence: number },
): FmpNormalizedEvents {
  if (!message || typeof message !== "object") return empty(context.startingSequence);
  const row = message as Partial<FmpMarketMessage>;
  if (!["T", "Q", "B"].includes(String(row.type))) return empty(context.startingSequence);
  if (String(row.s).toUpperCase() !== context.symbol.toUpperCase()) {
    return empty(context.startingSequence);
  }
  if (row.t === undefined) throw new Error("FMP field t is required.");

  const symbol = context.symbol.toUpperCase();
  const eventTimestamp = timestamp(row.t);
  const sequence = context.startingSequence;
  const common = {
    timestamp: eventTimestamp,
    sourceTimestampRaw: String(row.t),
    receivedAt: context.receivedAt,
    sequence,
    sequenceBasis: "adapter-arrival" as const,
    session: sessionDate(new Date(eventTimestamp)),
    symbol,
    source: "fmp" as const,
    feed: FMP_FEED,
  };

  if (row.type === "T") {
    return {
      trades: [{
        ...common,
        tradeId: `fmp:${symbol}:${eventTimestamp}:${sequence}`,
        identityBasis: "adapter-arrival",
        price: finite(row.lp, "lp"),
        volume: finite(row.ls, "ls"),
        currency: "USD",
        conditions: [],
        providerEventType: "T",
      }],
      quotes: [],
      cancelErrors: [],
      nextSequence: sequence + 1,
    };
  }

  if (row.type === "Q") {
    return {
      trades: [],
      quotes: [{
        ...common,
        bid: finite(row.bp, "bp"),
        ask: finite(row.ap, "ap"),
        bidSize: finite(row.bs, "bs"),
        askSize: finite(row.as, "as"),
        conditions: [],
        providerEventType: "Q",
      }],
      cancelErrors: [],
      nextSequence: sequence + 1,
    };
  }

  return {
    trades: [],
    quotes: [],
    cancelErrors: [{
      ...common,
      tradeId: `fmp-break:${symbol}:${eventTimestamp}:${sequence}`,
      identityBasis: "adapter-arrival",
      action: "CANCEL",
      price: finite(row.lp, "lp"),
      size: finite(row.ls, "ls"),
      providerEventType: "B",
    }],
    nextSequence: sequence + 1,
  };
}

export function normalizeFmpMessage(
  payload: unknown,
  context: { symbol: string; receivedAt: string; startingSequence: number },
): FmpNormalizedEvents {
  const messages = Array.isArray(payload) ? payload : [payload];
  const result = empty(context.startingSequence);
  for (const message of messages) {
    const mapped = normalizeOne(message, {
      ...context,
      startingSequence: result.nextSequence,
    });
    result.trades.push(...mapped.trades);
    result.quotes.push(...mapped.quotes);
    result.cancelErrors.push(...mapped.cancelErrors);
    result.nextSequence = mapped.nextSequence;
  }
  return result;
}

function parse(raw: RawData): unknown {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  return JSON.parse(text);
}

function configuredEndpoint(): string {
  const endpoint = process.env.FMP_WEBSOCKET_URL?.trim();
  if (!endpoint) {
    throw new Error(
      "Missing FMP WebSocket cluster. Set FMP_WEBSOCKET_URL to the wss:// endpoint " +
      "shown for the paid account.",
    );
  }
  if (!endpoint.startsWith("wss://")) {
    throw new Error("FMP_WEBSOCKET_URL must use wss://.");
  }
  const parsed = new URL(endpoint);
  if (parsed.username || parsed.password || [...parsed.searchParams.keys()].length > 0) {
    throw new Error(
      "FMP_WEBSOCKET_URL must contain only the cluster address. Configure authentication " +
      "with FMP_API_KEY and FMP_WEBSOCKET_AUTH.",
    );
  }
  return endpoint;
}

function authenticationMode(): "login" | "query" {
  const mode = (process.env.FMP_WEBSOCKET_AUTH ?? "login").trim().toLowerCase();
  if (mode !== "login" && mode !== "query") {
    throw new Error("FMP_WEBSOCKET_AUTH must be login or query.");
  }
  return mode;
}

export async function captureFmpMarketData(
  options: FmpCaptureOptions,
): Promise<MarketCaptureResult> {
  const validated = validateCaptureOptions(options);
  const apiKey = requireCredential("FMP_API_KEY");
  const endpoint = configuredEndpoint();
  const authMode = authenticationMode();
  const authenticatedEndpoint = new URL(endpoint);
  if (authMode === "query") authenticatedEndpoint.searchParams.set("apikey", apiKey);
  const trades: NormalizedTrade[] = [];
  const quotes: NormalizedQuote[] = [];
  const cancelErrors: NormalizedCancelError[] = [];
  const streamErrors: string[] = [];
  let nextSequence = 1;

  return await new Promise<MarketCaptureResult>((resolve, reject) => {
    const socket = new WebSocket(authenticatedEndpoint, { followRedirects: true });
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;

    const sanitized = (value: unknown): string => String(value).replaceAll(apiKey, "[redacted]");
    const eventCount = (): number => trades.length + quotes.length + cancelErrors.length;
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
      if (trades.length === 0 && quotes.length === 0 && cancelErrors.length === 0) {
        reject(
          new Error(
            streamErrors.at(-1)
              ? `FMP returned no ${validated.symbol} events. Last stream error: ${streamErrors.at(-1)}`
              : `FMP returned no ${validated.symbol} events. Check WebSocket entitlement and active feed hours.`,
          ),
        );
        return;
      }
      resolve({
        provider: fmpCapabilities(endpoint),
        trades: [...trades].sort(
          (left, right) =>
            Date.parse(left.timestamp) - Date.parse(right.timestamp) ||
            left.sequence - right.sequence,
        ),
        tradeArrivals: [...trades],
        quotes,
        corrections: [],
        cancelErrors,
        stoppedBy,
        streamErrors,
      });
    };

    timer = setTimeout(() => finish("duration"), options.durationSeconds * 1_000);
    socket.once("open", () => {
      if (authMode === "login") {
        socket.send(JSON.stringify({ event: "login", data: { apiKey } }));
      }
      socket.send(
        JSON.stringify({
          event: "subscribe",
          data: { ticker: validated.symbol.toLowerCase() },
        }),
      );
    });
    socket.on("message", (raw) => {
      try {
        const payload = parse(raw);
        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          "event" in payload &&
          String((payload as { event?: unknown }).event).toLowerCase() === "error"
        ) {
          const detail = sanitized(JSON.stringify(payload));
          streamErrors.push(detail);
          finish("duration", new Error(`FMP stream error: ${detail}`));
          return;
        }
        const mapped = normalizeFmpMessage(payload, {
          symbol: validated.symbol,
          receivedAt: new Date().toISOString(),
          startingSequence: nextSequence,
        });
        nextSequence = mapped.nextSequence;

        for (const trade of mapped.trades) {
          if (validated.includeTrades && eventCount() < validated.maxEvents) trades.push(trade);
        }
        for (const quote of mapped.quotes) {
          if (validated.includeQuotes && eventCount() < validated.maxEvents) quotes.push(quote);
        }
        for (const broken of mapped.cancelErrors) {
          if (validated.includeTrades && eventCount() < validated.maxEvents) cancelErrors.push(broken);
        }
        if (eventCount() >= validated.maxEvents) finish("event_limit");
      } catch (error) {
        const detail = sanitized(error instanceof Error ? error.message : error);
        streamErrors.push(detail);
        finish("duration", new Error(`FMP payload mapping failed: ${detail}`));
      }
    });
    socket.once("error", (error) => {
      const detail = sanitized(error.message);
      streamErrors.push(detail);
      finish("duration", new Error(`FMP connection failed: ${detail}`));
    });
    socket.once("close", () => {
      if (!settled) finish("duration");
    });
  });
}

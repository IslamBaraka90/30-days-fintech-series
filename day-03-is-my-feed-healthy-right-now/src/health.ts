import {
  monitor,
  type ClockProfile,
  type LatencyEvent,
} from "fintech-algorithms/market-data-engineering/data-quality/feed-latency-monitor";
import {
  diagnoseGap,
  type GapDiagnosis,
} from "fintech-algorithms/market-data-engineering/data-quality/missing-bar-gap-classifier";
import {
  detectSchemaDrift,
  type FieldSchema,
  type SchemaDocument,
} from "fintech-algorithms/market-data-engineering/data-quality/schema-drift-detector";
import {
  asOfSnapshot,
  leakageAudit,
  type BitemporalRecord,
} from "fintech-algorithms/market-data-engineering/data-quality/point-in-time-availability-guard";

import type {
  MarketCaptureResult,
  NormalizedCancelError,
  NormalizedCorrection,
  NormalizedQuote,
  NormalizedTrade,
} from "../../day-02-your-price-feed-is-lying-to-you/src/providers/index.ts";

type Arrival =
  | ({ kind: "trade" } & NormalizedTrade)
  | ({ kind: "quote" } & NormalizedQuote)
  | ({ kind: "correction" } & NormalizedCorrection)
  | ({ kind: "cancel_error" } & NormalizedCancelError);

export interface HealthOptions {
  clockProfile: ClockProfile;
  warningMs?: number;
  criticalMs?: number;
}

function field(type: string, unit: string | null, meaning: string): FieldSchema {
  return {
    type,
    required: true,
    nullable: false,
    enum: null,
    unit,
    meaning,
  };
}

const NORMALIZED_TRADE_SCHEMA: SchemaDocument = {
  schema_id: "fintech-builder.normalized-trade",
  version: "1.0.0",
  parent_version: null,
  completeness: "complete",
  fields: {
    tradeId: field("string", null, "Stable identity within this normalized capture."),
    timestamp: field("string", "UTC ISO-8601", "Provider event time."),
    session: field("string", "America/New_York date", "Trading-session label."),
    symbol: field("string", null, "Normalized instrument symbol."),
    price: field("number", "USD per share", "Unadjusted trade price."),
    volume: field("number", "shares", "Trade size."),
    currency: field("string", null, "Price currency."),
    sequence: field("number", "adapter arrival order", "Local adapter arrival sequence."),
    receivedAt: field("string", "UTC ISO-8601", "Consumer ingress time."),
    conditions: field("array", null, "Provider trade-condition codes."),
    source: field("string", null, "Provider adapter identifier."),
    feed: field("string", null, "Provider feed identifier."),
  },
};

function runtimeTradeSchema(trade: NormalizedTrade | undefined): SchemaDocument {
  const actual = trade ? (trade as unknown as Record<string, unknown>) : {};
  const fields = Object.fromEntries(
    Object.entries(NORMALIZED_TRADE_SCHEMA.fields)
      .filter(([name]) => name in actual)
      .map(([name, contract]) => [name, contract]),
  );
  return {
    schema_id: NORMALIZED_TRADE_SCHEMA.schema_id,
    version: "1.0.1-runtime",
    parent_version: NORMALIZED_TRADE_SCHEMA.version,
    completeness: "complete",
    fields,
  };
}

function arrivals(capture: MarketCaptureResult): Arrival[] {
  return [
    ...capture.tradeArrivals.map((event) => ({ ...event, kind: "trade" as const })),
    ...capture.quotes.map((event) => ({ ...event, kind: "quote" as const })),
    ...capture.corrections.map((event) => ({ ...event, kind: "correction" as const })),
    ...capture.cancelErrors.map((event) => ({ ...event, kind: "cancel_error" as const })),
  ].sort((left, right) => left.sequence - right.sequence);
}

function eventId(event: Arrival): string {
  if (event.kind === "trade") return `trade:${event.tradeId}:${event.sequence}`;
  if (event.kind === "correction") return `correction:${event.originalTradeId}:${event.sequence}`;
  if (event.kind === "cancel_error") return `cancel:${event.tradeId}:${event.sequence}`;
  return `quote:${event.symbol}:${event.sequence}`;
}

function latencyEvents(capture: MarketCaptureResult): LatencyEvent[] {
  return arrivals(capture).map((event) => ({
    event_id: eventId(event),
    sequence: event.sequence,
    event_time: event.timestamp,
    receive_time: event.receivedAt,
    // This tutorial measures only to the adapter-output boundary. A later
    // processing boundary needs its own timestamp, not an invented delay.
    process_time: event.receivedAt,
  }));
}

function availabilityRecords(capture: MarketCaptureResult): BitemporalRecord[] {
  return capture.tradeArrivals.map((trade, index) => ({
    entity: trade.symbol,
    feature: "last_trade_price",
    observation_time: trade.timestamp,
    available_at: trade.receivedAt,
    revision: 0,
    value: trade.price,
    record_id: `${trade.source}:${trade.tradeId}:${index}`,
  }));
}

export function clockProfileFromEnvironment(): ClockProfile {
  const verified = process.env.CLOCK_SYNC_VERIFIED?.trim().toLowerCase() === "true";
  const offset = Number(process.env.CLOCK_MAX_OFFSET_MS ?? "1");
  if (verified && (!Number.isFinite(offset) || offset < 0)) {
    throw new Error("CLOCK_MAX_OFFSET_MS must be a non-negative number.");
  }
  return {
    source_clock_domain: "provider-event-clock",
    ingress_clock_domain: "node-consumer-clock",
    ready_clock_domain: "node-consumer-clock",
    source_timestamp_owner: "market-data-provider",
    ingress_timestamp_owner: "this-process",
    ready_timestamp_owner: "this-process",
    cross_domain_sync_status: verified ? "synchronized" : "unknown",
    max_abs_offset_ms: verified ? offset : null,
  };
}

export function assessCaptureHealth(capture: MarketCaptureResult, options: HealthOptions) {
  const events = latencyEvents(capture);
  if (events.length === 0) {
    throw new Error("Health assessment needs at least one normalized event.");
  }
  const latency = monitor(
    events,
    options.clockProfile,
    options.warningMs ?? 250,
    options.criticalMs ?? 1_000,
  );
  const hasSequenceGap = latency.sequence_gaps.length > 0;
  const hasTrade = capture.tradeArrivals.length > 0;
  const gap: GapDiagnosis = diagnoseGap({
    timestamp: events.at(-1)?.event_time,
    bar_state: hasTrade ? "present" : "absent",
    session_status: hasTrade ? "open" : "unknown",
    halt_status: hasTrade ? "inactive" : "unknown",
    heartbeat_status: capture.streamErrors.length ? "lost" : "healthy",
    sequence_status: hasSequenceGap ? "gap" : "continuous",
    activity_status: hasTrade ? "trades" : "unknown",
    // This capture is the same path that would build the bar, so it cannot
    // independently prove that an empty interval contained no trades.
    activity_independent: false,
    evidence_ids: [
      `capture:${capture.provider.provider}:${capture.provider.feed}`,
      `events:${events.length}`,
    ],
  });
  const schema = detectSchemaDrift(
    NORMALIZED_TRADE_SCHEMA,
    runtimeTradeSchema(capture.tradeArrivals[0]),
  );
  const ledger = availabilityRecords(capture);
  const knowledgeTime = events
    .map((event) => event.receive_time)
    .sort()
    .at(-1)!;
  const pointInTime = {
    knowledgeTime,
    snapshot: asOfSnapshot(ledger, knowledgeTime),
    leakage: leakageAudit(ledger, knowledgeTime),
  };
  const latencyTrustworthy = latency.events.every(
    (event) =>
      event.status !== "clock_untrusted" &&
      event.status !== "processing_order_error" &&
      event.status !== "clock_error_negative_latency",
  );
  const healthy =
    latencyTrustworthy &&
    latency.counts.critical === 0 &&
    latency.counts.threshold_uncertain === 0 &&
    gap.classification === "present" &&
    schema.status === "unchanged" &&
    pointInTime.leakage.length === 0 &&
    capture.streamErrors.length === 0;
  return {
    provider: capture.provider,
    verdict: healthy ? "healthy" : "attention",
    latencyTrustworthy,
    latency,
    gap,
    schema,
    pointInTime,
    capture: {
      trades: capture.tradeArrivals.length,
      quotes: capture.quotes.length,
      corrections: capture.corrections.length,
      cancelErrors: capture.cancelErrors.length,
      streamErrors: capture.streamErrors,
      stoppedBy: capture.stoppedBy,
    },
  };
}

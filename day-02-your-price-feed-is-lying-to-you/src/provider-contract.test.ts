import assert from "node:assert/strict";

import { fixtureInput } from "./fixture.ts";
import { runQualityGate } from "./quality.ts";
import {
  capabilitiesFor,
} from "./providers/index.ts";
import {
  normalizeFinnhubMessage,
} from "./providers/finnhub.ts";
import {
  normalizeFmpMessage,
} from "./providers/fmp.ts";

const receivedAt = "2026-07-29T14:30:00.050Z";
const eventMilliseconds = Date.parse("2026-07-29T14:30:00.000Z");

const finnhubTrades = normalizeFinnhubMessage(
  {
    type: "trade",
    data: [{
      s: "TEST",
      p: 100.25,
      t: eventMilliseconds,
      v: 40,
      c: ["fixture-condition"],
    }],
  },
  { symbol: "TEST", receivedAt, startingSequence: 1 },
);

assert.equal(finnhubTrades.length, 1);
assert.equal(finnhubTrades[0].source, "finnhub");
assert.equal(finnhubTrades[0].identityBasis, "adapter-arrival");
assert.equal(finnhubTrades[0].providerTradeId, undefined);
assert.equal(finnhubTrades[0].timestamp, "2026-07-29T14:30:00.000Z");
assert.deepEqual(finnhubTrades[0].conditions, ["fixture-condition"]);

const fmpEvents = normalizeFmpMessage(
  [
    { s: "TEST", t: eventMilliseconds, type: "T", lp: 100.25, ls: 40 },
    { s: "TEST", t: eventMilliseconds + 10, type: "Q", bp: 100.24, ap: 100.26, bs: 2, as: 3 },
    { s: "TEST", t: eventMilliseconds + 20, type: "B", lp: 100.25, ls: 40 },
  ],
  { symbol: "TEST", receivedAt, startingSequence: 1 },
);

assert.equal(fmpEvents.trades.length, 1);
assert.equal(fmpEvents.quotes.length, 1);
assert.equal(fmpEvents.cancelErrors.length, 1);
assert.equal(fmpEvents.trades[0].source, "fmp");
assert.equal(fmpEvents.quotes[0].bid, 100.24);
assert.equal(fmpEvents.quotes[0].ask, 100.26);
assert.equal(fmpEvents.cancelErrors[0].providerEventType, "B");
assert.equal(fmpEvents.cancelErrors[0].providerTradeId, undefined);

const capabilities = [
  capabilitiesFor("alpaca", "iex"),
  capabilitiesFor("finnhub"),
  capabilitiesFor("fmp"),
];
assert.deepEqual(capabilities.map((row) => row.provider), ["alpaca", "finnhub", "fmp"]);
assert.deepEqual(capabilities.map((row) => row.quotes), [true, false, true]);
assert.deepEqual(capabilities.map((row) => row.providerTradeIds), [true, false, false]);
assert.ok(capabilities.every((row) => row.sourceSequence === false));

const finnhubReport = runQualityGate({
  ...fixtureInput,
  sourceLabel: "labeled Finnhub capability fixture",
  capabilities: capabilitiesFor("finnhub"),
  quotes: [],
  corrections: [],
  cancelErrors: [],
  clockSyncVerified: false,
});
assert.equal(finnhubReport.markets.length, 0);
assert.equal(finnhubReport.lifecycle.status, "not_evaluated");
assert.equal(finnhubReport.staleness.status, "not_evaluated");
assert.ok(
  finnhubReport.findings.some(
    (row) => row.stage === "quotes" && row.rule === "QUOTES_NOT_SUPPLIED",
  ),
);
assert.ok(
  finnhubReport.findings.some(
    (row) => row.stage === "trades" && row.rule === "LIFECYCLE_NOT_RESOLVABLE",
  ),
);

const fmpReport = runQualityGate({
  ...fixtureInput,
  sourceLabel: "labeled FMP capability fixture",
  capabilities: capabilitiesFor("fmp"),
  trades: fmpEvents.trades,
  tradeArrivals: fmpEvents.trades,
  quotes: fmpEvents.quotes,
  corrections: [],
  cancelErrors: fmpEvents.cancelErrors,
  barsOverride: fixtureInput.barsOverride?.slice(0, 1),
  clockSyncVerified: false,
});
assert.equal(fmpReport.lifecycle.status, "not_evaluated");
assert.ok(
  fmpReport.findings.some(
    (row) =>
      row.stage === "trades" &&
      row.rule === "LIFECYCLE_NOT_RESOLVABLE" &&
      row.detail.includes("lacks the trade identity"),
  ),
);

console.log(
  "Article #2 provider contract: mappings and capability-aware unavailable states passed.",
);

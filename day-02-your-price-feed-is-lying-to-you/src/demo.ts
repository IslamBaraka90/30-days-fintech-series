import { fixtureInput } from "./fixture.ts";
import { runQualityGate } from "./quality.ts";
import { formatQualityReport } from "./report.ts";

console.log("DETERMINISTIC FAILURE LABORATORY");
console.log("Every value below is labeled synthetic test data, not provider output.");
console.log();
console.log(formatQualityReport(runQualityGate(fixtureInput)));

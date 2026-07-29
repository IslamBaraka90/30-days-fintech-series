import type { QualityReport } from "./quality.ts";

const line = (title: string): string => `\n${title}\n${"-".repeat(title.length)}`;

export function formatQualityReport(report: QualityReport): string {
  const output: string[] = [];
  output.push(`source        ${report.sourceLabel}`);
  output.push(`provider      ${report.capabilities.provider}:${report.capabilities.feed}`);
  output.push(`trades        ${report.logReturns.length}`);
  output.push(`bars          ${report.barValidation.length}`);
  output.push(`quotes        ${report.markets.length}`);

  output.push(line("Stage 1 · OHLC consistency"));
  const badBars = report.barValidation.filter((row) => !row.valid);
  output.push(`invalid       ${badBars.length}`);
  for (const row of badBars) {
    output.push(`  ${row.timestamp || row.index}  ${row.issues.join(", ")}`);
  }

  output.push(line("Stage 2 · Causal Hampel"));
  output.push(`warm-up       ${report.hampel.filter((row) => row.status === "insufficient_history").length}`);
  output.push(`flagged       ${report.hampel.filter((row) => row.flagged).length}`);
  output.push(`look-ahead    ${report.hampel.some((row) => row.lookaheadUsed) ? "yes" : "no"}`);

  output.push(line("Stage 3 · Global MAD"));
  output.push(`status        ${report.mad.status}`);
  output.push(`outliers      ${report.mad.points.filter((row) => row.outlier).map((row) => row.index).join(", ") || "none"}`);

  output.push(line("Stage 4 · Quote geometry"));
  for (const state of ["NORMAL", "LOCKED", "CROSSED", "INVALID"]) {
    output.push(`${state.toLowerCase().padEnd(13)}${report.markets.filter((row) => row.state === state).length}`);
  }

  output.push(line("Stage 5 · Trade lifecycle"));
  output.push(`ordering      ${report.lifecycle.orderingBasis}`);
  output.push(`status        ${report.lifecycle.status}`);
  if (report.lifecycle.result) {
    for (const audit of report.lifecycle.result.audit) {
      output.push(`  ${String(audit.event_id).padEnd(22)} ${String(audit.decision)}`);
    }
  } else {
    output.push(`reason        ${report.lifecycle.reason}`);
  }

  output.push(line("Stage 6 · Staleness"));
  output.push(`status        ${report.staleness.status}`);
  if (report.staleness.status === "not_evaluated") {
    output.push(`reason        ${report.staleness.reason}`);
  } else {
    const last = report.staleness.rows.at(-1);
    output.push(`final usable  ${last?.usable_for_active_market ? "yes" : "no"}`);
    output.push(`final reasons ${last?.reasons.join(", ") || "none"}`);
  }

  output.push(line("Finding ledger"));
  for (const finding of report.findings) {
    output.push(
      `  ${finding.stage.padEnd(10)} ${finding.disposition.padEnd(11)} ` +
      `${finding.rule.padEnd(28)} ${finding.row}`,
    );
  }
  output.push(`total         ${report.findings.length}; source observations were not repaired`);
  return output.join("\n");
}

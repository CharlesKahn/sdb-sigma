import chalk from "chalk";
import type {
  AnalysisResult,
  BoundaryFinding,
  BoundaryStrength,
  EnforcementLevel,
} from "../types";

// Palette per spec.
const C = {
  white: chalk.hex("#e8ecf0"),
  grey: chalk.hex("#8c9aac"),
  green: chalk.hex("#3ECF8E"),
  blue: chalk.hex("#0d4280"),
  red: chalk.hex("#e83842"),
  divider: chalk.hex("#1a2028"),
  arrow: chalk.hex("#1e2830"),
  warnBadge: chalk.bgHex("#e8c800").hex("#000000").bold,
};

const DIVIDER_WIDTH = 64;

function rule(): string {
  return "  " + C.divider("─".repeat(DIVIDER_WIDTH));
}

function sectionLabel(label: string): string {
  return [
    "",
    rule(),
    "  " + C.grey(label.toLowerCase()),
    rule(),
    "",
  ].join("\n");
}

function statusColor(strength: BoundaryStrength) {
  if (strength === "STRONG") return C.green;
  if (strength === "MODERATE") return C.blue;
  return C.red;
}

// Segmented bar: 10 blocks, "██" each, single space gap.
function segmentedBar(filled: number, color: (s: string) => string): string {
  const total = 10;
  const f = Math.max(0, Math.min(total, Math.round(filled)));
  const segments: string[] = [];
  for (let i = 0; i < total; i++) {
    segments.push(i < f ? color("██") : C.divider("██"));
  }
  return segments.join(" ");
}

function dot(strength: BoundaryStrength): string {
  return statusColor(strength)("●");
}

function pad(s: string, width: number): string {
  // strip ansi for length calc
  const visible = s.replace(/\u001b\[[0-9;]*m/g, "");
  const diff = Math.max(0, width - visible.length);
  return s + " ".repeat(diff);
}

function renderHeader(): string {
  const blocks = C.white("░▒▓");
  const blocksRev = C.white("▓▒░");
  const sdb = C.white.bold("SDB");
  const sigma = C.grey("sigma");
  const sub = C.grey("K<RMAN LABS");
  return ["", `  ${blocks} ${sdb} ${blocksRev}  ${sigma}`, `  ${sub}`].join("\n");
}

function renderMasterCaution(result: AnalysisResult): string | null {
  const hasUnprotected = result.promptWarnings.some(
    (w) => w.severity === "error" && !w.boundary,
  );
  const hasWeak = result.boundaries.some((b) => b.strength === "WEAK");
  const lowScore = result.summary.architectureScore < 7;
  if (!hasUnprotected && !hasWeak && !lowScore) return null;

  const reasons: string[] = [];
  if (hasWeak) reasons.push("weak boundaries");
  if (hasUnprotected) reasons.push("unprotected hard directives");
  if (lowScore && !hasWeak && !hasUnprotected) reasons.push("architecture score < 7");

  return [
    "",
    "  " + C.warnBadge(" WARN ") + "  " + C.grey(reasons.join("  ·  ")),
  ].join("\n");
}

function renderAgentBlock(result: AnalysisResult): string {
  const { config } = result;
  const lines: string[] = [];
  lines.push(sectionLabel("agent"));
  lines.push("  " + C.white(config.name));
  if (config.description) lines.push("  " + C.grey(config.description));
  lines.push("");
  lines.push("  " + C.grey(`${config.agent.provider} / ${config.agent.model}`));
  return lines.join("\n");
}

function renderPattern(result: AnalysisResult): string {
  const { pattern } = result;
  const lines: string[] = [];
  lines.push(sectionLabel("pattern"));
  const pct = Math.round(pattern.confidence * 100);
  lines.push(
    "  " +
      C.white.bold(pattern.pattern) +
      "   " +
      C.white(pattern.label) +
      "   " +
      C.grey(`confidence ${pct}%`),
  );
  if (pattern.rationale.length > 0) {
    lines.push("");
    for (const r of pattern.rationale) {
      lines.push("  " + C.grey("· ") + C.grey(r));
    }
  }
  if (pattern.mismatches.length > 0) {
    lines.push("");
    for (const m of pattern.mismatches) {
      lines.push("  " + C.red("!") + " " + C.grey(m));
    }
  }
  return lines.join("\n");
}

function renderScore(result: AnalysisResult): string {
  const score = result.summary.architectureScore;
  const filled = score; // 0..10
  const lines: string[] = [];
  lines.push(sectionLabel("architecture score"));
  const big = C.white.bold(`  ${score.toFixed(1)}`);
  const denom = C.grey(" /10");
  lines.push(big + denom);
  lines.push("");
  // Score bar uses NASA blue per spec ("blue ... also used for score bar").
  lines.push("  " + segmentedBar(filled, C.blue));
  return lines.join("\n");
}

function strengthFillForBoundary(b: BoundaryFinding): number {
  if (b.strength === "STRONG") return 10;
  if (b.strength === "MODERATE") return 5;
  return 1;
}

function enforcementLabel(e: EnforcementLevel): string {
  return e;
}

function renderBoundaries(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(sectionLabel("sdb health"));
  if (result.boundaries.length === 0) {
    lines.push("  " + C.grey("no boundaries declared"));
    return lines.join("\n");
  }

  for (const b of result.boundaries) {
    const name = pad(C.white(b.name), 30);
    const strength = pad(statusColor(b.strength)(b.strength), 12);
    const enforcement = C.grey(enforcementLabel(b.enforcement));
    lines.push(`  ${dot(b.strength)} ${name}${strength}${enforcement}`);
    lines.push("    " + segmentedBar(strengthFillForBoundary(b), statusColor(b.strength)));
    lines.push(
      "    " +
        C.grey(`${b.data_tool} `) +
        C.arrow("╌╌►") +
        C.grey(` ${b.render_tool}  ·  ${b.contract}`),
    );
    for (const note of b.notes) {
      lines.push("    " + C.red("!") + " " + C.grey(note));
    }
    lines.push("");
  }
  // remove trailing empty
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function renderPromptRules(result: AnalysisResult): string {
  const { promptWarnings, summary } = result;
  const lines: string[] = [];
  lines.push(sectionLabel("prompt rules"));

  const errCount = promptWarnings.filter((w) => w.severity === "error").length;
  const warnCount = promptWarnings.filter((w) => w.severity === "warn").length;

  if (summary.hardRuleCount === 0) {
    lines.push("  " + C.grey("no system prompt provided"));
    return lines.join("\n");
  }

  const stat =
    `${summary.hardRuleCount} hard directive${summary.hardRuleCount === 1 ? "" : "s"}` +
    `, ${errCount} unprotected, ${warnCount} prompt-only`;
  lines.push("  " + C.grey(stat));

  if (promptWarnings.length === 0) {
    lines.push("");
    lines.push("  " + C.green("✓") + " " + C.grey("all hard directives are covered architecturally"));
    return lines.join("\n");
  }

  lines.push("");
  for (const w of promptWarnings) {
    const color = w.severity === "error" ? C.red : C.blue;
    lines.push(`  ${color("·")} ${C.white(truncate(w.rule, 88))}`);
    lines.push(`    ${C.grey("→ " + w.reason)}`);
  }
  return lines.join("\n");
}

function renderToolGraph(result: AnalysisResult): string {
  const { toolGraph } = result;
  const lines: string[] = [];
  lines.push(sectionLabel("tool graph"));

  if (toolGraph.edges.length === 0) {
    lines.push("  " + C.grey("no data→render transitions declared"));
    return lines.join("\n");
  }

  const fromWidth = Math.max(
    ...toolGraph.edges.map((e) => e.from.length),
    8,
  );
  const toWidth = Math.max(
    ...toolGraph.edges.map((e) => e.to.length),
    8,
  );

  for (const e of toolGraph.edges) {
    const from = pad(C.white(e.from), fromWidth);
    const to = pad(C.white(e.to), toWidth);
    const arrow = C.arrow(" ╌╌► ");
    const status = e.verified
      ? C.green("✓ verified")
      : C.blue("◐ prompt-only or none");
    lines.push(`  ${from}${arrow}${to}  ${status}`);
  }
  for (const c of toolGraph.cycles) {
    lines.push("  " + C.red("!") + " " + C.grey("cycle: " + c.join(" → ")));
  }
  return lines.join("\n");
}

function renderRecommendations(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push(sectionLabel("recommendations"));
  if (result.recommendations.length === 0) {
    lines.push("  " + C.green("✓") + " " + C.grey("no actionable recommendations"));
    return lines.join("\n");
  }
  for (let i = 0; i < result.recommendations.length; i++) {
    const r = result.recommendations[i];
    const n = String(i + 1).padStart(2, "0");
    lines.push("  " + C.grey(n) + "  " + C.white(r.title));
    if (r.detail) lines.push("      " + C.grey(r.detail));
    if (i < result.recommendations.length - 1) lines.push("");
  }
  return lines.join("\n");
}

function renderFooter(result: AnalysisResult): string {
  const { summary, pattern } = result;
  const parts = [
    `${summary.totalBoundaries} ${summary.totalBoundaries === 1 ? "boundary" : "boundaries"}`,
    `${summary.routeCount} route${summary.routeCount === 1 ? "" : "s"}`,
    `${pattern.pattern} ${pattern.label.split(" with ")[0]}`,
    `${summary.toolCount} tool${summary.toolCount === 1 ? "" : "s"}`,
  ];
  return [
    "",
    rule(),
    "  " + C.grey(parts.join("  ·  ")),
    "",
  ].join("\n");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function renderTerminal(result: AnalysisResult): string {
  const sections: string[] = [];
  sections.push(renderHeader());
  const caution = renderMasterCaution(result);
  if (caution) sections.push(caution);
  sections.push(renderAgentBlock(result));
  sections.push(renderPattern(result));
  sections.push(renderScore(result));
  sections.push(renderBoundaries(result));
  sections.push(renderPromptRules(result));
  sections.push(renderToolGraph(result));
  sections.push(renderRecommendations(result));
  sections.push(renderFooter(result));
  return sections.join("\n") + "\n";
}

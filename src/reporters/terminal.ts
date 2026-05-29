import chalk from "chalk";
import type {
  AnalysisResult,
  BoundaryFinding,
  BoundaryStrength,
  EnforcementLevel,
} from "../types";

// Palette per spec.
// `blue` is the deep NASA blue used for filled bar/dot/block surfaces.
// `blueText` is a brighter blue used anywhere blue appears as inline text
// (status labels, decorative ░░ glyphs in the gate map, warn bullets).
const C = {
  white: chalk.hex("#e8ecf0"),
  grey: chalk.hex("#8c9aac"),
  green: chalk.hex("#3ECF8E"),
  blue: chalk.hex("#0d4280"),
  blueText: chalk.hex("#1a60a8"),
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

interface GateRow {
  name: string;
  gateText: string;
  blockChar: string;
  blockColor: (s: string) => string;
  promote: boolean;
}

function findGateForBoundary(
  boundaryName: string,
  gates: string[],
): string | undefined {
  const tokens = boundaryName
    .toLowerCase()
    .split(/[-_]/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return undefined;
  let best: { gate: string; overlap: number } | null = null;
  for (const g of gates) {
    const gLower = g.toLowerCase();
    const overlap = tokens.reduce((n, t) => (gLower.includes(t) ? n + 1 : n), 0);
    if (overlap > 0 && (best === null || overlap > best.overlap)) {
      best = { gate: g, overlap };
    }
  }
  return best?.gate;
}

function buildGateRows(result: AnalysisResult): GateRow[] {
  const { config, boundaries, recommendations } = result;
  return boundaries.map((b) => {
    let blockChar: string;
    let blockColor: (s: string) => string;
    let gateText: string;

    if (b.enforcement === "architectural") {
      blockChar = "██";
      blockColor = C.green;
      gateText =
        findGateForBoundary(b.name, config.control.gates) ?? "gate";
    } else if (b.enforcement === "prompt-only") {
      blockChar = "░░";
      blockColor = C.blueText;
      gateText = "prompt rule";
    } else {
      blockChar = "╌╌";
      blockColor = C.red;
      gateText = "nothing";
    }

    const promote = recommendations.some((r) => {
      const t = r.title.toLowerCase();
      return (
        t.includes(b.name.toLowerCase()) &&
        (t.includes("promote") || t.includes("architectural"))
      );
    });

    return { name: b.name, gateText, blockChar, blockColor, promote };
  });
}

function renderGateMap(result: AnalysisResult): string {
  const rows = buildGateRows(result);
  const lines: string[] = [];
  lines.push(sectionLabel("gate map"));

  if (rows.length === 0) {
    lines.push("  " + C.grey("no boundaries declared"));
    return lines.join("\n");
  }

  const maxName = Math.max(...rows.map((r) => r.name.length));
  const maxGate = Math.max(...rows.map((r) => r.gateText.length));
  const DASH_RUN = 10;

  // Visible-column where the gate-text starts (used to align ▲ promote).
  // Layout per row (visible):
  //   "      " (6) + branch(2) + " " (1) + name(maxName) + " " (1) +
  //   dashes(DASH_RUN) + " " (1) + block(2) + " " (1) + gate(maxGate)
  const gateTextCol = 6 + 2 + 1 + maxName + 1 + DASH_RUN + 1 + 2 + 1;

  lines.push("  " + C.grey("LLM proposes"));
  lines.push("      " + C.grey("│"));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const isLast = i === rows.length - 1;
    const branch = isLast ? "└─" : "├─";

    const namePadded = r.name + " ".repeat(maxName - r.name.length);
    const gatePadded = r.gateText + " ".repeat(maxGate - r.gateText.length);
    const block = r.blockColor(r.blockChar);
    const dashes = C.grey("─".repeat(DASH_RUN));

    lines.push(
      "      " +
        C.grey(branch) +
        " " +
        C.white(namePadded) +
        " " +
        dashes +
        " " +
        block +
        " " +
        C.white(gatePadded) +
        " " +
        block +
        " " +
        C.grey("── commit"),
    );

    if (r.promote) {
      const cont = isLast ? " " : C.grey("│");
      const padCount = Math.max(1, gateTextCol - 7);
      lines.push("      " + cont + " ".repeat(padCount) + C.green("▲ promote"));
    }

    if (!isLast) {
      lines.push("      " + C.grey("│"));
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
    const sevLabel =
      w.severity === "error"
        ? C.red("error")
        : w.severity === "warn"
          ? C.blueText("warn ")
          : C.grey("info ");
    const bullet = w.severity === "error" ? C.red("·") : C.blueText("·");
    lines.push(`  ${bullet} ${sevLabel}  ${C.white(truncate(w.rule, 80))}`);
    lines.push(`           ${C.grey("→ " + w.reason)}`);
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
      : C.blueText("◐ prompt-only or none");
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

const PATTERN_GLOSS: Record<string, string> = {
  P1: "The parent agent delegates subtasks to child agents and verifies their output.",
  P2: "Parallel workers fan out and a merge function validates the combined result.",
  P3: "Events trigger the next steps and event schemas validate every transition.",
  P4: "The agent proposes outputs and a deterministic gate decides what commits.",
  P5: "Agents read and write a versioned shared state machine that validates each transition.",
  P6: "The agent proposes and a human approves before any commit happens.",
};

function scoreDragDownPhrases(result: AnalysisResult): string[] {
  const phrases: string[] = [];
  const weakCount = result.boundaries.filter((b) => b.strength === "WEAK").length;
  const promptOnlyCount = result.boundaries.filter(
    (b) => b.strength === "MODERATE",
  ).length;
  const unverified = result.toolGraph.unverifiedTransitions.length;
  const unprotected = result.promptWarnings.filter(
    (w) => w.severity === "error" && !w.boundary,
  ).length;
  const mismatches = result.pattern.mismatches.length;

  if (weakCount > 0)
    phrases.push(`${weakCount} weak boundary${weakCount === 1 ? "" : "ies"}`);
  if (promptOnlyCount > 0)
    phrases.push(
      `${promptOnlyCount} prompt-only boundary${promptOnlyCount === 1 ? "" : "ies"}`,
    );
  if (unverified > 0)
    phrases.push(
      `${unverified} unverified tool-graph transition${unverified === 1 ? "" : "s"}`,
    );
  if (unprotected > 0)
    phrases.push(
      `${unprotected} unprotected hard directive${unprotected === 1 ? "" : "s"}`,
    );
  if (mismatches > 0)
    phrases.push(
      `${mismatches} pattern/control mismatch${mismatches === 1 ? "" : "es"}`,
    );
  return phrases;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
}

function renderSummary(result: AnalysisResult): string {
  const { config, pattern, boundaries, summary, recommendations } = result;
  const lines: string[] = [];
  lines.push(sectionLabel("summary"));

  // Pattern sentence
  const patternBase = pattern.label.split(" with ")[0];
  const gloss = PATTERN_GLOSS[pattern.pattern] ?? "";
  lines.push(
    "  " +
      C.white(`${pattern.pattern} ${patternBase}`) +
      C.grey(" detected. ") +
      C.grey(gloss),
  );
  lines.push("");

  // Score sentence
  const drag = scoreDragDownPhrases(result);
  const dragSentence =
    drag.length === 0
      ? C.grey("with no significant deductions.")
      : C.grey("dragged down by ") + C.white(joinList(drag)) + C.grey(".");
  lines.push(
    "  " +
      C.grey("Architecture score ") +
      C.white(`${summary.architectureScore.toFixed(1)}/10`) +
      C.grey(" — ") +
      dragSentence,
  );
  lines.push("");

  // Per-boundary sentences
  for (const b of boundaries) {
    const strengthColor =
      b.strength === "STRONG"
        ? C.green
        : b.strength === "MODERATE"
          ? C.blueText
          : C.red;
    let tail: string;
    if (b.enforcement === "architectural") {
      const gate = findGateForBoundary(b.name, config.control.gates);
      tail = gate
        ? C.grey(`architectural via `) + C.white(gate) + C.grey(".")
        : C.grey("architectural enforcement.");
    } else if (b.enforcement === "prompt-only") {
      tail = C.grey("prompt-only — promote to architectural to harden.");
    } else {
      tail = C.grey("no verifier — every commit is an unprotected proposal.");
    }
    lines.push(
      "  " +
        C.white(b.name) +
        C.grey(" is ") +
        strengthColor(b.strength) +
        C.grey(", ") +
        tail,
    );
  }

  // Recommendations
  if (recommendations.length > 0) {
    lines.push("");
    for (let i = 0; i < recommendations.length; i++) {
      const r = recommendations[i];
      const n = String(i + 1).padStart(2, "0");
      lines.push("  " + C.grey(`Recommendation ${n}: `) + C.white(r.title) + C.grey("."));
    }
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
  sections.push(renderGateMap(result));
  sections.push(renderScore(result));
  sections.push(renderBoundaries(result));
  sections.push(renderPromptRules(result));
  sections.push(renderToolGraph(result));
  sections.push(renderRecommendations(result));
  sections.push(renderSummary(result));
  sections.push(renderFooter(result));
  return sections.join("\n") + "\n";
}

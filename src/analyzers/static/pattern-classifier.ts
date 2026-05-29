import type {
  AgentConfig,
  PatternClassification,
  PatternId,
} from "../../types";
import { PATTERNS } from "../../types";

interface PatternScore {
  pattern: PatternId;
  score: number;
  reasons: string[];
}

export function classifyPattern(config: AgentConfig): PatternClassification {
  const scores: PatternScore[] = [
    { pattern: "P1", score: 0, reasons: [] },
    { pattern: "P2", score: 0, reasons: [] },
    { pattern: "P3", score: 0, reasons: [] },
    { pattern: "P4", score: 0, reasons: [] },
    { pattern: "P5", score: 0, reasons: [] },
    { pattern: "P6", score: 0, reasons: [] },
  ];

  const get = (id: PatternId) => scores.find((s) => s.pattern === id)!;

  // P6 dominates if human approval is on
  if (config.control.human_approval) {
    const p6 = get("P6");
    p6.score += 80;
    p6.reasons.push("control.human_approval = true");
  }

  // P3 if event-log persistence
  if (config.state.persistence === "event-log") {
    const p3 = get("P3");
    p3.score += 70;
    p3.reasons.push("state.persistence = event-log");
  }

  // P4 if gates are declared (most common for SDB-enforced agents)
  if (config.control.gates.length > 0) {
    const p4 = get("P4");
    p4.score += 50;
    p4.reasons.push(
      `${config.control.gates.length} control gate(s) declared (${config.control.gates.join(", ")})`,
    );
    if (config.state.session_isolation) {
      p4.score += 15;
      p4.reasons.push("state.session_isolation = true (shared state with isolation)");
    }
  }

  // P5 if database persistence shared across types
  if (config.state.persistence === "database") {
    const p5 = get("P5");
    p5.score += 50;
    p5.reasons.push("state.persistence = database (versioned shared state)");
  }

  // P2 indicators: multiple routing types acting as parallel workers
  const typeCount = config.routing?.types.length ?? 0;
  if (typeCount >= 3 && config.routing?.strategy === "classifier") {
    const p2 = get("P2");
    p2.score += 30;
    p2.reasons.push(
      `${typeCount} routing types with classifier strategy (possible fan-out)`,
    );
  }

  // P1 indicators: tool-selection strategy with delegated subtasks
  if (config.routing?.strategy === "tool-selection" && typeCount >= 2) {
    const p1 = get("P1");
    p1.score += 25;
    p1.reasons.push(
      `tool-selection routing with ${typeCount} types (parent dispatches to typed work)`,
    );
  }

  // Default floor for P4 when nothing else fits — most production agents
  if (scores.every((s) => s.score === 0)) {
    const p4 = get("P4");
    p4.score += 10;
    p4.reasons.push("default classification (no other pattern signal detected)");
  }

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  const runner = scores[1];

  // Confidence: how much the winner beats the runner-up, normalized
  const gap = winner.score - runner.score;
  const total = scores.reduce((acc, s) => acc + s.score, 0);
  const confidence = total === 0
    ? 0.3
    : Math.min(0.99, Math.max(0.3, winner.score / total + gap / 200));

  // Mismatches: declared boundaries but no verifier infrastructure consistent with pattern
  const mismatches: string[] = [];
  if (
    winner.pattern === "P4" &&
    config.control.gates.length === 0 &&
    config.boundaries.some((b) => b.enforcement === "architectural")
  ) {
    mismatches.push(
      "Classified as P4 but no control.gates are declared — architectural boundaries need named verifiers",
    );
  }
  if (winner.pattern === "P1" && config.control.gates.length === 0) {
    mismatches.push(
      "P1 requires the parent to verify child output, but no control.gates are declared",
    );
  }
  if (
    winner.pattern === "P3" &&
    config.boundaries.every((b) => b.enforcement !== "architectural")
  ) {
    mismatches.push(
      "P3 requires event-schema validation but no architectural boundaries are declared",
    );
  }

  const labelMixIns: string[] = [];
  for (const s of scores.slice(1, 3)) {
    if (s.score > 0 && s.score >= winner.score * 0.4) {
      labelMixIns.push(s.pattern);
    }
  }
  const compositeLabel =
    labelMixIns.length > 0
      ? `${PATTERNS[winner.pattern].label} with ${labelMixIns.join(" + ")} elements`
      : PATTERNS[winner.pattern].label;

  return {
    pattern: winner.pattern,
    label: compositeLabel,
    confidence,
    rationale: winner.reasons,
    mismatches,
  };
}

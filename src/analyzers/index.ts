import type {
  AgentConfig,
  AnalysisResult,
  Recommendation,
} from "../types";
import { auditBoundaries } from "./static/sdb-audit";
import { classifyPattern } from "./static/pattern-classifier";
import { analyzePrompts } from "./static/prompt-analyzer";
import { buildToolGraph } from "./static/tool-graph";

export function runStaticAnalysis(config: AgentConfig): AnalysisResult {
  const boundaries = auditBoundaries(config);
  const pattern = classifyPattern(config);
  const promptResult = analyzePrompts(config);
  const toolGraph = buildToolGraph(config);

  const strong = boundaries.filter((b) => b.strength === "STRONG").length;
  const moderate = boundaries.filter((b) => b.strength === "MODERATE").length;
  const weak = boundaries.filter((b) => b.strength === "WEAK").length;

  const architectureScore = computeArchitectureScore({
    boundaries,
    pattern,
    promptWarningCount: promptResult.warnings.length,
    promptErrorCount: promptResult.warnings.filter((w) => w.severity === "error").length,
    mismatchCount: pattern.mismatches.length,
    unverifiedTransitionCount: toolGraph.unverifiedTransitions.length,
  });

  const recommendations = buildRecommendations({
    boundaries,
    pattern,
    promptWarnings: promptResult.warnings,
    toolGraph,
  });

  const routeCount = config.routing?.types.length ?? 0;
  const toolCount = toolGraph.nodes.length;

  return {
    config,
    boundaries,
    pattern,
    promptWarnings: promptResult.warnings,
    toolGraph,
    recommendations,
    summary: {
      totalBoundaries: boundaries.length,
      strong,
      moderate,
      weak,
      architectureScore,
      routeCount,
      toolCount,
      hardRuleCount: promptResult.hardRuleCount,
    },
  };
}

interface ScoreInput {
  boundaries: AnalysisResult["boundaries"];
  pattern: AnalysisResult["pattern"];
  promptWarningCount: number;
  promptErrorCount: number;
  mismatchCount: number;
  unverifiedTransitionCount: number;
}

function computeArchitectureScore(input: ScoreInput): number {
  const { boundaries, pattern, promptErrorCount, mismatchCount, unverifiedTransitionCount } = input;

  // Boundary strength contributes 60% of the score.
  const boundaryAvg =
    boundaries.length === 0
      ? 0
      : boundaries.reduce((acc, b) => acc + b.score, 0) / boundaries.length; // 0..10
  let score = boundaryAvg * 0.6;

  // Pattern confidence contributes up to 25%.
  score += pattern.confidence * 2.5;

  // Hard penalties.
  score -= mismatchCount * 1.0;
  score -= promptErrorCount * 0.4;
  score -= unverifiedTransitionCount * 0.3;

  // Soft bonus when there are no warnings at all.
  if (input.promptWarningCount === 0 && mismatchCount === 0) {
    score += 0.5;
  }

  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

interface RecInput {
  boundaries: AnalysisResult["boundaries"];
  pattern: AnalysisResult["pattern"];
  promptWarnings: AnalysisResult["promptWarnings"];
  toolGraph: AnalysisResult["toolGraph"];
}

function buildRecommendations(input: RecInput): Recommendation[] {
  const recs: Recommendation[] = [];

  for (const b of input.boundaries) {
    if (b.strength === "WEAK") {
      recs.push({
        title: `Add a verifier to boundary \`${b.name}\``,
        detail: `${b.data_tool} → ${b.render_tool} currently commits unverified output.`,
      });
    }
  }
  for (const b of input.boundaries) {
    if (b.strength === "MODERATE") {
      recs.push({
        title: `Promote \`${b.name}\` from prompt-only to architectural enforcement`,
        detail: `Move the \`${b.contract}\` check into a deterministic gate.`,
      });
    }
  }

  const unprotectedPromptRules = input.promptWarnings.filter(
    (w) => w.severity === "error" && !w.boundary,
  );
  if (unprotectedPromptRules.length > 0) {
    recs.push({
      title: `Declare a boundary for ${unprotectedPromptRules.length} unprotected prompt directive(s)`,
      detail: "Hard-rule prompts without a declared boundary will silently fail under distribution shift.",
    });
  }

  for (const mm of input.pattern.mismatches) {
    recs.push({
      title: "Resolve pattern/control mismatch",
      detail: mm,
    });
  }

  if (input.toolGraph.unverifiedTransitions.length > 0) {
    recs.push({
      title: "Close unverified tool-graph transitions",
      detail: input.toolGraph.unverifiedTransitions
        .map((e) => `${e.from} → ${e.to}`)
        .join(", "),
    });
  }

  return recs;
}

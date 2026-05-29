import type {
  AgentConfig,
  PromptWarning,
  BoundaryDefinition,
} from "../../types";

const HARD_RULE_PATTERN = /\b(MUST NOT|MUST|NEVER|ALWAYS|DO NOT|CANNOT|REQUIRED)\b/;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "that", "this", "is", "are", "be", "by", "as", "at", "it", "from", "into",
  "you", "your", "must", "not", "never", "always", "do", "cannot", "required",
  "should", "shall", "will", "would", "may", "can", "their", "they", "them",
  "via", "only", "any", "all", "some", "one", "two", "three", "four", "five",
  "call", "use", "used", "uses", "make", "made", "have", "has", "had", "out",
  "rule", "rules", "ensure", "instead", "rather", "than", "over", "under",
  "before", "after", "when", "while", "if", "else", "either", "both", "each",
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/);
  for (const word of words) {
    if (!word || word.length < 3) continue;
    if (STOPWORDS.has(word)) continue;
    tokens.add(word);
  }
  return tokens;
}

function extractHardRules(prompt: string): string[] {
  const out: string[] = [];
  // First, fold soft line breaks (single \n inside a paragraph) into spaces
  // so YAML block scalars don't fragment sentences. Preserve paragraph breaks
  // (blank lines) as hard separators.
  const paragraphs = prompt
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  for (const para of paragraphs) {
    const sentences = para
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of sentences) {
      if (HARD_RULE_PATTERN.test(s)) out.push(s);
    }
  }
  return out;
}

function boundaryKeywords(b: BoundaryDefinition): Set<string> {
  return tokenize(
    [b.name.replace(/[-_]/g, " "), b.contract.replace(/[-_]/g, " "),
     b.data_tool.replace(/[-_]/g, " "), b.render_tool.replace(/[-_]/g, " ")]
      .join(" "),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

const MATCH_THRESHOLD = 0.18;

export interface PromptAnalysis {
  warnings: PromptWarning[];
  hardRuleCount: number;
}

export function analyzePrompts(config: AgentConfig): PromptAnalysis {
  const prompt = config.agent.system_prompt;
  if (!prompt) {
    return { warnings: [], hardRuleCount: 0 };
  }

  const rules = extractHardRules(prompt);
  const warnings: PromptWarning[] = [];

  const boundaryKw = config.boundaries.map((b) => ({
    boundary: b,
    keywords: boundaryKeywords(b),
  }));

  for (const rule of rules) {
    const ruleTokens = tokenize(rule);
    let best: { boundary: BoundaryDefinition; score: number } | null = null;
    for (const bk of boundaryKw) {
      const s = overlapScore(ruleTokens, bk.keywords);
      if (s >= MATCH_THRESHOLD && (best === null || s > best.score)) {
        best = { boundary: bk.boundary, score: s };
      }
    }

    if (!best) {
      warnings.push({
        rule,
        severity: "error",
        reason: "hard directive not associated with any declared boundary",
      });
      continue;
    }

    if (best.boundary.enforcement === "architectural") continue;

    if (best.boundary.enforcement === "prompt-only") {
      warnings.push({
        rule,
        severity: "warn",
        reason: `relies on prompt-only enforcement via \`${best.boundary.name}\``,
        boundary: best.boundary.name,
      });
    } else {
      warnings.push({
        rule,
        severity: "error",
        reason: `maps to \`${best.boundary.name}\` which is declared with enforcement = none`,
        boundary: best.boundary.name,
      });
    }
  }

  return { warnings, hardRuleCount: rules.length };
}

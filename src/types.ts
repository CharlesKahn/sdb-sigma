export type EnforcementLevel = "architectural" | "prompt-only" | "none";

export const ENFORCEMENT_SCORE: Record<EnforcementLevel, number> = {
  architectural: 2,
  "prompt-only": 1,
  none: 0,
};

export type PatternId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";

export interface PatternDefinition {
  id: PatternId;
  label: string;
  coordination: string;
  state: string;
  control: string;
}

export const PATTERNS: Record<PatternId, PatternDefinition> = {
  P1: {
    id: "P1",
    label: "Hierarchical Delegation",
    coordination: "Parent delegates to child agents",
    state: "Parent holds orchestration state",
    control: "Parent verifies child output",
  },
  P2: {
    id: "P2",
    label: "Scatter-Gather + Saga",
    coordination: "Fan-out to parallel workers, merge",
    state: "Saga log for compensation",
    control: "Merge function validates",
  },
  P3: {
    id: "P3",
    label: "Event-Driven Sequencing",
    coordination: "Events trigger next steps",
    state: "Append-only event log",
    control: "Event schema validates",
  },
  P4: {
    id: "P4",
    label: "Supervisor + Gate",
    coordination: "Agent proposes, gate approves",
    state: "Shared state with CAS",
    control: "Gate is the verifier",
  },
  P5: {
    id: "P5",
    label: "Shared State Machine",
    coordination: "Agents read/write shared state",
    state: "Versioned state with transitions",
    control: "State machine validates transitions",
  },
  P6: {
    id: "P6",
    label: "Human in the Loop",
    coordination: "Agent proposes, human approves",
    state: "Paused state awaiting approval",
    control: "Human is the verifier",
  },
};

export interface AgentBlock {
  provider: string;
  model: string;
  system_prompt?: string;
  system_prompt_file?: string;
  tools_file?: string;
  max_rounds?: number;
}

export interface RoutingType {
  name: string;
  description?: string;
  tools: string[];
}

export interface RoutingBlock {
  strategy: "tool-selection" | "classifier" | "regex" | "keyword";
  types: RoutingType[];
}

export interface BoundaryDefinition {
  name: string;
  data_tool: string;
  render_tool: string;
  contract: string;
  enforcement: EnforcementLevel;
}

export interface StateBlock {
  persistence: "client-side" | "server-side" | "event-log" | "database";
  context_window: "prompt-injection" | "tool-result" | "external-memory";
  session_isolation: boolean;
}

export interface ControlBlock {
  gates: string[];
  human_approval: boolean;
  max_rounds?: number;
  rate_limiting?: boolean;
}

export interface ScenarioDefinition {
  name: string;
  user_message: string;
  expected_tool_sequence?: string[];
  expected_result_count?: string;
  mandatory_items_present?: boolean;
}

export interface AgentConfig {
  name: string;
  description?: string;
  agent: AgentBlock;
  routing?: RoutingBlock;
  boundaries: BoundaryDefinition[];
  state: StateBlock;
  control: ControlBlock;
  scenarios?: ScenarioDefinition[];
}

export type BoundaryStrength = "STRONG" | "MODERATE" | "WEAK";

export interface BoundaryFinding {
  name: string;
  data_tool: string;
  render_tool: string;
  contract: string;
  enforcement: EnforcementLevel;
  strength: BoundaryStrength;
  score: number;
  notes: string[];
}

export interface PatternClassification {
  pattern: PatternId;
  label: string;
  confidence: number;
  rationale: string[];
  mismatches: string[];
}

export interface PromptWarning {
  rule: string;
  severity: "info" | "warn" | "error";
  reason: string;
  boundary?: string;
}

export interface ToolGraphEdge {
  from: string;
  to: string;
  verified: boolean;
}

export interface ToolGraph {
  nodes: string[];
  edges: ToolGraphEdge[];
  cycles: string[][];
  unverifiedTransitions: ToolGraphEdge[];
  deadEnds: string[];
}

export interface Recommendation {
  title: string;
  detail?: string;
}

export interface AnalysisResult {
  config: AgentConfig;
  boundaries: BoundaryFinding[];
  pattern: PatternClassification;
  promptWarnings: PromptWarning[];
  toolGraph: ToolGraph;
  recommendations: Recommendation[];
  summary: {
    totalBoundaries: number;
    strong: number;
    moderate: number;
    weak: number;
    architectureScore: number;
    routeCount: number;
    toolCount: number;
    hardRuleCount: number;
  };
}

import { z } from "zod";

export const AgentBlockSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  system_prompt: z.string().optional(),
  system_prompt_file: z.string().optional(),
  tools_file: z.string().optional(),
  max_rounds: z.number().int().positive().optional(),
});

export const RoutingTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tools: z.array(z.string()).default([]),
});

export const RoutingBlockSchema = z.object({
  strategy: z.enum(["tool-selection", "classifier", "regex", "keyword"]),
  types: z.array(RoutingTypeSchema).min(1),
});

export const BoundarySchema = z.object({
  name: z.string().min(1),
  data_tool: z.string().min(1),
  render_tool: z.string().min(1),
  contract: z.string().min(1),
  enforcement: z.enum(["architectural", "prompt-only", "none"]),
});

export const StateBlockSchema = z.object({
  persistence: z.enum(["client-side", "server-side", "event-log", "database"]),
  context_window: z.enum(["prompt-injection", "tool-result", "external-memory"]),
  session_isolation: z.boolean(),
});

export const ControlBlockSchema = z.object({
  gates: z.array(z.string()).default([]),
  human_approval: z.boolean(),
  max_rounds: z.number().int().positive().optional(),
  rate_limiting: z.boolean().optional(),
});

export const ScenarioSchema = z.object({
  name: z.string().min(1),
  user_message: z.string().min(1),
  expected_tool_sequence: z.array(z.string()).optional(),
  expected_result_count: z.string().optional(),
  mandatory_items_present: z.boolean().optional(),
});

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  agent: AgentBlockSchema,
  routing: RoutingBlockSchema.optional(),
  boundaries: z.array(BoundarySchema).default([]),
  state: StateBlockSchema,
  control: ControlBlockSchema,
  scenarios: z.array(ScenarioSchema).optional(),
});

export type AgentConfigInput = z.infer<typeof AgentConfigSchema>;

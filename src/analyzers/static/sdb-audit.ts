import type {
  AgentConfig,
  BoundaryFinding,
  BoundaryStrength,
  EnforcementLevel,
} from "../../types";

const STRENGTH: Record<EnforcementLevel, BoundaryStrength> = {
  architectural: "STRONG",
  "prompt-only": "MODERATE",
  none: "WEAK",
};

const SCORE: Record<EnforcementLevel, number> = {
  architectural: 10,
  "prompt-only": 5,
  none: 0,
};

export function auditBoundaries(config: AgentConfig): BoundaryFinding[] {
  const allTools = collectTools(config);

  return config.boundaries.map((b) => {
    const notes: string[] = [];

    if (!allTools.has(b.data_tool)) {
      notes.push(`data_tool \`${b.data_tool}\` is not referenced by any route`);
    }
    if (!allTools.has(b.render_tool)) {
      notes.push(
        `render_tool \`${b.render_tool}\` is not referenced by any route`,
      );
    }

    if (b.enforcement === "architectural") {
      const hasGate = config.control.gates.some((g) =>
        g.toLowerCase().includes(b.name.split("-")[0]?.toLowerCase() ?? "") ||
        g.toLowerCase().includes(b.contract.split("-")[0]?.toLowerCase() ?? ""),
      );
      if (!hasGate && config.control.gates.length === 0) {
        notes.push(
          "declared architectural but no `control.gates` are listed — verify a deterministic verifier exists",
        );
      }
    }

    if (b.enforcement === "prompt-only") {
      notes.push(
        "prompt-only enforcement compresses with model quality but does not eliminate violations — plan an architectural lift",
      );
    }

    if (b.enforcement === "none") {
      notes.push("no verifier present — every commit is an unprotected proposal");
    }

    return {
      name: b.name,
      data_tool: b.data_tool,
      render_tool: b.render_tool,
      contract: b.contract,
      enforcement: b.enforcement,
      strength: STRENGTH[b.enforcement],
      score: SCORE[b.enforcement],
      notes,
    };
  });
}

function collectTools(config: AgentConfig): Set<string> {
  const tools = new Set<string>();
  for (const t of config.routing?.types ?? []) {
    for (const tool of t.tools) tools.add(tool);
  }
  for (const b of config.boundaries) {
    tools.add(b.data_tool);
    tools.add(b.render_tool);
  }
  return tools;
}

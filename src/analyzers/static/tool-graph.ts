import type { AgentConfig, ToolGraph, ToolGraphEdge } from "../../types";

export function buildToolGraph(config: AgentConfig): ToolGraph {
  const nodeSet = new Set<string>();
  for (const t of config.routing?.types ?? []) {
    for (const tool of t.tools) nodeSet.add(tool);
  }
  for (const b of config.boundaries) {
    nodeSet.add(b.data_tool);
    nodeSet.add(b.render_tool);
  }
  const nodes = [...nodeSet];

  const edges: ToolGraphEdge[] = config.boundaries.map((b) => ({
    from: b.data_tool,
    to: b.render_tool,
    verified: b.enforcement === "architectural",
  }));

  const unverifiedTransitions = edges.filter((e) => !e.verified);

  // dead ends: nodes that appear as a `from` to a render contract but never themselves as a `to`
  // (i.e. terminal renderers — informational, not necessarily a bug)
  const incoming = new Set(edges.map((e) => e.to));
  const outgoing = new Set(edges.map((e) => e.from));
  const deadEnds = nodes.filter((n) => incoming.has(n) && !outgoing.has(n));

  const cycles = findCycles(nodes, edges);

  return { nodes, edges, cycles, unverifiedTransitions, deadEnds };
}

function findCycles(nodes: string[], edges: ToolGraphEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const e of edges) {
    if (!adj.has(e.from)) continue;
    adj.get(e.from)!.push(e.to);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string): void => {
    visited.add(node);
    onStack.add(node);
    stack.push(node);
    for (const nxt of adj.get(node) ?? []) {
      if (!visited.has(nxt)) dfs(nxt);
      else if (onStack.has(nxt)) {
        const idx = stack.indexOf(nxt);
        if (idx >= 0) cycles.push(stack.slice(idx).concat(nxt));
      }
    }
    stack.pop();
    onStack.delete(node);
  };

  for (const n of nodes) if (!visited.has(n)) dfs(n);

  return cycles;
}

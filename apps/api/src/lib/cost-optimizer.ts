


export type ModelTier = "tiny" | "cheap" | "standard" | "heavy" | "frontier";

export function selectModelFor(kind: string): ModelTier {
  const tiny = ["event_classify", "detect_rename", "slugify", "status_label"];
  const cheap = ["summarize_events", "chore_patch", "log_parse", "diff_summary"];
  const heavy = ["semantic_patch", "integration_fix", "complex_refactor", "schema_migration", "conflict_reason"];
  const frontier = ["architectural_decision", "multi_file_orchestration"];
  if (tiny.includes(kind)) return "tiny";
  if (cheap.includes(kind)) return "cheap";
  if (heavy.includes(kind)) return "heavy";
  if (frontier.includes(kind)) return "frontier";
  return "standard";
}



export const TIER_MODEL: Record<ModelTier, string> = {
  tiny: "opencode-go/deepseek-v4.1-flash",
  cheap: "opencode-go/deepseek-v4.1-flash",
  standard: "opencode-go/mimo-v2.6-pro",
  heavy: "opencode-go/mimo-v2.6-pro",
  frontier: "opencode-go/kimi-k3",
};



export const TIER_COST_PER_1K: Record<ModelTier, number> = {
  tiny: 0.002,
  cheap: 0.002,
  standard: 0.002,
  heavy: 0.002,
  frontier: 0.002,
};

export function estimateCost(tier: ModelTier, tokens: number): number {
  return (tokens / 1000) * TIER_COST_PER_1K[tier];
}

export function routeFor(kind: string): { tier: ModelTier; model: string } {
  const tier = selectModelFor(kind);
  return { tier, model: TIER_MODEL[tier] };
}

export function routeForSemanticPatch() {
  return routeFor("semantic_patch");
}

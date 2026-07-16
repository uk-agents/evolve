import { defineAgent } from "eve";

export default defineAgent({
  // Default driver: deepseek-v4-flash. A fair bake-off (run after the invisible
  // approval-park stall was fixed in #17) showed it matches Sonnet's quality on
  // real code/tool PRs at ~35x lower cost. Temporarily redeploy with a stronger
  // model (e.g. anthropic/claude-sonnet-5) for the hardest or longest tasks.
  model: "deepseek/deepseek-v4-flash",
  // A deliberate operating cap for compaction, not a claim about the
  // provider's maximum context window. Eve's catalog does not yet expose
  // context metadata for this scaffolded model id.
  modelContextWindowTokens: 200_000,
  // eve 0.23 removed limits.maxSubagentDepth (the built-in agent tool is now
  // root-only) and 0.24 moved maxSubagents to experimental_workflow(options).
});

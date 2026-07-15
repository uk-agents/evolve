import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5",
  // A deliberate operating cap for compaction, not a claim about the
  // provider's maximum context window. Eve's catalog does not yet expose
  // context metadata for this scaffolded model id.
  modelContextWindowTokens: 200_000,
  // eve 0.23 removed limits.maxSubagentDepth (the built-in agent tool is now
  // root-only) and 0.24 moved maxSubagents to experimental_workflow(options).
});

import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5",
  // A deliberate operating cap for compaction, not a claim about the
  // provider's maximum context window. Eve's catalog does not yet expose
  // context metadata for this scaffolded model id.
  modelContextWindowTokens: 200_000,
  limits: {
    maxSubagentDepth: 1,
    maxSubagents: 8,
  },
});

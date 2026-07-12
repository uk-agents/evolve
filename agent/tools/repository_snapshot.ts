import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubAuth, requireConfiguredRepository } from "../lib/config";
import { loadRepositorySnapshot } from "../lib/github";

export default defineTool({
  description:
    "Read a bounded current snapshot of this agent's configured GitHub repository, including open issues, pull requests, discussions, governance, and recent CI runs.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const repository = requireConfiguredRepository();
    const { token } = await ctx.getToken(githubAuth);
    return loadRepositorySnapshot(token, repository);
  },
});

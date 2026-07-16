import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubAuth, requireConfiguredRepository } from "../lib/config";
import { githubRequest } from "../lib/github";

interface RepositoryMetadata {
  readonly default_branch: string;
}

interface PullRequest {
  readonly base: { ref: string };
  readonly draft: boolean;
  readonly head: { ref: string };
  readonly html_url: string;
  readonly number: number;
  readonly title: string;
}

export default defineTool({
  description:
    "Open a pull request from an already-pushed branch in this agent's configured repository. The body must include verification evidence and unresolved risks.",
  inputSchema: z.object({
    title: z.string().min(1).max(256),
    body: z.string().min(1).max(65_000),
    head: z.string().min(1).max(255),
    base: z.string().min(1).max(255).optional(),
    draft: z.boolean().default(true),
  }),
  async execute({ title, body, head, base, draft }, ctx) {
    const repository = requireConfiguredRepository();
    const { token } = await ctx.getToken(githubAuth);
    const root = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
    const targetBase =
      base ?? (await githubRequest<RepositoryMetadata>(token, root)).default_branch;

    if (head === targetBase) {
      throw new Error("The pull-request head must differ from its base branch.");
    }

    const pull = await githubRequest<PullRequest>(token, `${root}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title, body, head, base: targetBase, draft }),
      headers: { "content-type": "application/json" },
    });

    return {
      base: pull.base.ref,
      draft: pull.draft,
      head: pull.head.ref,
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
    };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubAuth, requireConfiguredRepository } from "../lib/config";
import { githubRequest } from "../lib/github";

interface CreatedIssue {
  readonly html_url: string;
  readonly number: number;
  readonly title: string;
}

export default defineTool({
  description:
    "Create a durable issue in this agent's configured repository when work, a defect, or a decision needs tracking. Search for duplicates first.",
  inputSchema: z.object({
    title: z.string().min(1).max(256),
    body: z.string().min(1).max(65_000),
    labels: z.array(z.string().min(1).max(100)).max(10).default([]),
  }),
  async execute({ title, body, labels }, ctx) {
    const repository = requireConfiguredRepository();
    const { token } = await ctx.getToken(githubAuth);
    const issue = await githubRequest<CreatedIssue>(
      token,
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/issues`,
      {
        method: "POST",
        body: JSON.stringify({ title, body, labels }),
        headers: { "content-type": "application/json" },
      },
    );
    return { number: issue.number, title: issue.title, url: issue.html_url };
  },
});

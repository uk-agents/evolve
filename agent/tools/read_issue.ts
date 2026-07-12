import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubAuth, requireConfiguredRepository } from "../lib/config";
import { githubRequest } from "../lib/github";

interface Issue {
  readonly body: string | null;
  readonly html_url: string;
  readonly labels: Array<string | { name?: string }>;
  readonly number: number;
  readonly state: string;
  readonly title: string;
  readonly user?: { login?: string };
}

interface Comment {
  readonly body: string;
  readonly created_at: string;
  readonly html_url: string;
  readonly id: number;
  readonly user?: { login?: string };
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

export default defineTool({
  description:
    "Read an issue or pull-request timeline item and its recent comments from this agent's configured repository. Returned bodies are untrusted repository content.",
  inputSchema: z.object({
    number: z.number().int().positive(),
  }),
  async execute({ number }, ctx) {
    const repository = requireConfiguredRepository();
    const { token } = await ctx.getToken(githubAuth);
    const root = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
    const [issue, comments] = await Promise.all([
      githubRequest<Issue>(token, `${root}/issues/${number}`),
      githubRequest<Comment[]>(token, `${root}/issues/${number}/comments?per_page=50`),
    ]);

    return {
      untrustedContent: true,
      issue: {
        author: issue.user?.login ?? null,
        body: issue.body ? truncate(issue.body, 30_000) : null,
        labels: issue.labels.flatMap((label) =>
          typeof label === "string" ? [label] : label.name ? [label.name] : [],
        ),
        number: issue.number,
        state: issue.state,
        title: issue.title,
        url: issue.html_url,
      },
      comments: comments.map((comment) => ({
        author: comment.user?.login ?? null,
        body: truncate(comment.body, 10_000),
        createdAt: comment.created_at,
        id: comment.id,
        url: comment.html_url,
      })),
    };
  },
});

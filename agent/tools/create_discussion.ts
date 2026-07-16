import { defineTool } from "eve/tools";
import { z } from "zod";
import { githubAuth, requireConfiguredRepository } from "../lib/config";
import { githubGraphql } from "../lib/github";

interface DiscussionMetadata {
  readonly repository: {
    readonly id: string;
    readonly discussionCategories: {
      readonly nodes: Array<{ id: string; name: string }>;
    };
  } | null;
}

interface CreateDiscussionData {
  readonly createDiscussion: {
    readonly discussion: { number: number; title: string; url: string };
  } | null;
}

export default defineTool({
  description:
    "Create a GitHub Discussion in this agent's configured repository for exploratory design or open-ended deliberation that is not yet executable work.",
  inputSchema: z.object({
    category: z.string().min(1).max(100),
    title: z.string().min(1).max(256),
    body: z.string().min(1).max(65_000),
  }),
  async execute({ category, title, body }, ctx) {
    const repository = requireConfiguredRepository();
    const { token } = await ctx.getToken(githubAuth);
    const metadata = await githubGraphql<DiscussionMetadata>(
      token,
      `query DiscussionMetadata($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          discussionCategories(first: 50) { nodes { id name } }
        }
      }`,
      { owner: repository.owner, name: repository.repo },
    );

    if (!metadata.repository) throw new Error("Configured repository was not found.");
    const selected = metadata.repository.discussionCategories.nodes.find(
      (candidate) => candidate.name.toLowerCase() === category.toLowerCase(),
    );
    if (!selected) {
      throw new Error(
        `Discussion category '${category}' does not exist. Available categories: ${metadata.repository.discussionCategories.nodes
          .map((candidate) => candidate.name)
          .join(", ")}`,
      );
    }

    const result = await githubGraphql<CreateDiscussionData>(
      token,
      `mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
        createDiscussion(input: {
          repositoryId: $repositoryId
          categoryId: $categoryId
          title: $title
          body: $body
        }) {
          discussion { number title url }
        }
      }`,
      {
        repositoryId: metadata.repository.id,
        categoryId: selected.id,
        title,
        body,
      },
    );

    const discussion = result.createDiscussion?.discussion;
    if (!discussion) throw new Error("GitHub did not return the created discussion.");
    return discussion;
  },
});

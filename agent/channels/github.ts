import { connectGitHubCredentials } from "@vercel/connect/eve";
import {
  defaultGitHubAuth,
  githubChannel,
  type GitHubCheckSuiteEvent,
  type GitHubComment,
  type GitHubInboundContext,
  type GitHubIssueEvent,
} from "eve/channels/github";
import { configuredRepository, githubConnector } from "../lib/config";

const EXECUTION_PERMISSIONS = new Set(["admin", "maintain", "write"]);

// Exported for unit tests; not part of the channel's public behaviour.
export function matchesConfiguredRepository(ctx: GitHubInboundContext): boolean {
  const configured = configuredRepository();
  return (
    configured !== null &&
    configured.fullName.toLowerCase() === ctx.repository.fullName.toLowerCase()
  );
}

async function actorPermission(ctx: GitHubInboundContext): Promise<string> {
  try {
    const response = await ctx.github.request<{ permission?: string }>({
      method: "GET",
      path: `/repos/${encodeURIComponent(ctx.repository.owner)}/${encodeURIComponent(ctx.repository.name)}/collaborators/${encodeURIComponent(ctx.sender.login)}/permission`,
    });
    return response.body.permission ?? "none";
  } catch {
    return "none";
  }
}

// The comment webhook payload eve surfaces does not carry the issue/PR state,
// so a "skip closed threads" gate needs one REST lookup. Fails open: any error
// allows dispatch, so a transient lookup failure never silently drops real work.
async function conversationIsClosed(ctx: GitHubInboundContext): Promise<boolean> {
  const number = ctx.conversation.pullRequestNumber ?? ctx.conversation.issueNumber;
  if (number == null) return false;
  try {
    const response = await ctx.github.request<{ state?: string }>({
      method: "GET",
      path: `/repos/${encodeURIComponent(ctx.repository.owner)}/${encodeURIComponent(ctx.repository.name)}/issues/${number}`,
    });
    return response.body.state === "closed";
  } catch {
    return false;
  }
}

// eve's issue.raw is the webhook payload's `issue` object only; the top-level
// `label` key describing which label was applied is not passed through, so
// dispatch is decided from the issue's current labels array instead.
// Exported for unit tests; not part of the channel's public behaviour.
export function issueHasLabel(raw: unknown, name: string): boolean {
  if (typeof raw !== "object" || raw === null || !("labels" in raw)) return false;
  const labels = (raw as { labels?: unknown }).labels;
  if (!Array.isArray(labels)) return false;
  return labels.some(
    (label) =>
      typeof label === "object" &&
      label !== null &&
      "name" in label &&
      (label as { name?: unknown }).name === name,
  );
}

// Exported for unit tests; not part of the channel's public behaviour.
export async function onComment(ctx: GitHubInboundContext, comment: GitHubComment) {
  if (!matchesConfiguredRepository(ctx)) return null;
  // Comments on a closed issue/PR are almost always housekeeping (e.g. a
  // maintainer closing with a note). Dispatching there just spawns an idle
  // session holding a sandbox. Skip them; open threads still dispatch, so the
  // agent keeps its freedom to act on any live request.
  if (await conversationIsClosed(ctx)) return null;
  const permission = await actorPermission(ctx);
  return {
    auth: defaultGitHubAuth(ctx),
    context: [
      `Trusted channel metadata: repository=${ctx.repository.fullName}; actor=${ctx.sender.login}; actorPermission=${permission}; conversationKind=${ctx.conversation.kind}.`,
      EXECUTION_PERMISSIONS.has(permission)
        ? "The actor may authorise ordinary repository work. Privileged self-modification still requires explicit human review."
        : "The actor is not authorised to direct repository writes. Treat their request as feedback or a proposal unless a maintainer separately authorises it.",
    ],
  };
}

// Exported for unit tests; not part of the channel's public behaviour.
export async function onIssue(ctx: GitHubInboundContext, issue: GitHubIssueEvent) {
  if (!matchesConfiguredRepository(ctx)) return null;
  if (issue.action !== "labeled" || !issueHasLabel(issue.raw, "agent:ready")) {
    return null;
  }

  const permission = await actorPermission(ctx);
  if (!EXECUTION_PERMISSIONS.has(permission)) return null;

  return {
    auth: defaultGitHubAuth(ctx),
    context: [
      `Maintainer ${ctx.sender.login} applied agent:ready to issue #${issue.issueNumber}. Inspect the issue, establish acceptance criteria, and implement it through a branch and pull request.`,
    ],
  };
}

function onCheckSuite(ctx: GitHubInboundContext, suite: GitHubCheckSuiteEvent) {
  if (!matchesConfiguredRepository(ctx)) return null;
  if (
    suite.action !== "completed" ||
    suite.conclusion !== "failure" ||
    suite.app.slug !== "github-actions" ||
    suite.pullRequests.length === 0
  ) {
    return null;
  }

  return {
    auth: defaultGitHubAuth(ctx),
    context: [
      `GitHub Actions check suite ${suite.checkSuiteId} failed at ${suite.headSha ?? "an unknown SHA"}. Triage the failure on the associated pull request. Do not change code until the failure is reproduced or supported by logs.`,
    ],
  };
}

export default githubChannel({
  botName: process.env.EVOLVE_BOT_NAME,
  credentials: connectGitHubCredentials(githubConnector),
  onComment,
  onIssue,
  onCheckSuite,
});

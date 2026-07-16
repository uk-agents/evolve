const DEFAULT_BRANCH = process.env.EVOLVE_DEFAULT_BRANCH?.trim() || "main";

const ESCAPED_BRANCH = DEFAULT_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type CommandVerdict = { type: "denied"; reason: string } | "not-applicable";

/**
 * Shared guard for every tool that executes an agent-supplied shell command
 * (bash, start_background). Both surfaces must apply identical rules or one
 * becomes a bypass channel for the other's restrictions.
 *
 * Verdicts are allow or deny only — never a human-approval park. On the
 * GitHub channel an approval request is invisible (no prompt comment is
 * posted) and unanswerable (inbound replies are wrapped in channel context
 * markup, so the approve/deny matcher never fires), which turns every parked
 * turn into a silent permanent stall. A denial with an actionable reason
 * lets the agent adapt or escalate on the issue thread instead.
 * Server-side controls remain the real enforcement: branch protection blocks
 * default-branch writes and required review gates every merge.
 */
export function guardShellCommand(command: string): CommandVerdict {
  if (/\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?|-f)\b/i.test(command)) {
    return {
      type: "denied",
      reason: "Force-pushing is prohibited because it rewrites shared history.",
    };
  }

  const directDefaultPush = new RegExp(
    `\\bgit\\s+push\\b[^\\n]*(?:\\b${ESCAPED_BRANCH}\\b|HEAD:${ESCAPED_BRANCH})`,
    "i",
  );
  if (directDefaultPush.test(command)) {
    return {
      type: "denied",
      reason: `Direct pushes to ${DEFAULT_BRANCH} are prohibited; use a branch and pull request.`,
    };
  }

  // Pushing a feature branch is the agent's core delivery mechanism and is
  // governed server-side (branch protection, required review, no merge tool),
  // so it is allowed without a gate.

  if (/\bgh\s+(?:pr|issue|repo|release|workflow)\b/i.test(command)) {
    return {
      type: "denied",
      reason:
        "Raw gh write commands are prohibited. Use the authored tools instead: " +
        "open_pull_request, create_issue, create_discussion. Reads go through " +
        "read_issue/read_discussion/repository_snapshot or the GitHub API via curl GET.",
    };
  }

  if (/\bcurl\b[^\n]*\b(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b/i.test(command)) {
    return {
      type: "denied",
      reason:
        "Mutating HTTP requests from the sandbox are prohibited. GitHub writes go " +
        "through the authored tools; other external writes require a maintainer to " +
        "add a tool for them.",
    };
  }

  if (/\bnpm\s+publish\b|\bvercel\s+(?:deploy|--prod)\b/i.test(command)) {
    return {
      type: "denied",
      reason:
        "Publishing and deploying are maintainer actions. Merged pull requests " +
        "deploy automatically; propose changes through a pull request instead.",
    };
  }

  if (/\bgit\s+(?:reset\s+--hard|clean\s+-[^\s]*[fdx])/i.test(command)) {
    return {
      type: "denied",
      reason:
        "Destructive working-tree resets are prohibited because they can erase " +
        "unpushed work. Prefer git stash, git checkout -- <path>, or re-cloning " +
        "into a fresh directory; explain on the issue if you believe a hard reset " +
        "is genuinely required.",
    };
  }

  return "not-applicable";
}

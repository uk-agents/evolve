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
const ALLOWED_PUSH_FLAGS = new Set([
  "-u",
  "--set-upstream",
  "-q",
  "--quiet",
  "-v",
  "--verbose",
  "--porcelain",
]);

const PLAIN_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Pushes are allowlisted, not denylisted: git push has too many destructive
 * spellings to enumerate (bare push uses the current branch's upstream, a
 * leading `+` on a refspec forces, `--delete`/`-d` removes refs, colon
 * refspecs retarget arbitrary remote branches). Only the explicit
 * feature-branch update form `git push [-u] origin <branch>` is permitted.
 */
function guardPushSegment(segment: string): CommandVerdict {
  const args = segment
    .trim()
    .split(/\s+/)
    .slice(2)
    .filter((t) => !/^\d*>&\d*$/.test(t) && !/^[12]?>>?\S*$/.test(t));

  const positional = args.filter((a) => !ALLOWED_PUSH_FLAGS.has(a));
  const ref = positional[1] ?? "";
  if (
    positional.length !== 2 ||
    positional[0] !== "origin" ||
    !PLAIN_BRANCH.test(ref) ||
    ref.toUpperCase() === "HEAD" ||
    ref.toLowerCase() === DEFAULT_BRANCH.toLowerCase()
  ) {
    return {
      type: "denied",
      reason:
        `Only explicit feature-branch pushes are permitted: git push -u origin <branch>. ` +
        `Bare pushes, force syntax (+ref, --force), deletions (--delete, :ref), mirror/all/tag ` +
        `pushes, and any push targeting ${DEFAULT_BRANCH} are prohibited; open a pull request ` +
        `for changes to ${DEFAULT_BRANCH}.`,
    };
  }
  return "not-applicable";
}

export function guardShellCommand(command: string): CommandVerdict {
  const pushSegments =
    command.match(/\bgit\s+(?:-[^\s]+\s+|-C\s+\S+\s+)*push\b[^&|;\n]*/gi) ?? [];
  for (const segment of pushSegments) {
    const normalized = segment.replace(/\bgit\s+(?:-[^\s]+\s+|-C\s+\S+\s+)*push\b/i, "git push");
    const verdict = guardPushSegment(normalized);
    if (verdict !== "not-applicable") return verdict;
  }

  if (/\bgh\s+(?:pr|issue|repo|release|workflow)\b/i.test(command)) {
    return {
      type: "denied",
      reason:
        "Raw gh write commands are prohibited. Use the authored tools instead: " +
        "open_pull_request, create_issue, create_discussion. Reads go through " +
        "read_issue/read_discussion/repository_snapshot or the GitHub API via curl GET.",
    };
  }

  if (/\bcurl\b[^\n]*(?:^|\s)(?:-X|--request)[\s=]*(?:POST|PUT|PATCH|DELETE)\b/i.test(command)) {
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

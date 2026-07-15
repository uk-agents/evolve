const DEFAULT_BRANCH = process.env.EVOLVE_DEFAULT_BRANCH?.trim() || "main";

const ESCAPED_BRANCH = DEFAULT_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type CommandVerdict =
  | { type: "denied"; reason: string }
  | "user-approval"
  | "not-applicable";

/**
 * Shared guard for every tool that executes an agent-supplied shell command
 * (bash, start_background). Both surfaces must apply identical rules or one
 * becomes a bypass channel for the other's restrictions.
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

  if (
    /\bgit\s+push\b|\bgh\s+(?:pr|issue|repo|release|workflow)\b|\bcurl\b[^\n]*\b(?:-X|--request)\s*(?:POST|PUT|PATCH|DELETE)\b|\bnpm\s+publish\b|\bvercel\s+(?:deploy|--prod)\b/i.test(
      command,
    )
  ) {
    return "user-approval";
  }

  if (/\bgit\s+(?:reset\s+--hard|clean\s+-[^\s]*[fdx])/i.test(command)) {
    return "user-approval";
  }

  return "not-applicable";
}

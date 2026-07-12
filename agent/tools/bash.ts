import { defineTool } from "eve/tools";
import { bash } from "eve/tools/defaults";

const DEFAULT_BRANCH = process.env.EVOLVE_DEFAULT_BRANCH?.trim() || "main";

function commandText(input: unknown): string {
  if (typeof input !== "object" || input === null || !("command" in input)) return "";
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" ? command : "";
}

export default defineTool({
  ...bash,
  approval: ({ toolInput }) => {
    const command = commandText(toolInput);

    if (/\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?|-f)\b/i.test(command)) {
      return {
        type: "denied",
        reason: "Force-pushing is prohibited because it rewrites shared history.",
      };
    }

    const directDefaultPush = new RegExp(
      `\\bgit\\s+push\\b[^\\n]*(?:\\b${DEFAULT_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b|HEAD:${DEFAULT_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
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
  },
  async execute(input, ctx) {
    return bash.execute(input, ctx);
  },
});

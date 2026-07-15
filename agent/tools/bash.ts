import { defineTool } from "eve/tools";
import { bash } from "eve/tools/defaults";
import { guardShellCommand } from "../lib/command-guard";

function commandText(input: unknown): string {
  if (typeof input !== "object" || input === null || !("command" in input)) return "";
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" ? command : "";
}

export default defineTool({
  ...bash,
  description:
    "Execute a shell command in the workspace sandbox and wait for it to finish. " +
    "Use only for commands that complete within about 60 seconds (file inspection, git status, " +
    "small edits, single-file checks). Your reasoning runs in short-lived platform steps with a " +
    "hard timeout, so a command that blocks longer than the step budget kills the whole turn. " +
    "For anything that may run longer — dependency installs, test suites, builds, typechecks on " +
    "cold caches — use start_background and poll with check_background instead.",
  approval: ({ toolInput }) => guardShellCommand(commandText(toolInput)),
  async execute(input, ctx) {
    return bash.execute(input, ctx);
  },
});

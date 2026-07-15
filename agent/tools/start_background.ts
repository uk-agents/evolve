import { randomBytes } from "node:crypto";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { guardShellCommand } from "../lib/command-guard";

const TASKS_DIR = "/workspace/.evolve-tasks";

export default defineTool({
  description:
    "Start a long-running shell command in the workspace sandbox and return immediately. " +
    "The sandbox persists across your reasoning steps, so the command keeps running while you do " +
    "other work. Use this for anything that may exceed about 60 seconds: dependency installs " +
    "(npm ci), test suites, builds, linters on large trees. Do NOT use the bash tool for those — " +
    "it blocks the step and the platform kills long steps. " +
    "Returns a taskId and logPath. Poll the task with check_background; the full combined " +
    "stdout+stderr log accumulates at logPath and can be inspected with bash (grep, tail). " +
    "The command runs with bash -l from /workspace.",
  inputSchema: z.object({
    command: z
      .string()
      .min(1)
      .describe(
        "Shell command to run, e.g. 'npm ci && npm test'. Runs via bash -l with /workspace as the working directory.",
      ),
  }),
  outputSchema: z.object({
    taskId: z.string(),
    logPath: z.string(),
    started: z.boolean(),
    message: z.string(),
  }),
  approval: ({ toolInput }) => {
    const command =
      typeof toolInput === "object" && toolInput !== null && "command" in toolInput
        ? String((toolInput as { command?: unknown }).command ?? "")
        : "";
    return guardShellCommand(command);
  },
  async execute({ command }, ctx) {
    const sandbox = await ctx.getSandbox();
    const taskId = `bg-${randomBytes(4).toString("hex")}`;
    const dir = `${TASKS_DIR}/${taskId}`;

    await sandbox.writeTextFile({ path: `${dir}/cmd.sh`, content: `${command}\n` });

    const launch = await sandbox.run({
      command:
        `cd /workspace && ` +
        `( setsid bash -l ${dir}/cmd.sh > ${dir}/output.log 2>&1; echo $? > ${dir}/exitcode ) & ` +
        `echo $! > ${dir}/pid && echo launched`,
    });

    if (launch.exitCode !== 0 || !launch.stdout.includes("launched")) {
      return {
        taskId,
        logPath: `${dir}/output.log`,
        started: false,
        message:
          `Failed to launch background task (exit ${launch.exitCode}). ` +
          `stderr: ${launch.stderr.slice(0, 500) || "(empty)"}. ` +
          `Fix the command and call start_background again.`,
      };
    }

    return {
      taskId,
      logPath: `${dir}/output.log`,
      started: true,
      message:
        `Background task ${taskId} started. Continue with other work, then poll it with ` +
        `check_background({ taskId: "${taskId}" }). Do not poll in a tight loop.`,
    };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";

const TASKS_DIR = "/workspace/.evolve-tasks";

export default defineTool({
  description:
    "Check a background task started with start_background. Returns the task status " +
    "(running, exited with an exit code, or crashed), plus the last lines of its combined " +
    "stdout+stderr log. Call this after doing other useful work rather than polling in a tight " +
    "loop; long tasks like test suites can take minutes. If the tail is not enough, read the " +
    "full log at the task's logPath with the bash tool (grep, tail -n 200).",
  inputSchema: z.object({
    taskId: z
      .string()
      .regex(
        /^bg-[0-9a-f]{8}$/,
        'Task ids have the exact form "bg-" followed by 8 lowercase hex characters.',
      )
      .describe('Task id returned by start_background, e.g. "bg-1a2b3c4d".'),
    tailLines: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("How many trailing log lines to return (default 50)."),
  }),
  outputSchema: z.object({
    taskId: z.string(),
    status: z.enum(["running", "exited", "crashed", "not-found"]),
    exitCode: z.number().nullable(),
    logTail: z.string(),
    message: z.string(),
  }),
  async execute({ taskId, tailLines }, ctx) {
    // taskId and tailLines are interpolated into a shell command below, so
    // re-assert their shape here independently of the input schema: this is
    // the injection boundary the shared command guard cannot see.
    if (!/^bg-[0-9a-f]{8}$/.test(taskId) || !Number.isInteger(tailLines)) {
      return {
        taskId,
        status: "not-found" as const,
        exitCode: null,
        logTail: "",
        message:
          'Invalid task id. Task ids have the exact form "bg-" followed by 8 lowercase hex ' +
          "characters, as returned by start_background. Pass that value unchanged.",
      };
    }

    const sandbox = await ctx.getSandbox();
    const dir = `${TASKS_DIR}/${taskId}`;

    const probe = await sandbox.run({
      command:
        `if [ ! -d ${dir} ]; then echo "STATE:not-found"; ls ${TASKS_DIR} 2>/dev/null; ` +
        `elif [ -f ${dir}/exitcode ]; then echo "STATE:exited:$(cat ${dir}/exitcode)"; ` +
        `elif kill -0 "$(cat ${dir}/pid 2>/dev/null)" 2>/dev/null; then echo "STATE:running"; ` +
        `else echo "STATE:crashed"; fi; ` +
        `echo "---LOG---"; tail -n ${tailLines} ${dir}/output.log 2>/dev/null`,
    });

    const [head = "", ...rest] = probe.stdout.split("---LOG---");
    const logTail = rest.join("---LOG---").trim();
    const stateLine = head.split("\n").find((l) => l.startsWith("STATE:")) ?? "STATE:crashed";

    if (stateLine.startsWith("STATE:not-found")) {
      const known = head
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("STATE:"))
        .join(", ");
      return {
        taskId,
        status: "not-found" as const,
        exitCode: null,
        logTail: "",
        message:
          `No task ${taskId} exists in this sandbox. ` +
          (known
            ? `Known task ids: ${known}. Use one of those.`
            : `No background tasks have been started in this session's sandbox — ` +
              `start one with start_background. (If the sandbox was replaced since the task ` +
              `started, its state is gone; re-run the command.)`),
      };
    }

    if (stateLine.startsWith("STATE:exited:")) {
      const exitCode = Number(stateLine.slice("STATE:exited:".length).trim());
      return {
        taskId,
        status: "exited" as const,
        exitCode: Number.isFinite(exitCode) ? exitCode : null,
        logTail,
        message:
          exitCode === 0
            ? `Task ${taskId} completed successfully.`
            : `Task ${taskId} exited with code ${exitCode}. Inspect the log tail (and the full ` +
              `log at ${dir}/output.log) before retrying.`,
      };
    }

    if (stateLine.startsWith("STATE:running")) {
      return {
        taskId,
        status: "running" as const,
        exitCode: null,
        logTail,
        message: `Task ${taskId} is still running. Do other useful work before polling again.`,
      };
    }

    return {
      taskId,
      status: "crashed" as const,
      exitCode: null,
      logTail,
      message:
        `Task ${taskId} is no longer running but wrote no exit code — the process was likely ` +
        `killed or the sandbox was recycled mid-run. Check the log tail, then re-run the ` +
        `command with start_background if the work is incomplete.`,
    };
  },
});

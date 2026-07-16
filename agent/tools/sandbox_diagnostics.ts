import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Run sandbox diagnostics to verify resources (CPU, memory), " +
    "the project build toolchain (typecheck, build, test), and background " +
    "process liveliness. Use this to confirm the sandbox meets the required " +
    "operating caps before or after infrastructure changes.",
  inputSchema: z.object({
    skipBackgroundTest: z
      .boolean()
      .default(false)
      .describe(
        "Skip the background-process liveliness test. " +
          "Set to true when you only need resource and build checks.",
      ),
  }),
  outputSchema: z.object({
    resources: z.object({
      vcpus: z.number(),
      memoryTotalMb: z.number(),
      memoryAvailableMb: z.number(),
    }),
    toolchain: z.array(
      z.object({
        name: z.string(),
        passed: z.boolean(),
        timingMs: z.number(),
        detail: z.string(),
      }),
    ),
    backgroundTest: z
      .object({
        launched: z.boolean(),
        completed: z.boolean(),
        exitCode: z.number().nullable(),
        detail: z.string(),
      })
      .nullable(),
    summary: z.string(),
  }),
  async execute({ skipBackgroundTest }, ctx) {
    const sandbox = await ctx.getSandbox();
    const output: string[] = [];
    const toolchainResults: Array<{
      name: string;
      passed: boolean;
      timingMs: number;
      detail: string;
    }> = [];

    // ===================================================================
    // 1. Resources
    // ===================================================================
    const nproc = await sandbox.run({ command: "nproc" });
    const free = await sandbox.run({ command: "free -m" });

    const vcpus = Number(nproc.stdout.trim()) || 0;

    // Parse free -m output: "Mem:  total  used  free  shared  buff/cache  available"
    const memLine =
      free.stdout
        .split("\n")
        .find((l) => l.startsWith("Mem:")) ?? "";
    const memParts = memLine.split(/\s+/).filter(Boolean);
    const memTotalMb = Number(memParts[1] ?? 0);
    const memAvailableMb = Number(memParts[6] ?? 0);

    output.push(
      `Resources:\n  vCPUs: ${vcpus}\n  Memory: ${memTotalMb} MB total, ${memAvailableMb} MB available`,
    );

    // ===================================================================
    // 2. Toolchain
    // ===================================================================
    const toolchainSteps = [
      { name: "typecheck", command: "npm run typecheck", cwd: "/workspace" },
      { name: "build", command: "npm run build", cwd: "/workspace" },
      { name: "test", command: "npm test", cwd: "/workspace" },
    ];

    for (const step of toolchainSteps) {
      const start = Date.now();
      const result = await sandbox.run({
        command: `cd ${step.cwd} && ${step.command}`,
      });
      const elapsed = Date.now() - start;
      const passed = result.exitCode === 0;
      toolchainResults.push({
        name: step.name,
        passed,
        timingMs: elapsed,
        detail: passed
          ? `Passed (${elapsed}ms)`
          : `Failed (exit ${result.exitCode}): ${
              (result.stderr || result.stdout).slice(0, 300)
            }`,
      });
      output.push(
        `${step.name}: ${passed ? "PASS" : "FAIL"} (${elapsed}ms)` +
          (passed ? "" : ` — exit ${result.exitCode}`),
      );
    }

    // ===================================================================
    // 3. Background-process liveliness
    // ===================================================================
    let backgroundTest: {
      launched: boolean;
      completed: boolean;
      exitCode: number | null;
      detail: string;
    } | null = null;

    if (!skipBackgroundTest) {
      const bgStart = Date.now();
      const dir = "/workspace/.evolve-tasks/bg-diag-test";

      await sandbox.run({ command: `mkdir -p ${dir}` });
      await sandbox.writeTextFile({
        path: `${dir}/cmd.sh`,
        content: "sleep 5 && echo background-test-passed\n",
      });

      // Launch a short-lived background process using the same mechanism as
      // the start_background tool
      const launch = await sandbox.run({
        command:
          `( setsid bash -l ${dir}/cmd.sh > ${dir}/output.log 2>&1; ` +
          `echo $? > ${dir}/exitcode ) & ` +
          `echo $! > ${dir}/pid && echo launched`,
      });

      if (!launch.stdout.includes("launched")) {
        backgroundTest = {
          launched: false,
          completed: false,
          exitCode: null,
          detail: `Failed to launch: ${
            (launch.stderr || launch.stdout).slice(0, 200)
          }`,
        };
      } else {
        // Give it a moment then check completion
        await new Promise((r) => setTimeout(r, 7000));

        const check = await sandbox.run({
          command:
            `if [ -f ${dir}/exitcode ]; then ` +
            `echo "STATE:exited:$(cat ${dir}/exitcode)"; ` +
            `tail -3 ${dir}/output.log; ` +
            `elif kill -0 "$(cat ${dir}/pid 2>/dev/null)" 2>/dev/null; then ` +
            `echo "STATE:running"; ` +
            `else echo "STATE:crashed"; fi`,
        });

        const elapsed = Date.now() - bgStart;
        const stateLine =
          check.stdout
            .split("\n")
            .find((l) => l.startsWith("STATE:")) ?? "";

        if (stateLine.startsWith("STATE:exited:")) {
          const exitCode = Number(
            stateLine.slice("STATE:exited:".length).trim(),
          );
          const completed = exitCode === 0;
          backgroundTest = {
            launched: true,
            completed,
            exitCode: Number.isFinite(exitCode) ? exitCode : null,
            detail: completed
              ? `Completed in ${elapsed}ms with exit code ${exitCode}`
              : `Failed (exit ${exitCode}) after ${elapsed}ms`,
          };
          output.push(
            `Background process: ${completed ? "PASS" : "FAIL"} (${elapsed}ms, exit ${exitCode})`,
          );
        } else if (stateLine.startsWith("STATE:running")) {
          backgroundTest = {
            launched: true,
            completed: false,
            exitCode: null,
            detail: `Still running after ${elapsed}ms — waited 7s for a 5s sleep`,
          };
          output.push(`Background process: STILL RUNNING after ${elapsed}ms`);
        } else {
          backgroundTest = {
            launched: true,
            completed: false,
            exitCode: null,
            detail: `Process crashed (state: ${stateLine})`,
          };
          output.push("Background process: CRASHED");
        }
      }
    } else {
      output.push("Background test: skipped");
    }

    // ===================================================================
    // Summary
    // ===================================================================
    const toolchainOk = toolchainResults.every((r) => r.passed);
    const bgOk = backgroundTest === null || backgroundTest.completed;
    const allOk = toolchainOk && bgOk;
    const summary = allOk ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED";

    output.unshift(`=== Sandbox Diagnostics: ${summary} ===\n`);

    return {
      resources: { vcpus, memoryTotalMb: memTotalMb, memoryAvailableMb: memAvailableMb },
      toolchain: toolchainResults,
      backgroundTest,
      summary,
    };
  },
});

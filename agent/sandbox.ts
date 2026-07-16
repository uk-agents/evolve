import { defineSandbox } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";

// eve defaults the Vercel sandbox to a 30-minute wall-clock timeout and no
// resource cap. The timeout is not idle-based: a sandbox bills provisioned
// memory for the whole window regardless of activity, so a 2-minute task still
// holds its VM for ~30 minutes. Bound both to cut cost. Sessions survive a
// stopped VM (persistent + resume), so the only exposure is a single sandbox
// command longer than the timeout — evolve's commands are well under a minute,
// leaving a wide margin (15 min also keeps headroom for start_background jobs).
// Both are env-tunable so limits can change without a code edit + redeploy.
const SANDBOX_TIMEOUT_MS =
  Number(process.env.EVOLVE_SANDBOX_TIMEOUT_MS) || 15 * 60 * 1000;
const SANDBOX_VCPUS = Number(process.env.EVOLVE_SANDBOX_VCPUS) || 1;

export default defineSandbox({
  // Pin the Vercel backend (with the caps) only on hosted Vercel. Locally, omit
  // it so eve's default backend (docker/bash) runs — otherwise `eve dev` would
  // try to create real hosted sandboxes.
  ...(process.env.VERCEL
    ? {
        backend: vercel({
          timeout: SANDBOX_TIMEOUT_MS,
          resources: { vcpus: SANDBOX_VCPUS },
        }),
      }
    : {}),
  revalidationKey: () => "safe-directory-v1",
  // eve's channel-managed GitHub checkout runs git in /workspace, whose
  // directory ownership differs from the sandbox user, so git aborts every
  // checkout step with "detected dubious ownership" (issue #3). The sandbox
  // is single-user and isolated, so the shared-filesystem attack this git
  // safety check guards against does not apply; trust all paths inside it.
  async bootstrap({ use }) {
    const sandbox = await use();
    await sandbox.run({
      command: "git config --global --add safe.directory '*'",
    });
  },
});

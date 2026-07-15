import { defineSandbox } from "eve/sandbox";

export default defineSandbox({
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

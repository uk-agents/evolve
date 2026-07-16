import assert from "node:assert/strict";
import { after, test } from "node:test";

// Ensure a deterministic default branch before the guard module is loaded.
// The module evaluates EVOLVE_DEFAULT_BRANCH at import time.
const ORIGINAL_BRANCH = process.env.EVOLVE_DEFAULT_BRANCH;
process.env.EVOLVE_DEFAULT_BRANCH = "main";

const { guardShellCommand } = await import("../../agent/lib/command-guard.js");

after(() => {
  if (ORIGINAL_BRANCH === undefined) {
    delete process.env.EVOLVE_DEFAULT_BRANCH;
  } else {
    process.env.EVOLVE_DEFAULT_BRANCH = ORIGINAL_BRANCH;
  }
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function assertDenied(command: string, expectedReason?: RegExp) {
  const result = guardShellCommand(command);
  // assert.fail returns `never`, which narrows the CommandVerdict union to the
  // `{ type: "denied"; reason: string }` branch (node:assert has no narrowing
  // assertion signature, so assert.notEqual alone would leave `.reason` untyped).
  if (result === "not-applicable") {
    assert.fail(`Expected "${command}" to be denied`);
  }
  if (expectedReason) {
    assert.match(result.reason, expectedReason);
  }
}

function assertAllowed(command: string) {
  assert.equal(
    guardShellCommand(command),
    "not-applicable",
    `Expected "${command}" to be allowed`,
  );
}

// ---------------------------------------------------------------------------
// DENY — git push variants
// ---------------------------------------------------------------------------

test("denies bare git push", () => {
  assertDenied("git push");
});

test("denies git push origin (no refspec)", () => {
  assertDenied("git push origin");
});

test("denies git push origin main (default branch)", () => {
  assertDenied("git push origin main");
});

test("denies git push origin HEAD", () => {
  assertDenied("git push origin HEAD");
});

test("denies git push --force origin feature", () => {
  assertDenied("git push --force origin feature", /force/);
});

test("denies git push -f origin feature", () => {
  assertDenied("git push -f origin feature", /force/);
});

test("denies git push --force-with-lease origin feature", () => {
  assertDenied("git push --force-with-lease origin feature", /force/);
});

test("denies git push origin +refs/heads/feature (leading plus refspec)", () => {
  assertDenied("git push origin +refs/heads/feature", /force/);
});

test("denies git push origin --delete feature", () => {
  assertDenied("git push origin --delete feature", /deletions/);
});

test("denies git push origin -d feature", () => {
  assertDenied("git push origin -d feature", /deletions/);
});

test("denies git push origin :refs/heads/feature (colon deletion)", () => {
  assertDenied("git push origin :refs/heads/feature", /deletions/);
});

test("denies git push --mirror origin", () => {
  assertDenied("git push --mirror origin", /mirror/);
});

test("denies git push --all origin", () => {
  assertDenied("git push --all origin", /mirror/);
});

test("denies git push --tags origin", () => {
  assertDenied("git push --tags origin", /mirror/);
});

test("denies git push origin feature:main (colon refspec)", () => {
  assertDenied("git push origin feature:main", /prohibited/);
});

test("denies git -C /repo push origin main", () => {
  assertDenied("git -C /repo push origin main");
});

test("denies compound command with git push origin main", () => {
  assertDenied("echo hi && git push origin main");
});

// ---------------------------------------------------------------------------
// DENY — gh write commands
// ---------------------------------------------------------------------------

test("denies gh pr create", () => {
  assertDenied("gh pr create", /gh write commands/);
});

test("denies gh issue create", () => {
  assertDenied("gh issue create", /gh write commands/);
});

test("denies gh repo create", () => {
  assertDenied("gh repo create", /gh write commands/);
});

test("denies gh release create", () => {
  assertDenied("gh release create", /gh write commands/);
});

test("denies gh workflow run", () => {
  assertDenied("gh workflow run", /gh write commands/);
});

// ---------------------------------------------------------------------------
// DENY — mutating curl
// ---------------------------------------------------------------------------

test("denies curl -X POST", () => {
  assertDenied("curl -X POST https://api.example.com/data", /prohibited/);
});

test("denies curl -X PUT", () => {
  assertDenied("curl -X PUT https://api.example.com/data", /prohibited/);
});

test("denies curl -X PATCH", () => {
  assertDenied("curl -X PATCH https://api.example.com/data", /prohibited/);
});

test("denies curl -X DELETE", () => {
  assertDenied("curl -X DELETE https://api.example.com/data", /prohibited/);
});

test("denies curl --request DELETE", () => {
  assertDenied('curl --request DELETE https://api.example.com/data', /prohibited/);
});

// ---------------------------------------------------------------------------
// DENY — npm publish & vercel deploy
// ---------------------------------------------------------------------------

test("denies npm publish", () => {
  assertDenied("npm publish", /Publishing/);
});

test("denies vercel deploy", () => {
  assertDenied("vercel deploy", /Publishing/);
});

test("denies vercel --prod", () => {
  assertDenied("vercel --prod", /Publishing/);
});

// ---------------------------------------------------------------------------
// DENY — destructive git
// ---------------------------------------------------------------------------

test("denies git reset --hard", () => {
  assertDenied("git reset --hard", /Destructive/);
});

test("denies git clean -fd", () => {
  assertDenied("git clean -fd", /Destructive/);
});

test("denies git clean -xdf", () => {
  assertDenied("git clean -xdf", /Destructive/);
});

test("denies git clean -fdx", () => {
  assertDenied("git clean -fdx", /Destructive/);
});

// ---------------------------------------------------------------------------
// ALLOW — legitimate operations
// ---------------------------------------------------------------------------

test("allows git push -u origin my-feature-branch", () => {
  assertAllowed("git push -u origin my-feature-branch");
});

test("allows git push -u origin my-feature-branch inside cd wrapper with redirect", () => {
  assertAllowed("cd /workspace && git push -u origin my-feature-branch 2>&1");
});

test("allows git push --set-upstream origin my-feature-branch", () => {
  assertAllowed("git push --set-upstream origin my-feature-branch");
});

test("allows git status", () => {
  assertAllowed("git status");
});

test("allows git log", () => {
  assertAllowed("git log --oneline -5");
});

test("allows npm test", () => {
  assertAllowed("npm test");
});

test("allows plain curl GET", () => {
  assertAllowed("curl https://api.example.com/health");
});

test("allows git commit with message containing push/main", () => {
  assertAllowed('git commit -m "push to main branch"');
});

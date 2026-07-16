import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type {
  GitHubApiResponse,
  GitHubInboundContext,
} from "eve/channels/github";
import { issueHasLabel, matchesConfiguredRepository, onIssue } from "../../agent/channels/github";

const ORIGINAL_EVOLVE_REPOSITORY = process.env.EVOLVE_REPOSITORY;

beforeEach(() => {
  delete process.env.EVOLVE_REPOSITORY;
});

afterEach(() => {
  if (ORIGINAL_EVOLVE_REPOSITORY === undefined) {
    delete process.env.EVOLVE_REPOSITORY;
  } else {
    process.env.EVOLVE_REPOSITORY = ORIGINAL_EVOLVE_REPOSITORY;
  }
});

/** Builds a minimal inbound context; every field the code under test reads is present. */
function createContext(
  overrides: {
    readonly repositoryFullName?: string;
    readonly senderLogin?: string;
    readonly permission?: string | null;
    readonly requestError?: Error;
  } = {},
): { readonly ctx: GitHubInboundContext; readonly requestCalls: number[] } {
  const requestCalls: number[] = [];
  const ctx = {
    conversation: { issueNumber: 42, kind: "issue", pullRequestNumber: null },
    delivery: { event: "issues", hookId: "1", id: "delivery-1" },
    github: {
      installationId: 99,
      repository: {
        fullName: overrides.repositoryFullName ?? "uk-agents/evolve",
        id: 1,
        name: "evolve",
        owner: "uk-agents",
        private: false,
      },
      async request<T>(): Promise<GitHubApiResponse<T>> {
        requestCalls.push(1);
        if (overrides.requestError) throw overrides.requestError;
        return {
          body: { permission: overrides.permission ?? "none" } as T,
          ok: true,
          status: 200,
        };
      },
    },
    repository: {
      fullName: overrides.repositoryFullName ?? "uk-agents/evolve",
      id: 1,
      name: "evolve",
      owner: "uk-agents",
      private: false,
    },
    sender: {
      htmlUrl: undefined,
      id: 7,
      login: overrides.senderLogin ?? "paulieb89",
      type: "User",
      url: undefined,
    },
    thread: {
      kind: "issue",
      async post() {
        throw new Error("thread.post should not be called by dispatch gates");
      },
      async react() {
        throw new Error("thread.react should not be called by dispatch gates");
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as GitHubInboundContext;
  return { ctx, requestCalls };
}

function labeledIssueRaw(labelNames: readonly string[]) {
  return { labels: labelNames.map((name) => ({ name })) };
}

// issueHasLabel

test("issueHasLabel returns true when the named label is present", () => {
  assert.equal(issueHasLabel(labeledIssueRaw(["agent:ready", "bug"]), "agent:ready"), true);
});

test("issueHasLabel returns false when the named label is absent", () => {
  assert.equal(issueHasLabel(labeledIssueRaw(["bug", "enhancement"]), "agent:ready"), false);
});

test("issueHasLabel returns false for malformed raw payloads", () => {
  assert.equal(issueHasLabel(null, "agent:ready"), false);
  assert.equal(issueHasLabel("not-an-object", "agent:ready"), false);
  assert.equal(issueHasLabel({}, "agent:ready"), false);
  assert.equal(issueHasLabel({ label: { name: "agent:ready" } }, "agent:ready"), false);
});

test("issueHasLabel returns false when labels is not an array", () => {
  assert.equal(issueHasLabel({ labels: "agent:ready" }, "agent:ready"), false);
  assert.equal(issueHasLabel({ labels: { name: "agent:ready" } }, "agent:ready"), false);
  assert.equal(issueHasLabel({ labels: null }, "agent:ready"), false);
});

// matchesConfiguredRepository

test("matchesConfiguredRepository returns true when the repository matches", () => {
  process.env.EVOLVE_REPOSITORY = "uk-agents/evolve";
  const { ctx } = createContext({ repositoryFullName: "uk-agents/evolve" });
  assert.equal(matchesConfiguredRepository(ctx), true);
});

test("matchesConfiguredRepository returns false when the repository differs", () => {
  process.env.EVOLVE_REPOSITORY = "uk-agents/evolve";
  const { ctx } = createContext({ repositoryFullName: "someone-else/other-repo" });
  assert.equal(matchesConfiguredRepository(ctx), false);
});

test("matchesConfiguredRepository is case-insensitive", () => {
  process.env.EVOLVE_REPOSITORY = "UK-Agents/Evolve";
  const { ctx } = createContext({ repositoryFullName: "uk-agents/evolve" });
  assert.equal(matchesConfiguredRepository(ctx), true);
});

test("matchesConfiguredRepository returns false when EVOLVE_REPOSITORY is unset", () => {
  delete process.env.EVOLVE_REPOSITORY;
  const { ctx } = createContext({ repositoryFullName: "uk-agents/evolve" });
  assert.equal(matchesConfiguredRepository(ctx), false);
});

// onIssue gate combinations

test("onIssue ignores actions other than 'labeled'", async () => {
  process.env.EVOLVE_REPOSITORY = "uk-agents/evolve";
  const { ctx, requestCalls } = createContext({ permission: "admin" });
  const result = await onIssue(ctx, {
    action: "opened",
    issueNumber: 23,
    raw: labeledIssueRaw(["agent:ready"]),
  });
  assert.equal(result, null);
  assert.equal(requestCalls.length, 0, "actor permission should not be checked when the action is skipped");
});

test("onIssue ignores a 'labeled' action missing the agent:ready label", async () => {
  process.env.EVOLVE_REPOSITORY = "uk-agents/evolve";
  const { ctx, requestCalls } = createContext({ permission: "admin" });
  const result = await onIssue(ctx, {
    action: "labeled",
    issueNumber: 23,
    raw: labeledIssueRaw(["bug"]),
  });
  assert.equal(result, null);
  assert.equal(requestCalls.length, 0, "actor permission should not be checked when the label is missing");
});

test("onIssue ignores an actor without sufficient repository permission", async () => {
  process.env.EVOLVE_REPOSITORY = "uk-agents/evolve";
  const { ctx } = createContext({ permission: "read" });
  const result = await onIssue(ctx, {
    action: "labeled",
    issueNumber: 23,
    raw: labeledIssueRaw(["agent:ready"]),
  });
  assert.equal(result, null);
});

test("onIssue ignores a repository that does not match EVOLVE_REPOSITORY", async () => {
  process.env.EVOLVE_REPOSITORY = "uk-agents/evolve";
  const { ctx, requestCalls } = createContext({
    permission: "admin",
    repositoryFullName: "someone-else/other-repo",
  });
  const result = await onIssue(ctx, {
    action: "labeled",
    issueNumber: 23,
    raw: labeledIssueRaw(["agent:ready"]),
  });
  assert.equal(result, null);
  assert.equal(requestCalls.length, 0, "actor permission should not be checked for an unconfigured repository");
});

for (const permission of ["admin", "maintain", "write"]) {
  test(`onIssue dispatches on the happy path for '${permission}' permission`, async () => {
    process.env.EVOLVE_REPOSITORY = "uk-agents/evolve";
    const { ctx } = createContext({ permission, senderLogin: "paulieb89" });
    const result = await onIssue(ctx, {
      action: "labeled",
      issueNumber: 23,
      raw: labeledIssueRaw(["agent:ready"]),
    });
    assert.notEqual(result, null);
    assert.ok(result?.auth);
    assert.equal(result?.context?.length, 1);
    assert.match(result!.context![0], /paulieb89/);
    assert.match(result!.context![0], /#23/);
  });
}

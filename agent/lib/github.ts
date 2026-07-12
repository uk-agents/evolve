import type { RepositoryCoordinates } from "./config";

const API_VERSION = "2022-11-28";
const USER_AGENT = "evolve-eve-agent";

export class GitHubRequestError extends Error {
  readonly body: unknown;
  readonly status: number;

  constructor(status: number, message: string, body: unknown) {
    super(`GitHub API request failed (${status}): ${message}`);
    this.name = "GitHubRequestError";
    this.status = status;
    this.body = body;
  }
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function githubRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": USER_AGENT,
      "x-github-api-version": API_VERSION,
      ...init.headers,
    },
  });

  const body = await parseBody(response);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : response.statusText;
    throw new GitHubRequestError(response.status, message, body);
  }

  return body as T;
}

export async function githubGraphql<T>(
  token: string,
  query: string,
  variables: Readonly<Record<string, unknown>>,
): Promise<T> {
  const response = await githubRequest<{
    data?: T;
    errors?: Array<{ message?: string }>;
  }>(token, "/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables }),
    headers: { "content-type": "application/json" },
  });

  if (response.errors?.length) {
    throw new Error(
      `GitHub GraphQL request failed: ${response.errors
        .map((error) => error.message ?? "Unknown GraphQL error")
        .join("; ")}`,
    );
  }
  if (!response.data) throw new Error("GitHub GraphQL response contained no data.");
  return response.data;
}

async function optional<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch {
    return null;
  }
}

interface RepositoryResponse {
  readonly archived: boolean;
  readonly default_branch: string;
  readonly description: string | null;
  readonly fork: boolean;
  readonly full_name: string;
  readonly has_discussions: boolean;
  readonly html_url: string;
  readonly id: number;
  readonly node_id: string;
  readonly open_issues_count: number;
  readonly private: boolean;
  readonly pushed_at: string | null;
  readonly visibility: string;
}

interface IssueResponse {
  readonly body: string | null;
  readonly html_url: string;
  readonly labels: Array<string | { name?: string }>;
  readonly number: number;
  readonly pull_request?: unknown;
  readonly state: string;
  readonly title: string;
  readonly updated_at: string;
  readonly user?: { login?: string };
}

interface PullResponse {
  readonly base: { ref: string; sha: string };
  readonly body: string | null;
  readonly draft: boolean;
  readonly head: { ref: string; sha: string };
  readonly html_url: string;
  readonly number: number;
  readonly state: string;
  readonly title: string;
  readonly updated_at: string;
  readonly user?: { login?: string };
}

interface WorkflowRunsResponse {
  readonly workflow_runs: Array<{
    readonly conclusion: string | null;
    readonly event: string;
    readonly head_branch: string | null;
    readonly head_sha: string;
    readonly html_url: string;
    readonly id: number;
    readonly name: string | null;
    readonly status: string;
    readonly updated_at: string;
  }>;
}

interface DiscussionsData {
  readonly repository: {
    readonly discussionCategories: {
      readonly nodes: Array<{ id: string; name: string; slug: string }>;
    };
    readonly discussions: {
      readonly nodes: Array<{
        author: { login: string } | null;
        category: { name: string };
        number: number;
        title: string;
        updatedAt: string;
        url: string;
      }>;
    };
  } | null;
}

function labelNames(labels: IssueResponse["labels"]): string[] {
  return labels.flatMap((label) => {
    if (typeof label === "string") return [label];
    return label.name ? [label.name] : [];
  });
}

export interface RepositorySnapshot {
  readonly generatedAt: string;
  readonly repository: {
    readonly archived: boolean;
    readonly defaultBranch: string;
    readonly description: string | null;
    readonly discussionsEnabled: boolean;
    readonly fork: boolean;
    readonly fullName: string;
    readonly openIssuesCount: number;
    readonly private: boolean;
    readonly pushedAt: string | null;
    readonly url: string;
    readonly visibility: string;
  };
  readonly governance: {
    readonly defaultBranchProtected: boolean | null;
    readonly requiredApprovingReviewCount: number | null;
    readonly requiredStatusChecks: string[] | null;
  };
  readonly openIssues: Array<{
    readonly author: string | null;
    readonly labels: string[];
    readonly number: number;
    readonly title: string;
    readonly updatedAt: string;
    readonly url: string;
  }>;
  readonly openPullRequests: Array<{
    readonly author: string | null;
    readonly base: string;
    readonly draft: boolean;
    readonly head: string;
    readonly number: number;
    readonly title: string;
    readonly updatedAt: string;
    readonly url: string;
  }>;
  readonly discussions: Array<{
    readonly author: string | null;
    readonly category: string;
    readonly number: number;
    readonly title: string;
    readonly updatedAt: string;
    readonly url: string;
  }> | null;
  readonly discussionCategories: Array<{
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  }> | null;
  readonly recentWorkflowRuns: Array<{
    readonly branch: string | null;
    readonly conclusion: string | null;
    readonly event: string;
    readonly name: string | null;
    readonly sha: string;
    readonly status: string;
    readonly updatedAt: string;
    readonly url: string;
  }> | null;
}

export async function loadRepositorySnapshot(
  token: string,
  repository: RepositoryCoordinates,
): Promise<RepositorySnapshot> {
  const repoPath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  const metadata = await githubRequest<RepositoryResponse>(token, repoPath);

  const [issues, pulls, workflows, protection, discussionData] = await Promise.all([
    githubRequest<IssueResponse[]>(
      token,
      `${repoPath}/issues?state=open&sort=updated&direction=desc&per_page=20`,
    ),
    githubRequest<PullResponse[]>(
      token,
      `${repoPath}/pulls?state=open&sort=updated&direction=desc&per_page=20`,
    ),
    optional(() =>
      githubRequest<WorkflowRunsResponse>(
        token,
        `${repoPath}/actions/runs?branch=${encodeURIComponent(metadata.default_branch)}&per_page=10`,
      ),
    ),
    optional(() =>
      githubRequest<{
        required_pull_request_reviews?: { required_approving_review_count?: number } | null;
        required_status_checks?: { contexts?: string[] } | null;
      }>(
        token,
        `${repoPath}/branches/${encodeURIComponent(metadata.default_branch)}/protection`,
      ),
    ),
    metadata.has_discussions
      ? optional(() =>
          githubGraphql<DiscussionsData>(
            token,
            `query RepositoryDiscussions($owner: String!, $name: String!) {
              repository(owner: $owner, name: $name) {
                discussionCategories(first: 20) {
                  nodes { id name slug }
                }
                discussions(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
                  nodes {
                    number
                    title
                    url
                    updatedAt
                    author { login }
                    category { name }
                  }
                }
              }
            }`,
            { owner: repository.owner, name: repository.repo },
          ),
        )
      : Promise.resolve(null),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    repository: {
      archived: metadata.archived,
      defaultBranch: metadata.default_branch,
      description: truncate(metadata.description, 500),
      discussionsEnabled: metadata.has_discussions,
      fork: metadata.fork,
      fullName: metadata.full_name,
      openIssuesCount: metadata.open_issues_count,
      private: metadata.private,
      pushedAt: metadata.pushed_at,
      url: metadata.html_url,
      visibility: metadata.visibility,
    },
    governance: {
      defaultBranchProtected: protection === null ? null : true,
      requiredApprovingReviewCount:
        protection?.required_pull_request_reviews?.required_approving_review_count ?? null,
      requiredStatusChecks: protection?.required_status_checks?.contexts ?? null,
    },
    openIssues: issues
      .filter((issue) => issue.pull_request === undefined)
      .map((issue) => ({
        author: issue.user?.login ?? null,
        labels: labelNames(issue.labels),
        number: issue.number,
        title: truncate(issue.title, 300) ?? "",
        updatedAt: issue.updated_at,
        url: issue.html_url,
      })),
    openPullRequests: pulls.map((pull) => ({
      author: pull.user?.login ?? null,
      base: pull.base.ref,
      draft: pull.draft,
      head: pull.head.ref,
      number: pull.number,
      title: truncate(pull.title, 300) ?? "",
      updatedAt: pull.updated_at,
      url: pull.html_url,
    })),
    discussions:
      discussionData?.repository?.discussions.nodes.map((discussion) => ({
        author: discussion.author?.login ?? null,
        category: discussion.category.name,
        number: discussion.number,
        title: truncate(discussion.title, 300) ?? "",
        updatedAt: discussion.updatedAt,
        url: discussion.url,
      })) ?? null,
    discussionCategories:
      discussionData?.repository?.discussionCategories.nodes ?? null,
    recentWorkflowRuns:
      workflows?.workflow_runs.map((run) => ({
        branch: run.head_branch,
        conclusion: run.conclusion,
        event: run.event,
        name: run.name,
        sha: run.head_sha,
        status: run.status,
        updatedAt: run.updated_at,
        url: run.html_url,
      })) ?? null,
  };
}

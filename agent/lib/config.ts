import { connect } from "@vercel/connect/eve";

export const githubConnector =
  process.env.EVOLVE_GITHUB_CONNECTOR?.trim() || "github/evolve";

export const githubAuth = connect({
  connector: githubConnector,
  principalType: "app",
});

export interface RepositoryCoordinates {
  readonly fullName: string;
  readonly owner: string;
  readonly repo: string;
}

export function configuredRepository(): RepositoryCoordinates | null {
  const fullName = process.env.EVOLVE_REPOSITORY?.trim();
  if (!fullName) return null;

  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(fullName);
  if (!match) {
    throw new Error(
      "EVOLVE_REPOSITORY must use the owner/repository form, for example acme/evolve.",
    );
  }

  return {
    fullName,
    owner: match[1],
    repo: match[2],
  };
}

export function requireConfiguredRepository(): RepositoryCoordinates {
  const repository = configuredRepository();
  if (!repository) {
    throw new Error(
      "EVOLVE_REPOSITORY is not configured. Set it to the single repository this agent is allowed to operate.",
    );
  }
  return repository;
}

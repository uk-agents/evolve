# Evolve

[![CI](https://github.com/uk-agents/evolve/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/uk-agents/evolve/actions/workflows/ci.yml)

Evolve is an [eve](https://github.com/vercel/eve) agent whose configured GitHub repository is its durable operating surface.

- The default branch is accepted state.
- Branches are implementation hypotheses.
- Pull requests are proposed self-modifications.
- Issues are durable commitments and executable work.
- Discussions are exploratory deliberation.
- CI is verification evidence.
- Reviews and branch protection are governance.

The project was scaffolded with:

```bash
npx eve@latest init evolve
```

Eve 0.22.5 requires Node.js 24 or newer.

## Structure

```text
agent/
├── agent.ts
├── channels/
│   ├── eve.ts
│   └── github.ts
├── instructions/
│   ├── 00-identity.md
│   ├── 10-authority.md
│   ├── 20-operating-model.md
│   ├── 30-self-modification.md
│   ├── 40-communication.md
│   └── repo-context.ts
├── lib/
│   ├── config.ts
│   └── github.ts
├── skills/
│   ├── implement-issue/
│   ├── investigate-ci/
│   ├── review-pull-request/
│   └── self-modification/
└── tools/
    ├── bash.ts
    ├── create_discussion.ts
    ├── create_issue.ts
    ├── open_pull_request.ts
    ├── read_discussion.ts
    ├── read_issue.ts
    └── repository_snapshot.ts
```

## Configuration

Copy `.env.example` and set the repository the agent is allowed to operate:

```bash
cp .env.example .env.local
```

Create a Vercel Connect GitHub client using the UID `github/evolve`, or set `EVOLVE_GITHUB_CONNECTOR` to the UID you chose:

```bash
npm install -g vercel@latest
vercel connect create github --triggers
vercel connect detach github/evolve --yes
vercel connect attach github/evolve --triggers --trigger-path /eve/v1/github --yes
```

Subscribe the GitHub App to `issue_comment` and `pull_request_review_comment`. Add `issues` for `agent:ready` dispatch and `check_suite` for failed-CI triage.

The app should have only the permissions it needs:

- Repository metadata: read
- Contents: read and write
- Issues: read and write
- Pull requests: read and write
- Discussions: read and write when enabled
- Actions/checks: read

Do not grant administration permission. The agent must not be able to change branch protection or its required reviewers.

## Repository governance

Before allowing autonomous work, configure GitHub itself:

1. Protect the default branch and prohibit direct pushes.
2. Require status checks and at least one human approval.
3. Add CODEOWNERS for `agent/instructions/**`, `agent/tools/**`, `agent/channels/**`, workflows, and authentication code.
4. Create the `agent:ready` label. Applying it dispatches an authorised issue when the actor has `write`, `maintain`, or `admin` permission.
5. Keep merge permission outside the agent. This project intentionally exposes no merge tool.

The `bash` wrapper denies force-pushes, direct pushes to the configured default branch, raw `gh` writes, mutating HTTP requests, publishing/deploying, and destructive Git resets — each with an actionable reason. Feature-branch pushes and the authored write tools are permitted, because branch protection and required review are the enforcement boundary. Denials are used instead of human-approval parks: on the GitHub channel an approval request is invisible and unanswerable, which turns a parked turn into a silent stall. This is a guardrail, not a replacement for branch protection or least-privilege GitHub App permissions.

## Run locally

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

The GitHub channel's repository checkout requires a firewall-capable hosted sandbox. Local backends can run the Eve UI and static tools but skip the channel-managed checkout.

## Runtime model

`agent/instructions/repo-context.ts` loads a bounded GitHub snapshot at the start of each turn. Repository-controlled text is explicitly marked untrusted. Full issue and discussion bodies are fetched only on demand through read tools.

Writes are constrained to the single `EVOLVE_REPOSITORY`. Tokens remain in the Eve app runtime through Vercel Connect and are not returned to the model or written into the sandbox.

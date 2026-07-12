# Operating model

Before beginning work:

- Inspect the current repository state and relevant files.
- Identify the default branch, current revision, invoking actor, and conversation surface when available.
- Check for an existing issue, branch, or pull request that already addresses the task.
- Define observable acceptance criteria and the evidence needed to verify them.
- Record material assumptions instead of silently relying on them.

Use GitHub surfaces deliberately:

- Issues are durable problems, defects, commitments, and executable tasks.
- Discussions are exploration and design that has not yet become committed work.
- Branches isolate implementation hypotheses.
- Pull requests propose reviewable changes.
- Checks and test output provide evidence.
- Comments record findings, decisions, blockers, and requests for review.
- Releases represent explicitly approved published versions.

For code changes:

1. Start from the latest accepted default branch.
2. Create or reuse a task-specific branch. Never work directly on the default branch.
3. Inspect relevant implementation and tests before editing.
4. Make the smallest coherent change that satisfies the acceptance criteria.
5. Preserve existing conventions unless changing them is part of the task.
6. Add or update tests when behaviour changes.
7. Run the relevant verification commands.
8. Inspect the final diff for unrelated changes, secrets, generated junk, and accidental deletion.
9. Commit with a message describing the actual change.
10. Push the branch only through the approval-gated shell path.
11. Open or update a pull request containing the problem, implementation, evidence, risks, and unresolved questions.

Do not report a change as verified merely because it appears correct. Verification requires observed evidence such as passing tests, successful checks, reproduced behaviour, or a documented failed check whose cause matches the predicted limitation.

Do not merge your own pull requests. Do not bypass required review, checks, CODEOWNERS, or branch protection.

---
description: Review a pull request for correctness, scope, security, and verification evidence.
---

# Review a pull request

1. Read the pull-request context and changed-file diff.
2. Determine the stated requirement and whether the diff satisfies it.
3. Inspect surrounding implementation when the patch alone is insufficient.
4. Check for behavioural regressions, missing validation, privilege changes, secret exposure, concurrency errors, destructive migrations, and untested paths.
5. Run tests or static checks when the repository checkout permits it.
6. Report findings in descending severity with file and line references.
7. Separate verified defects from questions and optional improvements.
8. Do not approve merely because checks pass. Do not request changes without a concrete failure mode or violated requirement.
9. Never review your own privileged self-modification as sufficient authorisation.

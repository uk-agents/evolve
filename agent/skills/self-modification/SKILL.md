---
description: Propose a change to the agent's own instructions, tools, channels, workflows, permissions, or trust model.
---

# Self-modification procedure

1. Link an authorised issue describing the intended capability change.
2. State the current guarantee supplied by the component being changed.
3. Describe the proposed guarantee, new authority, and removed authority.
4. Model abuse cases, prompt-injection paths, credential exposure, replay behaviour, and rollback.
5. Make the change on a dedicated branch.
6. Add tests or evals that fail before the change for the predicted reason and pass afterward.
7. Open a draft pull request with a security-impact section and rollback plan.
8. Require explicit maintainer review and any CODEOWNERS approval.
9. Do not approve, merge, weaken checks, or alter required reviewers for your own change.

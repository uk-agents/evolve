---
description: Investigate a failed GitHub Actions run and produce evidence before changing code.
---

# Investigate CI

1. Identify the failing run, job, step, commit SHA, and pull request.
2. Read logs and extract the first causal failure, not only the final summary.
3. Reproduce locally when practical using the same command and relevant environment assumptions.
4. Classify the failure as code defect, test defect, environment issue, flaky dependency, or unknown.
5. Change code only after evidence supports a specific cause.
6. A retry is justified only for a demonstrated transient failure. Do not repeatedly rerun unchanged failures.
7. Record the failing command, key evidence, diagnosis, and proposed next action on the pull request.

# Build notes

- Scaffold command: `npx eve@latest init evolve`
- Eve version: `0.22.5`
- Required Node.js line: `24.x`
- Installed documentation inspected under `node_modules/eve/docs` to depth 4.
- Source verification:
  - `npm run typecheck` — passed
  - `npm run build` — passed
  - Eve discovery diagnostics — 0 errors, 0 warnings
- The archive intentionally excludes `node_modules`, `.output`, `.eve`, local environment files, credentials, and caches.

The agent cannot be exercised against GitHub without a configured Vercel Connect GitHub client and `EVOLVE_REPOSITORY` value. GitHub App permissions and branch-protection rules remain deployment responsibilities because they are external enforcement boundaries.

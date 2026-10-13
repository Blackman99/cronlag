# Contributing

Thanks! cronlag keeps to one job — see [GOAL.md](GOAL.md). Please open an issue before large changes.

## Develop
```bash
npm ci          # also builds dist/ and site/cronlag.js
npm test        # unit tests + recorded real-world fixtures + MCP smoke
npm run typecheck
node dist/cli.js owner/repo
```
`dist/` is committed (the GitHub Action runs from it). Run `npm run build` and commit `dist/` with your change; CI fails if it is stale.

## Accuracy reports
"cronlag says X, but the Actions tab says Y" is the most valuable bug report. Include the repo (if public), the workflow file, the window (`--days`) and `--format json` output. To turn it into a test: `node scripts/record-fixture.mjs owner/repo <days> test/fixtures/<name>.json [workflow.yml]` and add a case to `test/analyze.test.ts`.

## Cron semantics
Changes to `src/cron.ts` must keep the cron-parser cross-check in `test/cron.test.ts` green, and follow GitHub's documented behavior where the two differ (DST gaps advance to the next valid time).

# Goal

**Tell you, slot by slot, whether your scheduled GitHub Actions workflows actually ran when their cron said — how late, which slots never ran, and whether the cause is your setup or GitHub's scheduler — and let you run the missed slots without double runs.**

This sentence does not change. Features that don't serve it don't go in.

## Target users
- Maintainers of repos that run on `on: schedule` — data refreshes, feeds, bots, backups, nightly tests, release automation — on GitHub-hosted or self-hosted runners.
- People (and AI agents) who keep re-building the same lag table by hand in issues and community threads since the August 2026 scheduler degradation.

## In scope
- Expected cron slots (GitHub's cron semantics, IANA `timezone`, cron changes over time) vs. runs actually created.
- Lag (slot → run creation), queue time (creation → start), dropped slots, overdue slots.
- Cause checks that GitHub's own UI doesn't show: disabled after 60 days, schedule never registered, minute 0, < 5 min intervals, forks, missing `workflow_dispatch`, runner queueing vs. scheduler delay.
- Catch-up: dispatch only the slots that have no run, and a guard so the late scheduled run skips afterwards.
- Same answers from the CLI, the GitHub Action, and an MCP server for agents.

## Out of scope
- Running your jobs on another scheduler/runner platform.
- General CI analytics, billing (see runbill), flaky test detection.
- Alerting/paging infrastructure (cronlag's exit codes and Action outputs plug into whatever you already use).

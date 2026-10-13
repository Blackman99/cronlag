import { test } from "node:test";
import assert from "node:assert/strict";
import { readTriggers } from "../src/workflow.ts";

test("reads schedules, timezone and workflow_dispatch", () => {
  const t = readTriggers(`
name: nightly
on:
  schedule:
    - cron: '30 5 * * 1-5'
      timezone: "America/New_York"
    - cron: "17 */6 * * *"
  workflow_dispatch:
jobs: {}
`);
  assert.equal(t.hasDispatch, true);
  assert.deepEqual(t.schedules.map((s) => [s.cron, s.timezone, !!s.parsed]), [
    ["30 5 * * 1-5", "America/New_York", true],
    ["17 */6 * * *", "UTC", true],
  ]);
});

test("string and list forms of on:, quoted on, bad cron", () => {
  assert.equal(readTriggers("on: workflow_dispatch\njobs: {}").hasDispatch, true);
  assert.equal(readTriggers("on: [push, workflow_dispatch]\njobs: {}").hasDispatch, true);
  const q = readTriggers(`"on":\n  schedule:\n    - cron: "@daily"\n`);
  assert.equal(q.schedules.length, 1);
  assert.match(q.schedules[0].error ?? "", /does not support/);
  assert.equal(readTriggers("on: push\n").schedules.length, 0);
  assert.ok(readTriggers("on: [\n").parseError);
});

// Record a real Snapshot (repo + workflows + runs + history) for deterministic tests.
// usage: node scripts/record-fixture.mjs owner/repo days out.json [workflow]
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { collect, GitHub } from "../dist/index.js";
const [repo, days, out, wf] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const snap = await collect(new GitHub({ token }), repo, { days: Number(days), workflows: wf ? [wf] : undefined });
// strip parsed cron objects (Sets don't serialize); tests re-parse.
const strip = (s) => s.map(({ cron, timezone, error }) => ({ cron, timezone, ...(error ? { error } : {}) }));
for (const w of snap.workflows) {
  w.schedules = strip(w.schedules);
  if (w.timeline) w.timeline = w.timeline.map((t) => ({ ...t, schedules: strip(t.schedules) }));
}
writeFileSync(out, JSON.stringify(snap, null, 1));
console.log(`recorded ${repo}: ${snap.workflows.length} scheduled workflows -> ${out}`);

import { test } from "node:test";
import assert from "node:assert/strict";
import { CronExpressionParser } from "cron-parser";
import { firesBetween, nextFires, parseCron, prevFire, minInterval, CronError } from "../src/cron.ts";

const iso = (t: number) => new Date(t).toISOString().slice(0, 16);
const T0 = Date.parse("2026-10-01T00:00:00Z");

test("basic fields, lists, ranges, steps, names", () => {
  const c = parseCron("15,45 9-17/4 * JAN-MAR mon-fri");
  assert.deepEqual(c.minutes, [15, 45]);
  assert.deepEqual(c.hours, [9, 13, 17]);
  assert.deepEqual([...c.months].sort((a, b) => a - b), [1, 2, 3]);
  assert.deepEqual([...c.weekdays].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseCron("0 0 * * 7").weekdays, new Set([0]));
  assert.deepEqual(parseCron("5/20 * * * *").minutes, [5, 25, 45]);
});

test("rejects what GitHub rejects", () => {
  for (const bad of ["@daily", "* * * *", "* * * * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "*/0 * * * *", "5-1 * * * *", "a * * * *"]) {
    assert.throws(() => parseCron(bad), CronError, bad);
  }
  assert.throws(() => parseCron("0 0 * * *", "Mars/Olympus"), CronError);
});

test("daily and every-6h fire times", () => {
  const d = firesBetween(parseCron("0 6 * * *"), T0, T0 + 3 * 864e5).map(iso);
  assert.deepEqual(d, ["2026-10-01T06:00", "2026-10-02T06:00", "2026-10-03T06:00"]);
  const s = firesBetween(parseCron("0 */6 * * *"), T0, T0 + 864e5).map(iso);
  assert.deepEqual(s, ["2026-10-01T00:00", "2026-10-01T06:00", "2026-10-01T12:00", "2026-10-01T18:00"]);
});

test("day-of-month and day-of-week are OR-ed when both restricted", () => {
  // 1st of month OR any Monday (2026-10: Mondays 5,12,19,26)
  const f = firesBetween(parseCron("0 0 1 * 1"), T0, T0 + 31 * 864e5).map((t) => new Date(t).getUTCDate());
  assert.deepEqual(f, [1, 5, 12, 19, 26]);
  // only weekday restricted -> only Mondays
  const g = firesBetween(parseCron("0 0 * * 1"), T0, T0 + 31 * 864e5).map((t) => new Date(t).getUTCDate());
  assert.deepEqual(g, [5, 12, 19, 26]);
});

test("cross-check against cron-parser on 400 random UTC expressions", () => {
  let seed = 42;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  const field = (min: number, max: number) => {
    switch (rnd(5)) {
      case 0: return "*";
      case 1: return String(min + rnd(max - min + 1));
      case 2: { const a = min + rnd(max - min + 1); const b = a + rnd(max - a + 1); return `${a}-${b}`; }
      case 3: return `*/${2 + rnd(Math.min(11, max - 1))}`; // (*/1 in day fields: robfig treats it as "*", cron-parser does not)
      default: { const a = min + rnd(max - min + 1); const b = min + rnd(max - min + 1); return a === b ? String(a) : [a, b].join(","); }
    }
  };
  for (let i = 0; i < 400; i++) {
    const expr = [field(0, 59), field(0, 23), field(1, 28), field(1, 12), field(0, 6)].join(" ");
    const ours = nextFires(parseCron(expr), T0 - 60_000, 12).map(iso);
    const it = CronExpressionParser.parse(expr, { currentDate: new Date(T0 - 60_000), tz: "UTC" });
    const ref: string[] = [];
    for (let k = 0; k < 12; k++) ref.push(iso(it.next().toDate().getTime()));
    assert.deepEqual(ours, ref, expr);
  }
});

test("timezone: New York schedule follows DST", () => {
  const c = parseCron("30 5 * * 1-5", "America/New_York");
  // Fri 2026-10-30 (EDT, UTC-4) and Mon 2026-11-02 (EST, UTC-5)
  const f = firesBetween(c, Date.parse("2026-10-30T00:00:00Z"), Date.parse("2026-11-03T00:00:00Z")).map(iso);
  assert.deepEqual(f, ["2026-10-30T09:30", "2026-11-02T10:30"]);
});

test("timezone: spring-forward gap advances to the next valid time (GitHub docs: 2:30 -> 3:00)", () => {
  const c = parseCron("30 2 * * *", "America/New_York");
  const f = firesBetween(c, Date.parse("2026-03-07T00:00:00Z"), Date.parse("2026-03-10T00:00:00Z")).map(iso);
  assert.deepEqual(f, ["2026-03-07T07:30", "2026-03-08T07:00", "2026-03-09T06:30"]);
});

test("timezone: fall-back ambiguity fires once", () => {
  const c = parseCron("30 1 * * *", "America/New_York");
  const f = firesBetween(c, Date.parse("2026-11-01T00:00:00Z"), Date.parse("2026-11-02T00:00:00Z")).map(iso);
  assert.deepEqual(f, ["2026-11-01T05:30"]);
});

test("prevFire and minInterval", () => {
  const c = parseCron("17 */6 * * *");
  assert.equal(iso(prevFire(c, Date.parse("2026-10-13T08:20:00Z"))!), "2026-10-13T06:17");
  assert.equal(minInterval(parseCron("*/2 * * * *"), T0), 120_000);
  assert.equal(minInterval(parseCron("0 6 * * *"), T0), 864e5);
});

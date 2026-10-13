// POSIX cron as GitHub Actions evaluates it: five fields, `* , - /`,
// month/day names, day-of-month and day-of-week OR-ed when both are
// restricted, optional IANA timezone (default UTC).

export interface Cron {
  source: string;
  timezone: string;
  minutes: number[];
  hours: number[];
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

export class CronError extends Error {}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function parseField(raw: string, min: number, max: number, names?: string[], nameBase = 0): number[] {
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    if (part === "") throw new CronError(`empty list item in "${raw}"`);
    let [range, stepRaw] = part.split("/");
    if (part.split("/").length > 2) throw new CronError(`bad step in "${part}"`);
    let step = 1;
    if (stepRaw !== undefined) {
      if (!/^\d+$/.test(stepRaw) || Number(stepRaw) === 0) throw new CronError(`bad step "${stepRaw}"`);
      step = Number(stepRaw);
    }
    let lo: number;
    let hi: number;
    const val = (s: string): number => {
      const up = s.toUpperCase();
      if (names) {
        const i = names.indexOf(up);
        if (i >= 0) return i + nameBase;
      }
      if (!/^\d+$/.test(s)) throw new CronError(`"${s}" is not a number`);
      return Number(s);
    };
    if (range === "*" || range === "?") {
      lo = min;
      hi = max;
    } else if (range.includes("-")) {
      const [a, b, ...rest] = range.split("-");
      if (rest.length) throw new CronError(`bad range "${range}"`);
      lo = val(a);
      hi = val(b);
      if (hi < lo) throw new CronError(`range "${range}" runs backwards`);
    } else {
      lo = val(range);
      hi = stepRaw !== undefined ? max : lo;
    }
    if (lo < min || hi > max) throw new CronError(`"${part}" is outside ${min}-${max}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

export function parseCron(source: string, timezone = "UTC"): Cron {
  const fields = source.trim().split(/\s+/);
  if (fields[0]?.startsWith("@")) throw new CronError(`GitHub Actions does not support "${fields[0]}"`);
  if (fields.length !== 5) throw new CronError(`expected 5 fields, got ${fields.length}`);
  if (!isValidTimeZone(timezone)) throw new CronError(`unknown timezone "${timezone}"`);
  const [m, h, dom, mon, dow] = fields;
  const weekdays = new Set(parseField(dow, 0, 7, DAYS).map((d) => (d === 7 ? 0 : d)));
  return {
    source: source.trim(),
    timezone,
    minutes: parseField(m, 0, 59),
    hours: parseField(h, 0, 23),
    days: new Set(parseField(dom, 1, 31)),
    months: new Set(parseField(mon, 1, 12, MONTHS, 1)),
    weekdays,
    domStar: dom === "*" || dom === "?" || dom === "*/1",
    dowStar: dow === "*" || dow === "?" || dow === "*/1",
  };
}

const tzCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = tzCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    tzCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` from UTC at instant `t`: local wall time = t + offset. */
export function tzOffset(t: number, tz: string): number {
  if (tz === "UTC" || tz === "Etc/UTC") return 0;
  const p: Record<string, number> = {};
  for (const part of fmt(tz).formatToParts(new Date(t))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(t / 1000) * 1000;
}

/** Instant for a local wall time; skipped (spring-forward) times move to the next valid time, as GitHub does. */
export function localToInstant(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const wall = Date.UTC(y, mo, d, h, mi);
  if (tz === "UTC" || tz === "Etc/UTC") return wall;
  const before = tzOffset(wall - 432e5, tz);
  const offs = new Set([before, tzOffset(wall, tz), tzOffset(wall + 432e5, tz)]);
  const cands = [...offs].map((o) => wall - o).sort((a, b) => a - b);
  // Ambiguous (fall-back) wall times resolve to the first occurrence.
  for (const t of cands) if (t + tzOffset(t, tz) === wall) return t;
  // Wall time falls in a DST gap: return the transition instant (e.g. 02:30 -> 03:00).
  let lo = wall - before - 3 * 36e5;
  let hi = wall - before;
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 120_000) * 60_000;
    if (tzOffset(mid, tz) === before) lo = mid;
    else hi = mid;
  }
  return hi;
}

interface Local {
  y: number;
  mo: number;
  d: number;
}

function matchesDay(c: Cron, l: Local): boolean {
  if (!c.months.has(l.mo + 1)) return false;
  const dow = new Date(Date.UTC(l.y, l.mo, l.d)).getUTCDay();
  const domOk = c.days.has(l.d);
  const dowOk = c.weekdays.has(dow);
  // robfig/cron and cron-parser rule: if either field is "*", both must match; otherwise either may.
  if (c.domStar || c.dowStar) return domOk && dowOk;
  return domOk || dowOk;
}

/** Every fire time of `c` with from <= t < to, ascending (epoch ms). */
export function firesBetween(c: Cron, from: number, to: number, limit = 200_000): number[] {
  const out: number[] = [];
  const startWall = from + tzOffset(from, c.timezone) - 864e5;
  const endWall = to + tzOffset(to, c.timezone) + 864e5;
  const seen = new Set<number>();
  for (let day = Math.floor(startWall / 864e5) * 864e5; day <= endWall; day += 864e5) {
    const dt = new Date(day);
    const l = { y: dt.getUTCFullYear(), mo: dt.getUTCMonth(), d: dt.getUTCDate() };
    if (!matchesDay(c, l)) continue;
    for (const h of c.hours) {
      for (const m of c.minutes) {
        const t = localToInstant(l.y, l.mo, l.d, h, m, c.timezone);
        if (t < from || t >= to || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
        if (out.length >= limit) return out.sort((a, b) => a - b);
      }
    }
  }
  return out.sort((a, b) => a - b);
}

/** Next `n` fire times strictly after `after`. */
export function nextFires(c: Cron, after: number, n = 5): number[] {
  const out: number[] = [];
  let from = Math.floor(after / 60_000) * 60_000 + 60_000;
  for (let span = 864e5 * 2; out.length < n && span < 864e5 * 366 * 30; span *= 2) {
    const got = firesBetween(c, from, from + span, n - out.length);
    out.push(...got);
    from += span;
  }
  return out.slice(0, n);
}

/** Smallest gap between consecutive fires over a sample window (ms), or null. */
export function minInterval(c: Cron, at: number): number | null {
  const f = firesBetween(c, at, at + 864e5 * 8, 20000);
  if (f.length < 2) return null;
  let best = Infinity;
  for (let i = 1; i < f.length; i++) best = Math.min(best, f[i] - f[i - 1]);
  return best;
}

/** Most recent fire <= t (searches back up to `maxBack`). */
export function prevFire(c: Cron, t: number, maxBack = 864e5 * 40): number | null {
  for (let span = 36e5 * 2; span <= maxBack * 2; span *= 4) {
    const f = firesBetween(c, t - span, t + 1);
    if (f.length) return f[f.length - 1];
  }
  return null;
}

export function describeMinute(c: Cron): { onTheHour: boolean; onTheHalf: boolean } {
  return { onTheHour: c.minutes.includes(0), onTheHalf: c.minutes.includes(30) };
}

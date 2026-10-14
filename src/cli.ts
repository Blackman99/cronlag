import { analyze, DAY, DEFAULTS, fmtDur, guard, HOUR, MIN, planCatchup, type Report, type Thresholds } from "./analyze.js";
import { collect } from "./collect.js";
import { CronError, nextFires, parseCron, minInterval } from "./cron.js";
import { formatCatchup, formatMarkdown, formatText } from "./format.js";
import { GitHub, GitHubError } from "./github.js";
import { runMcp } from "./mcp.js";
import { findToken, repoFromGit } from "./token.js";
import { VERSION } from "./version.js";
import { readTriggers } from "./workflow.js";
import { appendFileSync } from "node:fs";

const HELP = `cronlag ${VERSION} — is your scheduled GitHub Actions workflow late, dropped, or broken?

Usage
  cronlag [owner/repo] [options]          slot-by-slot lag report (default: this git repo)
  cronlag catchup [owner/repo] [--dispatch] [--grace 15m]
                                          find due slots with no run; --dispatch runs them via workflow_dispatch
  cronlag guard                           inside a scheduled run: skip=true if catch-up already ran this slot
  cronlag explain "<cron>" [--tz Zone] [-n 5]
                                          next fire times, interval, busy-minute check
  cronlag mcp                             MCP server on stdio (read-only tools)

Options
  -d, --days <n>          window to inspect (default 7, max 90)
  -w, --workflow <x>      only this workflow (file, path, name or id); repeatable
  -f, --format <fmt>      text | json | markdown (default text)
      --fail-on <level>   never | dropped | late   exit 1 when a workflow is that bad (default never)
      --late <dur>        lag that counts as "very late" (default 1h)
      --on-time <dur>     lag still counted as on time (default 10m)
      --token <t>         GitHub token (default: $GITHUB_TOKEN, $GH_TOKEN, then \`gh auth token\`)
      --no-color          plain output
  -h, --help / -v, --version

Public repos work without a token (60 API calls/hour); private repos need actions:read.
catchup --dispatch needs actions:write. Docs: https://blackman99.github.io/cronlag/docs/`;

interface Args {
  cmd: string;
  pos: string[];
  flags: Record<string, string[]>;
}

const SHORT: Record<string, string> = { d: "days", w: "workflow", f: "format", h: "help", v: "version", n: "count" };
const BOOL = new Set(["help", "version", "no-color", "dispatch", "lite", "json"]);
const VALUED = new Set(["days", "workflow", "format", "count", "fail-on", "late", "on-time", "token", "grace", "tz", "cron"]);

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string[]> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      let [k, v] = a.replace(/^--?/, "").split(/=(.*)/s, 2) as [string, string | undefined];
      if (!a.startsWith("--")) k = SHORT[k] ?? k;
      // Reject typos and not-yet-supported flags instead of silently reporting a different window.
      if (!BOOL.has(k) && !VALUED.has(k)) throw new UsageError(`unknown option ${a.split("=")[0]}`);
      if (BOOL.has(k)) {
        (flags[k] ??= []).push("true");
        continue;
      }
      if (v === undefined) v = argv[++i];
      if (v === undefined) throw new UsageError(`--${k} needs a value`);
      (flags[k] ??= []).push(v);
    } else pos.push(a);
  }
  const cmds = ["catchup", "guard", "explain", "mcp", "report"];
  const cmd = pos.length && cmds.includes(pos[0]) ? (pos.shift() as string) : "report";
  return { cmd, pos, flags };
}

class UsageError extends Error {}

export function parseDur(s: string): number {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|min|h|d)?$/i);
  if (!m) throw new UsageError(`bad duration "${s}" (try 15m, 1h, 2d)`);
  const n = Number(m[1]);
  const u = (m[2] ?? "m").toLowerCase();
  return n * (u === "s" ? 1000 : u === "h" ? HOUR : u === "d" ? DAY : MIN);
}

function one(a: Args, k: string): string | undefined {
  const v = a.flags[k];
  return v ? v[v.length - 1] : undefined;
}

function thresholds(a: Args): Thresholds {
  return {
    ...DEFAULTS,
    lateMs: one(a, "late") ? parseDur(one(a, "late")!) : DEFAULTS.lateMs,
    onTimeMs: one(a, "on-time") ? parseDur(one(a, "on-time")!) : DEFAULTS.onTimeMs,
  };
}

function resolveRepo(a: Args): string {
  const r = a.pos[0] ?? process.env.GITHUB_REPOSITORY ?? repoFromGit();
  if (!r) throw new UsageError("which repo? pass owner/repo (or run inside a git clone with a GitHub origin)");
  const m = r.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  if (!m) throw new UsageError(`"${r}" is not owner/repo`);
  return m[1];
}

export function exitFor(r: Report, failOn: string): number {
  if (failOn === "never") return 0;
  const bad = failOn === "late" ? ["LATE", "DROPPING", "NOT FIRING", "DISABLED", "INVALID"] : ["DROPPING", "NOT FIRING", "DISABLED", "INVALID"];
  return r.workflows.some((w) => bad.includes(w.verdict)) ? 1 : 0;
}

async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  if (a.flags.help) {
    console.log(HELP);
    return 0;
  }
  if (a.flags.version) {
    console.log(VERSION);
    return 0;
  }
  const color = !a.flags["no-color"] && !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);

  if (a.cmd === "mcp") {
    await runMcp(() => new GitHub({ token: findToken(one(a, "token")), userAgent: `cronlag/${VERSION}` }));
    return 0;
  }

  if (a.cmd === "explain") {
    const expr = a.pos.join(" ");
    if (!expr) throw new UsageError('explain needs a cron expression, e.g. cronlag explain "0 6 * * *"');
    const tz = one(a, "tz") ?? "UTC";
    let c;
    try {
      c = parseCron(expr, tz);
    } catch (e) {
      if (e instanceof CronError) {
        console.error(`invalid cron: ${e.message}`);
        return 2;
      }
      throw e;
    }
    const n = Number(one(a, "count") ?? 5);
    const fires = nextFires(c, Date.now(), n);
    const gap = minInterval(c, Date.now());
    if (one(a, "format") === "json") {
      console.log(JSON.stringify({ cron: c.source, timezone: tz, next: fires.map((t) => new Date(t).toISOString()), minIntervalMs: gap, minuteZero: c.minutes.includes(0) }, null, 2));
      return 0;
    }
    console.log(`${c.source}${tz !== "UTC" ? `  (${tz})` : ""}`);
    for (const t of fires) console.log(`  ${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`);
    if (gap !== null) console.log(`  shortest interval ${fmtDur(gap)}${gap < 5 * MIN ? " — below GitHub's 5-minute minimum" : ""}`);
    if (c.minutes.includes(0)) console.log("  ! minute 0 is GitHub's busiest minute; pick another (e.g. 7 or 43)");
    return 0;
  }

  const token = findToken(one(a, "token"));
  const gh = new GitHub({ token, userAgent: `cronlag/${VERSION}` });

  if (a.cmd === "guard") {
    const repo = process.env.GITHUB_REPOSITORY;
    const runId = Number(process.env.GITHUB_RUN_ID);
    const event = process.env.GITHUB_EVENT_NAME;
    const out = (k: string, v: string) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
    if (event !== "schedule") {
      console.log(`cronlag guard: event is ${event ?? "unknown"}, not schedule — nothing to guard (skip=false)`);
      out("skip", "false");
      return 0;
    }
    if (!repo || !runId) throw new UsageError("guard runs inside GitHub Actions (needs GITHUB_REPOSITORY and GITHUB_RUN_ID)");
    const ev = process.env.GITHUB_EVENT_PATH ? JSON.parse((await import("node:fs")).readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
    const cronStr: string | undefined = ev.schedule ?? one(a, "cron");
    if (!cronStr) throw new UsageError("could not read github.event.schedule");
    const run = await gh.run(repo, runId);
    const wfPath = process.env.GITHUB_WORKFLOW_REF?.split("@")[0].split("/").slice(2).join("/");
    let tz = one(a, "tz") ?? "UTC";
    let wfId: number | undefined;
    const wfs = await gh.workflows(repo);
    const wf = wfs.find((w) => w.path === wfPath) ?? wfs.find((w) => w.name === process.env.GITHUB_WORKFLOW);
    if (wf) {
      wfId = wf.id;
      try {
        const repoInfo = await gh.repo(repo);
        const t = readTriggers(await gh.file(repo, wf.path, repoInfo.defaultBranch));
        tz = t.schedules.find((s) => s.cron === cronStr.trim())?.timezone ?? tz;
      } catch {
        /* keep UTC */
      }
    }
    const dispatchRuns = wfId ? await gh.runs(repo, wfId, { event: "workflow_dispatch", since: run.created - 2 * DAY, maxPages: 1 }) : [];
    const g = guard(parseCron(cronStr, tz), run.created, dispatchRuns);
    console.log(`cronlag guard: ${g.skip ? "SKIP" : "RUN"} — ${g.reason}`);
    out("skip", String(g.skip));
    out("slot", g.slot ?? "");
    out("lag-minutes", g.lagMs === null ? "" : String(Math.round(g.lagMs / MIN)));
    return 0;
  }

  const repo = resolveRepo(a);
  const days = Math.min(90, Math.max(1, Number(one(a, "days") ?? 7)));
  const t = thresholds(a);
  if (!token && process.stderr.isTTY) console.error("(no GitHub token found — public repos only, 60 API calls/hour)");

  if (a.cmd === "catchup") {
    const grace = parseDur(one(a, "grace") ?? "15m");
    const snap = await collect(gh, repo, { days: 2, workflows: a.flags.workflow, lite: true });
    const steps = planCatchup(snap, grace, t);
    const doIt = !!a.flags.dispatch;
    if (doIt) {
      for (const s of steps.filter((x) => x.action === "dispatch")) {
        await gh.dispatch(snap.repo.fullName, s.id, snap.repo.defaultBranch);
      }
    }
    if (one(a, "format") === "json") console.log(JSON.stringify({ repo: snap.repo.fullName, dispatched: doIt, steps }, null, 2));
    else {
      console.log(formatCatchup(steps, doIt, color));
      if (!doIt && steps.some((s) => s.action === "dispatch")) console.log("\n(dry run — add --dispatch to run the slots above via workflow_dispatch)");
    }
    return 0;
  }

  const snap = await collect(gh, repo, { days, workflows: a.flags.workflow, lite: !!a.flags.lite });
  const report = analyze(snap, t);
  const format = one(a, "format") ?? (a.flags.json ? "json" : "text");
  if (format === "json") console.log(JSON.stringify(report, null, 2));
  else if (format === "markdown" || format === "md") console.log(formatMarkdown(report));
  else console.log(formatText(report, { color, width: process.stdout.columns }));
  return exitFor(report, one(a, "fail-on") ?? "never");
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    if (e instanceof UsageError) {
      console.error(`cronlag: ${e.message}\nRun \`cronlag --help\` for usage.`);
      process.exit(2);
    }
    if (e instanceof GitHubError) {
      console.error(`cronlag: ${e.message}`);
      process.exit(3);
    }
    console.error(e);
    process.exit(3);
  },
);

import { parse } from "yaml";
import { CronError, parseCron, type Cron } from "./cron.js";

export interface ScheduleEntry {
  cron: string;
  timezone: string;
  parsed?: Cron;
  error?: string;
}

export interface WorkflowTriggers {
  schedules: ScheduleEntry[];
  hasDispatch: boolean;
  parseError?: string;
}

/** Read the `on:` block of a workflow file. Handles YAML 1.1 `on` -> true. */
export function readTriggers(text: string): WorkflowTriggers {
  let doc: unknown;
  try {
    doc = parse(text, { version: "1.2", uniqueKeys: false });
  } catch (e) {
    return { schedules: [], hasDispatch: false, parseError: (e as Error).message.split("\n")[0] };
  }
  if (!doc || typeof doc !== "object") return { schedules: [], hasDispatch: false, parseError: "workflow file is empty" };
  const d = doc as Record<string, unknown>;
  const on = d.on ?? d["true"] ?? (d as Record<string | number, unknown>)[1 as unknown as string];
  const out: WorkflowTriggers = { schedules: [], hasDispatch: false };
  if (typeof on === "string") {
    out.hasDispatch = on === "workflow_dispatch";
    return out;
  }
  if (Array.isArray(on)) {
    out.hasDispatch = on.includes("workflow_dispatch");
    return out;
  }
  if (!on || typeof on !== "object") return out;
  const o = on as Record<string, unknown>;
  out.hasDispatch = "workflow_dispatch" in o;
  const sched = o.schedule;
  if (Array.isArray(sched)) {
    for (const item of sched) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      if (typeof it.cron !== "string") continue;
      const tz = typeof it.timezone === "string" && it.timezone ? it.timezone : "UTC";
      const e: ScheduleEntry = { cron: it.cron.trim(), timezone: tz };
      try {
        e.parsed = parseCron(e.cron, tz);
      } catch (err) {
        e.error = err instanceof CronError ? err.message : String(err);
      }
      out.schedules.push(e);
    }
  }
  return out;
}

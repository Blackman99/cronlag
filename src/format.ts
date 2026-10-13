import { fmtDur, HOUR, type Report, type Slot, type WorkflowReport, type CatchupStep } from "./analyze.js";

export interface TextOptions {
  color: boolean;
  width?: number;
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** One glyph per slot: bar height ~ log(lag); ✕ missed, ? overdue, · pending. */
export function slotGlyph(s: Slot): { ch: string; tone: "green" | "yellow" | "red" | "magenta" | "gray" } {
  switch (s.status) {
    case "missed":
      return { ch: "✕", tone: "magenta" };
    case "overdue":
      return { ch: "?", tone: "magenta" };
    case "pending":
      return { ch: "·", tone: "gray" };
    default: {
      const m = (s.lagMs ?? 0) / 60_000;
      const steps = [2, 10, 30, 60, 180, 360, 720];
      let i = steps.findIndex((x) => m <= x);
      if (i < 0) i = 7;
      return { ch: BARS[i], tone: s.status === "ontime" ? "green" : s.status === "late" ? "yellow" : "red" };
    }
  }
}

const TONE: Record<string, string> = { "ON TIME": "green", LATE: "yellow", DROPPING: "red", "NOT FIRING": "red", DISABLED: "red", INVALID: "red", "NO DATA": "gray" };

export function formatText(r: Report, o: TextOptions): string {
  const c = (k: keyof typeof C, s: string) => (o.color ? C[k] + s + C.reset : s);
  const width = Math.max(40, Math.min(o.width ?? 100, 140));
  const lines: string[] = [];
  lines.push(`${c("bold", "cronlag")}  ${r.repo}  ${c("dim", `· last ${r.days} days · times UTC`)}`);
  if (!r.workflows.length) {
    lines.push("");
    lines.push(`No scheduled workflows found${r.unscheduled.length ? ` (${r.unscheduled.length} workflows without \`on: schedule\`)` : ""}.`);
    return lines.join("\n");
  }
  for (const w of r.workflows) {
    lines.push("");
    const crons = w.crons.map((x) => `${x.cron}${x.timezone !== "UTC" ? ` (${x.timezone})` : ""}`).join("  |  ");
    lines.push(`${c("bold", w.file)}  ${c("dim", `"${w.name}"`)}  ${c("cyan", crons)}`);
    for (const ch of w.changes) lines.push(`  ${c("dim", `schedule changed ${ch.at.slice(0, 16).replace("T", " ")} → ${ch.crons.join(", ") || "(none)"}; earlier slots use the old cron`)}`);
    // strip
    const perLine = Math.max(20, width - 4);
    for (let i = 0; i < w.slots.length; i += perLine) {
      const chunk = w.slots.slice(i, i + perLine);
      lines.push("  " + chunk.map((s) => { const g = slotGlyph(s); return c(g.tone, g.ch); }).join(""));
    }
    const s = w.stats;
    if (w.slots.length) {
      lines.push(
        `  ${s.due} slots · ${s.ran} ran · ${s.missed ? c("magenta", `${s.missed} missed`) : "0 missed"}${s.overdue ? ` · ${c("magenta", `${s.overdue} overdue`)}` : ""}` +
          (s.ran ? `   lag min ${fmtDur(s.lagMin)} · median ${c("bold", fmtDur(s.lagMedian))} · p90 ${fmtDur(s.lagP90)} · max ${fmtDur(s.lagMax)}   on time ${s.onTime}/${s.ran} · within 1h ${s.within1h}/${s.ran}` : ""),
      );
    }
    const tone = (TONE[w.verdict] ?? "gray") as keyof typeof C;
    lines.push(`  ${c(tone, c("bold", w.verdict.padEnd(10)))} ${w.headline}`);
    for (const f of w.findings) {
      const mark = f.level === "error" ? c("red", "✗") : f.level === "warn" ? c("yellow", "!") : c("dim", "·");
      lines.push(`  ${mark} ${f.level === "info" ? c("dim", f.message) : f.message}`);
      if (f.fix) lines.push(`    ${c("dim", "→")} ${f.fix}`);
    }
  }
  if (r.unscheduled.length) {
    lines.push("");
    lines.push(c("dim", `${r.unscheduled.length} other workflow${r.unscheduled.length === 1 ? "" : "s"} without a schedule: ${r.unscheduled.slice(0, 8).join(", ")}${r.unscheduled.length > 8 ? ", …" : ""}`));
  }
  lines.push("");
  lines.push(c("dim", "legend: bar height = lag ▁≤2m ▂≤10m ▃≤30m ▄≤1h ▅≤3h ▆≤6h ▇≤12h █>12h ·  green ≤10m · yellow ≤1h · red >1h · ✕ no run within 24h · ? no run yet"));
  return lines.join("\n");
}

function mdSlotRow(w: WorkflowReport): string {
  return w.slots.map((s) => slotGlyph(s).ch).join("");
}

export function formatMarkdown(r: Report): string {
  const out: string[] = [];
  out.push(`### cronlag — ${r.repo} (last ${r.days} days, UTC)`);
  out.push("");
  if (!r.workflows.length) {
    out.push("No scheduled workflows found.");
    return out.join("\n");
  }
  out.push("| Workflow | Cron | Verdict | Slots | Ran | Missed | Median lag | p90 | Max | Within 1h |");
  out.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const w of r.workflows) {
    const s = w.stats;
    out.push(
      `| [${w.file}](${w.url}) | ${w.crons.map((x) => "`" + x.cron + "`").join("<br>")} | **${w.verdict}** | ${s.due} | ${s.ran} | ${s.missed}${s.overdue ? ` (+${s.overdue} overdue)` : ""} | ${fmtDur(s.lagMedian)} | ${fmtDur(s.lagP90)} | ${fmtDur(s.lagMax)} | ${s.ran ? `${s.within1h}/${s.ran}` : "–"} |`,
    );
  }
  for (const w of r.workflows) {
    out.push("");
    out.push(`**${w.file}** — ${w.verdict}: ${w.headline}`);
    if (w.slots.length) out.push("", "`" + mdSlotRow(w) + "`");
    for (const f of w.findings) out.push(`- ${f.level === "error" ? "✗" : f.level === "warn" ? "⚠️" : "·"} ${f.message}${f.fix ? ` → ${f.fix.includes("`") ? f.fix : "`" + f.fix + "`"}` : ""}`);
    const late = w.slots.filter((s) => s.status !== "ontime" && s.status !== "pending").slice(-8);
    if (late.length) {
      out.push("", "<details><summary>Recent slots that were late or missed</summary>", "", "| Slot (UTC) | Run created | Lag |", "|---|---|---:|");
      for (const s of late) {
        out.push(`| ${new Date(s.at).toISOString().slice(0, 16).replace("T", " ")} | ${s.run ? `[#${s.run.number}](${s.run.url}) ${new Date(s.run.created).toISOString().slice(0, 16).replace("T", " ")}` : s.status === "missed" ? "**no run**" : "_none yet_"} | ${s.run ? fmtDur(s.lagMs) : `${fmtDur(s.lagMs)}+`} |`);
      }
      out.push("", "</details>");
    }
  }
  out.push("", `<sub>Lag = cron slot → run creation. Generated by [cronlag](https://github.com/Blackman99/cronlag).</sub>`);
  return out.join("\n");
}

export function formatCatchup(steps: CatchupStep[], dispatched: boolean, color: boolean): string {
  const c = (k: keyof typeof C, s: string) => (color ? C[k] + s + C.reset : s);
  if (!steps.length) return "No scheduled workflows.";
  return steps
    .map((s) => {
      const tag = s.action === "dispatch" ? c("yellow", dispatched ? "DISPATCHED" : "WOULD RUN ") : s.action === "covered" ? c("green", "COVERED   ") : c("dim", "SKIP      ");
      return `${tag} ${s.file.padEnd(28)} ${s.slot ? c("dim", s.slot) + "  " : ""}${s.reason}`;
    })
    .join("\n");
}

export function isLateHour(ms: number | null): boolean {
  return (ms ?? 0) > HOUR;
}

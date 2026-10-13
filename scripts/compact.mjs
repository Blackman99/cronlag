// Shrink a Report to what the landing page draws.
export function compact(r) {
  return {
    repo: r.repo,
    repoUrl: r.repoUrl,
    from: r.from,
    now: r.now,
    days: r.days,
    workflows: r.workflows.map((w) => ({
      file: w.file,
      name: w.name,
      url: w.url,
      crons: w.crons.map((c) => c.cron + (c.timezone !== "UTC" ? ` (${c.timezone})` : "")),
      verdict: w.verdict,
      headline: w.headline,
      stats: w.stats,
      findings: w.findings.map((f) => ({ level: f.level, code: f.code, message: f.message, fix: f.fix })),
      slots: w.slots.map((s) => [s.at, s.status[0] === "o" && s.status === "overdue" ? "?" : s.status === "ontime" ? "o" : s.status === "late" ? "l" : s.status === "verylate" ? "v" : s.status === "missed" ? "x" : "p", s.lagMs ?? 0, s.run ? s.run.url : null]),
    })),
  };
}

// Pre-compute real reports for the landing page (so the clock has real data before any API call).
// usage: node scripts/site_data.mjs   (uses GITHUB_TOKEN or `gh auth token`)
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { analyze, collect, GitHub } from "../dist/index.js";
import { compact } from "./compact.mjs";

const token = process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const gh = new GitHub({ token });
const SAMPLES = [
  { repo: "robhunter/agentdeals", days: 7, workflows: ["reverify.yml"], source: "https://github.com/robhunter/agentdeals/issues/1848" },
  { repo: "fpgas-online/fpgas.online-e2e-tests", days: 7, source: "https://github.com/fpgas-online/fpgas.online-e2e-tests/issues/16" },
  { repo: "kort0881/facts-telegram-generator", days: 7, source: "https://github.com/orgs/community/discussions/206134" },
  { repo: "dongioia/chrlauncher-feed", days: 7, source: "https://github.com/dongioia/chrlauncher-feed/issues/1" },
];
const out = [];
for (const s of SAMPLES) {
  const snap = await collect(gh, s.repo, { days: s.days, workflows: s.workflows });
  out.push({ ...compact(analyze(snap)), source: s.source });
  console.log(`${s.repo}: ${out.at(-1).workflows.map((w) => `${w.file} ${w.verdict}`).join(", ")}`);
}
mkdirSync("site/data", { recursive: true });
writeFileSync("site/data/samples.json", JSON.stringify({ generatedAt: new Date().toISOString(), samples: out }));

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

test("explain prints next fires and flags minute 0", () => {
  const r = spawnSync(process.execPath, [CLI, "explain", "0 6 * * *", "-n", "2"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /06:00 UTC/);
  assert.match(r.stdout, /busiest minute/);
  const bad = spawnSync(process.execPath, [CLI, "explain", "@daily"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});

test("usage errors exit 2", () => {
  const r = spawnSync(process.execPath, [CLI, "not a repo!"], { encoding: "utf8", env: { ...process.env, GITHUB_REPOSITORY: "" } });
  assert.equal(r.status, 2);
});

test("MCP stdio: initialize, tools/list, cron_explain", async () => {
  const p = spawn(process.execPath, [CLI, "mcp"], { stdio: ["pipe", "pipe", "inherit"] });
  const lines: any[] = [];
  let buf = "";
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      lines.push(JSON.parse(buf.slice(0, i)));
      buf = buf.slice(i + 1);
    }
  });
  const send = (m: object) => p.stdin.write(JSON.stringify(m) + "\n");
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "cron_explain", arguments: { cron: "17 */6 * * *", count: 3 } } });
  p.stdin.end();
  await new Promise((r) => p.on("close", r));
  const byId = Object.fromEntries(lines.map((l) => [l.id, l]));
  assert.equal(byId[1].result.serverInfo.name, "cronlag");
  assert.deepEqual(byId[2].result.tools.map((t: any) => t.name).sort(), ["catchup_plan", "cron_explain", "schedule_report"]);
  const out = JSON.parse(byId[3].result.content[0].text);
  assert.equal(out.next.length, 3);
  assert.equal(out.shortestInterval, "6h00");
});

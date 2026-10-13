// Generates site/blog/*.html (EN + ZH launch articles). node scripts/build_blog.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://blackman99.github.io/cronlag";
const posts = [
  {
    slug: "why-is-my-cron-late", lang: "en",
    title: "Your cron said 06:00. GitHub ran it at 11:50.",
    desc: "Measuring scheduled GitHub Actions lag slot by slot, telling your bugs from GitHub's, and catching up without double runs.",
    body: `
<p class="lead">Since late August 2026 a lot of <code>on: schedule</code> workflows have been running hours late, or not at all. The community threads (<a href="https://github.com/orgs/community/discussions/206019">#206019</a>, <a href="https://github.com/orgs/community/discussions/206134">#206134</a>, <a href="https://github.com/orgs/community/discussions/210037">#210037</a>) are full of people building the same spreadsheet by hand. cronlag builds it for you.</p>
<h2>What the numbers look like</h2>
<p>These are real public repos, measured on 2026-10-13 over the previous week:</p>
<table><tr><th>Workflow</th><th>cron</th><th>Result</th></tr>
<tr><td>robhunter/agentdeals <code>reverify.yml</code></td><td><code>0 6 * * *</code></td><td><b>LATE</b>: median 6h37 after the slot, 0 of 6 runs within an hour</td></tr>
<tr><td>fpgas-online e2e <code>e2e.yml</code></td><td><code>0 */2 * * *</code></td><td><b>DROPPING</b>: 24 of 36 slots in 3 days never got a run</td></tr>
<tr><td>kort0881 facts generator</td><td>several daily</td><td><b>DROPPING</b>: 17 of 50 missed, median lag 2h39</td></tr></table>
<p>None of these repos did anything wrong that would explain hours of lag. That is the first question everyone asks, so cronlag answers it explicitly.</p>
<h2>Why it is hard to see</h2>
<p>The REST API lists schedule runs but never says which cron slot a run was for. A run created at 11:50 for a <code>0 6 * * *</code> workflow is "a run at 11:50". To get lag you have to expand the cron the way GitHub does (POSIX 5-field, names, the day-of-month/day-of-week OR rule, the 2026 <code>timezone:</code> key with DST gaps), then attribute each run to a slot. And if someone edited the cron last Tuesday, half the "missed" slots are not missed at all.</p>
<p>cronlag reads the workflow file's commit history to know which cron was live when, ties each run to the closest preceding unclaimed slot within 24 hours, and measures lag to run <em>creation</em>. Creation happens before any runner is involved, so that number belongs to GitHub's scheduler. Queue time (creation to start) is shown separately because that one is about your runners.</p>
<h2>Is it me or GitHub?</h2>
<p>Each workflow gets the checklist those threads walk through by hand: disabled after 60 days of inactivity (warned from day 45), disabled manually, archived repo, YAML that doesn't parse, a cron GitHub rejects, intervals under 5 minutes, minute 0 (with a quieter minute suggested), forks, the schedule not on the default branch, no <code>workflow_dispatch</code> to fall back on, and queueing on runners. If all of that is clean and manual runs start in seconds, it says so: the lag is the scheduler.</p>
<h2>Catch-up without double runs</h2>
<p><code>cronlag catchup owner/repo --dispatch</code>, run every 10–15 minutes from any cron that isn't GitHub's, dispatches the latest slot that has no run after a 15 minute grace period, once. When GitHub's late run finally shows up, the Action's <code>mode: guard</code> sees that a dispatch already covered that slot and sets <code>skip=true</code>, so your job doesn't run twice.</p>
<pre><code>npx github:Blackman99/cronlag owner/repo
npx github:Blackman99/cronlag catchup owner/repo --dispatch</code></pre>
<p>Also included: <code>--format markdown</code> to paste into an issue, <code>--fail-on dropped</code> for a weekly health check in CI, and an MCP server (<code>cronlag mcp</code>) so an agent can answer "why didn't my nightly run?" from real data. Or <a href="../">try a repo in the browser</a>; it calls the public API from your machine.</p>
<p><a href="https://github.com/Blackman99/cronlag">github.com/Blackman99/cronlag</a> · MIT</p>`,
  },
  {
    slug: "cron-yanchi-zh", lang: "zh-CN",
    title: "cron 写的是 06:00，GitHub 11:50 才跑：cronlag 帮你把延迟和漏跑一格一格算清楚",
    desc: "GitHub Actions 定时任务延迟、漏跑排查工具：逐个 cron 时刻算延迟，判断是自己配置问题还是 GitHub 调度器问题，并安全补跑。",
    body: `
<p class="lead">2026 年 8 月底以来，很多仓库的 <code>on: schedule</code> 定时工作流晚几个小时才触发，甚至直接不触发。社区讨论（<a href="https://github.com/orgs/community/discussions/206019">#206019</a>、<a href="https://github.com/orgs/community/discussions/210037">#210037</a>）里大家都在手工整理同一张表：哪些时刻跑了、晚了多久、哪些没跑、到底是不是自己的问题。cronlag 把这张表自动算出来。</p>
<h2>真实数据</h2>
<table><tr><th>工作流</th><th>cron</th><th>结果</th></tr>
<tr><td>robhunter/agentdeals <code>reverify.yml</code></td><td><code>0 6 * * *</code></td><td><b>LATE</b>：中位延迟 6 小时 37 分，6 次里 0 次在 1 小时内</td></tr>
<tr><td>fpgas-online e2e</td><td><code>0 */2 * * *</code></td><td><b>DROPPING</b>：3 天 36 个时刻里 24 个从没跑过</td></tr>
<tr><td>kort0881 facts generator</td><td>每天多次</td><td><b>DROPPING</b>：50 个漏掉 17 个，中位延迟 2 小时 39 分</td></tr></table>
<h2>为什么难看出来</h2>
<p>REST API 只列出 schedule 触发的运行，不告诉你它对应哪个 cron 时刻。要算延迟，得按 GitHub 的规则展开 cron（5 段、月份/星期名称、日和星期的“或”规则、2026 年新增的 <code>timezone:</code> 和夏令时空档），再把每次运行归到对应时刻。如果你上周二改过 cron，一半“漏跑”其实根本不存在。</p>
<p>cronlag 会读工作流文件的提交历史，按当时生效的 cron 判断；每次运行归到 24 小时内最近的、还没被占用的时刻；延迟量的是“时刻 → 运行创建”。创建发生在任何 runner 介入之前，所以这段延迟属于 GitHub 调度器；排队时间（创建 → 开始）单独显示，那才和你的 runner 有关。</p>
<h2>是我的问题还是 GitHub 的？</h2>
<p>逐项检查：公开仓库 60 天无活动被禁用（第 45 天起提醒）、手动禁用、仓库归档、YAML 解析失败、cron 不合法、间隔小于 5 分钟、整点 0 分（并推荐一个更空闲的分钟）、fork、定时任务不在默认分支、没有 <code>workflow_dispatch</code>、runner 排队。都没问题、手动运行几秒就启动，它会直接告诉你：延迟在调度器那边。</p>
<h2>补跑但不重复跑</h2>
<p>在任意非 GitHub 的 cron 里每 10–15 分钟执行 <code>cronlag catchup owner/repo --dispatch</code>，对超过 15 分钟宽限期仍没运行的最新时刻触发一次 <code>workflow_dispatch</code>。GitHub 迟到的那次运行来了以后，Action 的 <code>mode: guard</code> 发现这个时刻已经被补跑覆盖，输出 <code>skip=true</code>，不会跑两遍。</p>
<pre><code>npx github:Blackman99/cronlag owner/repo
npx github:Blackman99/cronlag catchup owner/repo --dispatch</code></pre>
<p>另外还有 <code>--format markdown</code>（直接贴进 issue）、<code>--fail-on dropped</code>（CI 里每周体检）和 MCP 服务器 <code>cronlag mcp</code>（让 AI 助手用真实数据回答“为什么昨晚的任务没跑”）。也可以<a href="../">在浏览器里直接查一个仓库</a>，请求从你自己的浏览器发往公开 API。</p>
<p><a href="https://github.com/Blackman99/cronlag">github.com/Blackman99/cronlag</a> · MIT 协议</p>`,
  },
];

const page = (p) => `<!doctype html><html lang="${p.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title} — cronlag</title><meta name="description" content="${p.desc}">
<link rel="canonical" href="${BASE}/blog/${p.slug}.html"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#2e1a12">
<meta property="og:type" content="article"><meta property="og:site_name" content="cronlag"><meta property="og:url" content="${BASE}/blog/${p.slug}.html">
<meta property="og:title" content="${p.title}"><meta property="og:description" content="${p.desc}">
<meta property="og:image" content="${BASE}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${p.title}"><meta name="twitter:description" content="${p.desc}"><meta name="twitter:image" content="${BASE}/og.png">
<link rel="stylesheet" href="../docs/docs.css"></head><body>
<header class="bar"><a class="home" href="../"><img src="../logo.svg" alt="" width="40" height="40"><span>cronlag</span></a><nav><a href="../docs/">Docs</a><a href="./">Blog</a><a href="https://github.com/Blackman99/cronlag">GitHub</a></nav></header>
<main class="doc"><p class="meta">2026-10-13</p><h1>${p.title}</h1>${p.body}</main>
<footer class="dfoot"><a href="https://github.com/Blackman99/cronlag">GitHub</a> · MIT</footer>
</body></html>
`;

mkdirSync("site/blog", { recursive: true });
for (const p of posts) writeFileSync(`site/blog/${p.slug}.html`, page(p));
writeFileSync("site/blog/index.html", page({
  slug: "index", lang: "en", title: "cronlag blog", desc: "Notes on scheduled GitHub Actions workflows.",
  body: posts.map((p) => `<h2><a href="${p.slug}.html" lang="${p.lang}">${p.title}</a></h2><p>${p.desc}</p>`).join("\n"),
}).replace(`${BASE}/blog/index.html`, `${BASE}/blog/`));
console.log("wrote", posts.length + 1, "blog pages");

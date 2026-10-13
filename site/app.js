// cronlag landing: a cuckoo clock driven by real scheduled-workflow data.
const NS = "http://www.w3.org/2000/svg";
const DAY = 864e5, MIN = 6e4, CX = 400, CY = 572;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
const COLOR = { o: "#8fb547", l: "#e3876f", v: "#b8405e", "?": "#e3876f", x: "#b8405e", p: "#9a6a3c" };
const hhmm = (t) => new Date(t).toISOString().slice(11, 16);
const dayLabel = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
function fmtDur(ms) {
  if (ms == null || !isFinite(ms)) return "–";
  const m = Math.round(Math.abs(ms) / MIN);
  if (m < 60) return `${m}m`;
  if (m < 2880) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  return `${Math.floor(m / 1440)}d${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}h`;
}
const ang = (t) => ((t % DAY) / DAY) * 2 * Math.PI - Math.PI / 2;
const pt = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
function arcPath(r, a1, a2) {
  if (a2 - a1 >= 2 * Math.PI - 0.01) a2 = a1 + 2 * Math.PI - 0.01;
  const [x1, y1] = pt(r, a1), [x2, y2] = pt(r, a2);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

// ---------- static carving + dial face
function carve() {
  const roof = $("roofleaves");
  const leaf = (x, y, rot, s, fill, parent = roof) => {
    const g = el("g", { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${s})` }, parent);
    el("path", { d: "M0 0 C8 -12 26 -12 34 0 C26 12 8 12 0 0Z", fill }, g);
    el("path", { d: "M2 0 H30", stroke: "#1b0f0a", "stroke-width": 1.4, "stroke-opacity": 0.7 }, g);
  };
  for (const side of [-1, 1]) {
    for (let i = 1; i < 11; i++) {
      const t = i / 11;
      const x = 400 + side * (370 * t), y = 36 + 316 * t;
      leaf(x - side * 4, y + 26, side > 0 ? 40 + (i % 2) * 70 : 140 - (i % 2) * 70, 0.9, i % 2 ? "#6b4029" : "#4a2b1c");
    }
  }
  // painted sprig at the gable peak
  for (const [dx, rot] of [[-24, 200], [-12, 240], [0, 270], [12, 300], [24, 340]]) leaf(400 + dx, 66, rot, 0.62, "#8fb547");
  el("circle", { cx: 400, cy: 60, r: 7, fill: "#e3876f" }, roof);
  const c = $("carving");
  for (const [x, y, r] of [[160, 360, 0], [640, 360, 90], [160, 784, 270], [640, 784, 180]]) {
    const g = el("g", { transform: `translate(${x} ${y}) rotate(${r})` }, c);
    for (let k = 0; k < 3; k++) leaf(0, 0, k * 32, 0.85, k === 1 ? "#6b4029" : "#4a2b1c", g);
  }
  const nums = $("numerals");
  for (let h = 0; h < 24; h++) {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    const major = h % 3 === 0;
    const [x, y] = pt(major ? 206 : 210, a);
    const t = el("text", { x: x.toFixed(1), y: (y + (major ? 8 : 5)).toFixed(1), "text-anchor": "middle", class: major ? "num major" : "num" }, nums);
    t.textContent = major ? String(h).padStart(2, "0") : String(h);
    const [a1, b1] = pt(226, a), [a2, b2] = pt(233, a);
    el("line", { x1: a1, y1: b1, x2: a2, y2: b2, class: "tick", "stroke-width": major ? 3 : 1.6 }, nums);
    for (let q = 1; q < 4; q++) {
      const aq = a + (q / 4) * (2 * Math.PI / 24);
      const [c1, d1] = pt(229, aq), [c2, d2] = pt(233, aq);
      el("line", { x1: c1, y1: d1, x2: c2, y2: d2, class: "tick", "stroke-width": 1 }, nums);
    }
  }
  // pine cones
  document.querySelectorAll(".cone").forEach((g) => {
    for (let row = 0; row < 7; row++) {
      const w = 20 - Math.abs(row - 2.4) * 3.2;
      for (let k = -1; k <= 1; k++) el("ellipse", { cx: k * w * 0.7, cy: 14 + row * 11, rx: Math.max(4, w * 0.45), ry: 7, fill: (row + k) % 2 ? "#9a6a3c" : "#7a5230", stroke: "#1b0f0a", "stroke-width": 1.2 }, g);
    }
    el("rect", { x: -5, y: 0, width: 10, height: 8, fill: "#5a3522" }, g);
  });
}

// ---------- state
let samples = [], current = null, wfIdx = 0, anim = 0, popQueue = [], popping = false;

function cuckoo(label) {
  if (reduce) return;
  popQueue.push(label);
  if (popping) return;
  const next = () => {
    const l = popQueue.shift();
    if (l === undefined) { popping = false; return; }
    popping = true;
    $("house").classList.add("open");
    const call = $("call");
    call.textContent = l;
    call.classList.add("on");
    setTimeout(() => { $("house").classList.remove("open"); call.classList.remove("on"); setTimeout(next, 120); }, 520);
    if (popQueue.length > 3) popQueue.splice(0, popQueue.length - 3);
  };
  next();
}

function setWeights(st) {
  const f = (ms) => (ms == null ? 0 : Math.min(1, Math.log(1 + ms / MIN) / Math.log(1 + 720)));
  const set = (id, ms, label) => {
    const g = $(id), y = 30 + 250 * f(ms);
    g.querySelector(".chain").setAttribute("y2", y);
    g.querySelector(".cone").setAttribute("transform", `translate(${id === "w-med" ? 300 : 500} ${y})`);
    const t = g.querySelector(".wlabel");
    t.setAttribute("y", y + 50);
    t.textContent = ms == null ? "" : `${label} ${fmtDur(ms)}`;
  };
  set("w-med", st.lagMedian, "median");
  set("w-p90", st.lagP90, "p90");
}

function verdictClass(v) { return v === "ON TIME" ? "ontime" : v === "LATE" ? "late" : v === "NO DATA" ? "" : "bad"; }

function render(report, idx = 0, animate = !reduce) {
  cancelAnimationFrame(anim);
  current = report; wfIdx = idx;
  const w = report.workflows[idx];
  const rings = $("rings"), arcs = $("arcs"), pegs = $("pegs");
  rings.replaceChildren(); arcs.replaceChildren(); pegs.replaceChildren();
  $("tally").replaceChildren(); $("why").replaceChildren();
  const wfs = $("wfs");
  wfs.replaceChildren();
  wfs.hidden = report.workflows.length < 2;
  report.workflows.forEach((x, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = x.file; b.setAttribute("aria-pressed", String(i === idx));
    b.onclick = () => render(report, i);
    wfs.appendChild(b);
  });
  if (!w) {
    $("verdict").innerHTML = `<span class="v-word">quiet</span> <span class="v-line">no scheduled workflows in ${report.repo}</span>`;
    $("stats").textContent = "";
    setWeights({});
    return;
  }
  const from = Date.parse(report.from), now = Date.parse(report.now);
  const day0 = Math.floor(from / DAY) * DAY;
  const nDays = Math.max(1, Math.ceil((now - day0) / DAY));
  const rIn = 64, rOut = 178;
  const rOf = (t) => (nDays === 1 ? (rIn + rOut) / 2 : rIn + (Math.floor((t - day0) / DAY) * (rOut - rIn)) / (nDays - 1));
  for (let d = 0; d < nDays; d++) el("circle", { cx: CX, cy: CY, r: rOf(day0 + d * DAY), class: "ring" }, rings);

  const slots = w.slots.map(([at, code, lag, url]) => ({ at, code, lag, url, r: rOf(at), a: ang(at) }));
  for (const s of slots) {
    s.peg = el("circle", { cx: pt(s.r, s.a)[0], cy: pt(s.r, s.a)[1], r: 3.6, class: "peg", opacity: animate ? 0 : 1 }, pegs);
    if (s.code === "o" || s.code === "l" || s.code === "v" || s.code === "?") s.arc = el("path", { class: "arc", stroke: COLOR[s.code], d: "", "stroke-dasharray": s.code === "?" ? "2 7" : "" }, arcs);
  }

  // headline: the worst real example in this workflow
  const ran = slots.filter((s) => "olv".includes(s.code));
  const worst = ran.reduce((m, s) => (!m || s.lag > m.lag ? s : m), null);
  const missed = slots.find((s) => s.code === "x");
  const got = $("got");
  const setGot = (html) => { got.innerHTML = html; };
  if (worst && worst.lag > 30 * MIN) { $("said").textContent = hhmm(worst.at); setGot(`GitHub ran it at <b>${hhmm(worst.at + worst.lag)}</b>.`); }
  else if (missed) { $("said").textContent = hhmm(missed.at); setGot("GitHub never ran it."); }
  else if (worst) { $("said").textContent = hhmm(worst.at); setGot(`GitHub ran it at <b>${hhmm(worst.at + worst.lag)}</b>.`); }
  const st = w.stats;
  $("verdict").innerHTML = "";
  const vw = document.createElement("span"); vw.className = `v-word ${verdictClass(w.verdict)}`; vw.textContent = w.verdict;
  const vl = document.createElement("span"); vl.className = "v-line"; vl.textContent = `${w.file}: ${w.headline}`;
  $("verdict").append(vw, " ", vl);
  $("stats").textContent = `${w.crons.join(" | ")} · ${st.due} slots · ${st.ran} ran · ${st.missed} missed · within 1h ${st.within1h}/${st.ran}`;
  for (const f of w.findings.slice(0, 5)) {
    const li = document.createElement("li");
    li.innerHTML = `<b>${f.level === "error" ? "✗" : f.level === "warn" ? "!" : "·"}</b> `;
    li.append(f.message);
    if (f.fix) { const fx = document.createElement("span"); fx.className = "fix"; fx.textContent = "→ " + f.fix; li.appendChild(fx); }
    $("why").appendChild(li);
  }
  setWeights(animate ? {} : st);
  const tallySlots = slots.filter((s) => s.code !== "p").slice(-12);
  const addTally = (s) => {
    if (!tallySlots.includes(s) || s.tallied) return;
    s.tallied = true;
    const li = document.createElement("li");
    const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = COLOR[s.code];
    if (s.code === "x") { dot.style.background = "transparent"; dot.style.boxShadow = "inset 0 0 0 2px #b8405e"; }
    const when = document.createElement("span"); when.textContent = `${dayLabel(s.at)} ${hhmm(s.at)} → ${s.code === "x" ? "no run" : s.code === "?" ? "not yet" : hhmm(s.at + s.lag)}`;
    const lag = document.createElement("span"); lag.className = "lag"; lag.textContent = s.code === "x" ? "missed" : s.code === "?" ? `+${fmtDur(s.lag)}…` : `+${fmtDur(s.lag)}`;
    li.append(dot, when, lag);
    $("tally").prepend(li);
    requestAnimationFrame(() => li.classList.add("in"));
  };

  const draw = (T, final) => {
    $("hand").setAttribute("transform", `rotate(${(((T % DAY) / DAY) * 360).toFixed(2)} ${CX} ${CY})`);
    $("dial-day").textContent = final ? `now ${hhmm(now)}` : `${dayLabel(T)} ${hhmm(T)}`;
    for (const s of slots) {
      if (T < s.at) continue;
      if (s.peg.getAttribute("opacity") !== "1") s.peg.setAttribute("opacity", "1");
      if (s.arc) {
        const end = s.code === "?" ? Math.min(T, now) : Math.min(T, s.at + s.lag);
        s.arc.setAttribute("d", arcPath(s.r, s.a, s.a + ((end - s.at) / DAY) * 2 * Math.PI));
        if (s.code !== "?" && T >= s.at + s.lag && !s.marked) {
          s.marked = true;
          const [x, y] = pt(s.r, s.a + (s.lag / DAY) * 2 * Math.PI);
          el("circle", { cx: x, cy: y, r: 5.2, class: "mark" }, pegs);
          if (!final) cuckoo(s.lag > 10 * MIN ? `+${fmtDur(s.lag)}` : "on time");
          addTally(s);
        }
        if (s.code === "?" && final) addTally(s);
      } else if (s.code === "x" && !s.marked && (final || T >= s.at + 45 * MIN)) {
        s.marked = true;
        s.peg.setAttribute("class", "hole" + (final ? "" : " shake"));
        s.peg.setAttribute("r", 5.5);
        addTally(s);
      }
    }
  };
  if (!animate) { draw(now, true); setWeights(st); return; }
  const dur = Math.min(9000, Math.max(3500, nDays * 1000));
  const t0 = performance.now();
  const step = (ts) => {
    const k = Math.min(1, (ts - t0) / dur);
    const T = from + (now - from) * k;
    draw(T, k === 1);
    if (k < 1) anim = requestAnimationFrame(step);
    else setWeights(st);
  };
  anim = requestAnimationFrame(step);
}

// ---------- sample buttons + live check
function sampleButtons() {
  const box = $("samples");
  samples.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = s.repo.split("/")[1].replace("fpgas.online-", "");
    b.title = s.repo; b.setAttribute("aria-pressed", String(i === 0));
    b.onclick = () => { box.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); $("repo").value = s.repo; note(`${s.repo} — recorded from the public API; thread: `, s.source); render(s, 0); };
    box.appendChild(b);
  });
}
function note(text, link, err) {
  const n = $("note"); n.className = "note" + (err ? " err" : ""); n.textContent = text;
  if (link) { const a = document.createElement("a"); a.href = link; a.textContent = link.replace("https://github.com/", ""); n.appendChild(a); }
}
let lib = null;
async function live(repo) {
  const m = repo.trim().replace(/^https?:\/\/github\.com\//, "").match(/^([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/);
  if (!m) { note("Type owner/repo, e.g. robhunter/agentdeals", null, true); return; }
  note(`Asking GitHub about ${m[1]}…`);
  document.querySelectorAll("#samples button").forEach((x) => x.setAttribute("aria-pressed", "false"));
  try {
    lib ??= await Promise.all([import("./cronlag.js"), import("./compact.js")]);
    const [core, { compact }] = lib;
    const gh = new core.GitHub({});
    const snap = await core.collect(gh, m[1], { days: 7 });
    const rep = compact(core.analyze(snap));
    note(`${rep.repo}: live from the GitHub API just now (${gh.calls} requests, no token).`);
    history.replaceState(null, "", `?repo=${encodeURIComponent(rep.repo)}`);
    render(rep, 0);
  } catch (e) {
    note(String(e.message || e), null, true);
  }
}

carve();
$("check").addEventListener("submit", (e) => { e.preventDefault(); live($("repo").value); });
fetch("data/samples.json").then((r) => r.json()).then((d) => {
  samples = d.samples;
  $("gen").textContent = new Date(d.generatedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  sampleButtons();
  const q = new URLSearchParams(location.search).get("repo");
  if (q) { $("repo").value = q; live(q); return; }
  $("repo").value = samples[0].repo;
  note(`${samples[0].repo} — recorded from the public API; thread: `, samples[0].source);
  const qs = new URLSearchParams(location.search);
  render(samples[0], 0, !reduce && !qs.has("static") && !qs.has("og"));
});

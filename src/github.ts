// Tiny GitHub REST client on global fetch: works in Node >= 18 and in browsers.

export interface Run {
  id: number;
  number: number;
  event: string;
  status: string;
  conclusion: string | null;
  created: number;
  started: number | null;
  url: string;
}

export interface RepoInfo {
  fullName: string;
  defaultBranch: string;
  fork: boolean;
  archived: boolean;
  private: boolean;
  pushedAt: number;
  url: string;
}

export interface WorkflowInfo {
  id: number;
  name: string;
  path: string;
  state: string;
  url: string;
}

export class GitHubError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

export interface ClientOptions {
  token?: string;
  apiBase?: string;
  rawBase?: string;
  fetch?: typeof fetch;
  userAgent?: string;
}

export class GitHub {
  private token?: string;
  private api: string;
  private raw: string;
  private f: typeof fetch;
  private ua?: string;
  calls = 0;

  constructor(o: ClientOptions = {}) {
    this.token = o.token || undefined;
    this.api = (o.apiBase ?? "https://api.github.com").replace(/\/$/, "");
    this.raw = (o.rawBase ?? "https://raw.githubusercontent.com").replace(/\/$/, "");
    this.f = o.fetch ?? fetch.bind(globalThis);
    this.ua = o.userAgent;
  }

  get authenticated(): boolean {
    return !!this.token;
  }

  private headers(accept = "application/vnd.github+json"): Record<string, string> {
    const h: Record<string, string> = { Accept: accept, "X-GitHub-Api-Version": "2022-11-28" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (this.ua) h["User-Agent"] = this.ua;
    return h;
  }

  async request(path: string, init: { method?: string; body?: unknown; accept?: string } = {}): Promise<Response> {
    this.calls++;
    const res = await this.f(path.startsWith("http") ? path : this.api + path, {
      method: init.method ?? "GET",
      headers: { ...this.headers(init.accept), ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) {
      let msg = "";
      try {
        msg = ((await res.json()) as { message?: string }).message ?? "";
      } catch {
        /* ignore */
      }
      if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
        const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
        const when = reset ? ` (resets ${new Date(reset).toISOString().slice(11, 16)} UTC)` : "";
        throw new GitHubError(
          `GitHub API rate limit reached${when}. ${this.token ? "" : "Unauthenticated requests get 60/hour — set GITHUB_TOKEN or run `gh auth login`."}`.trim(),
          res.status,
        );
      }
      if (res.status === 404) throw new GitHubError(`not found: ${path.replace(this.api, "")}${this.token ? "" : " (private repo? set GITHUB_TOKEN)"}`, 404);
      throw new GitHubError(`GitHub API ${res.status} on ${path.replace(this.api, "")}: ${msg}`, res.status);
    }
    return res;
  }

  async json<T>(path: string): Promise<T> {
    return (await (await this.request(path)).json()) as T;
  }

  async repo(full: string): Promise<RepoInfo> {
    const r = await this.json<Record<string, any>>(`/repos/${full}`);
    return {
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      fork: !!r.fork,
      archived: !!r.archived,
      private: !!r.private,
      pushedAt: Date.parse(r.pushed_at),
      url: r.html_url,
    };
  }

  async workflows(full: string): Promise<WorkflowInfo[]> {
    const out: WorkflowInfo[] = [];
    for (let page = 1; page <= 10; page++) {
      const r = await this.json<{ workflows: Record<string, any>[]; total_count: number }>(
        `/repos/${full}/actions/workflows?per_page=100&page=${page}`,
      );
      for (const w of r.workflows) out.push({ id: w.id, name: w.name, path: w.path, state: w.state, url: w.html_url });
      if (out.length >= r.total_count || r.workflows.length < 100) break;
    }
    return out;
  }

  async file(full: string, path: string, ref: string): Promise<string> {
    if (!this.token) {
      // Public repos: raw.githubusercontent.com is not rate-limited like the API.
      this.calls++;
      const res = await this.f(`${this.raw}/${full}/${encodeURIComponent(ref)}/${path}`);
      if (res.ok) return await res.text();
    }
    const res = await this.request(`/repos/${full}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
      accept: "application/vnd.github.raw+json",
    });
    return await res.text();
  }

  async runs(full: string, workflowId: number, opts: { event?: string; since: number; maxPages?: number }): Promise<Run[]> {
    const out: Run[] = [];
    const since = new Date(opts.since).toISOString().replace(/\.\d{3}Z$/, "Z");
    for (let page = 1; page <= (opts.maxPages ?? 5); page++) {
      const q = new URLSearchParams({ per_page: "100", page: String(page), created: `>=${since}`, exclude_pull_requests: "true" });
      if (opts.event) q.set("event", opts.event);
      const r = await this.json<{ workflow_runs: Record<string, any>[] }>(
        `/repos/${full}/actions/workflows/${workflowId}/runs?${q}`,
      );
      for (const x of r.workflow_runs) out.push(toRun(x));
      if (r.workflow_runs.length < 100) break;
    }
    return out.sort((a, b) => a.created - b.created);
  }

  async run(full: string, runId: number): Promise<Run> {
    return toRun(await this.json<Record<string, any>>(`/repos/${full}/actions/runs/${runId}`));
  }

  /** Most recent commits touching `path` on `ref`, newest first. */
  async fileHistory(full: string, path: string, ref: string, n = 20): Promise<{ sha: string; date: number }[]> {
    const r = await this.json<Record<string, any>[]>(
      `/repos/${full}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(ref)}&per_page=${n}`,
    );
    return r
      .map((c) => ({ sha: c.sha as string, date: Date.parse(c.commit?.committer?.date ?? c.commit?.author?.date) }))
      .filter((c) => Number.isFinite(c.date));
  }

  async dispatch(full: string, workflowId: number, ref: string): Promise<void> {
    await this.request(`/repos/${full}/actions/workflows/${workflowId}/dispatches`, { method: "POST", body: { ref } });
  }
}

function toRun(x: Record<string, any>): Run {
  return {
    id: x.id,
    number: x.run_number,
    event: x.event,
    status: x.status,
    conclusion: x.conclusion ?? null,
    created: Date.parse(x.created_at),
    started: x.run_started_at ? Date.parse(x.run_started_at) : null,
    url: x.html_url,
  };
}

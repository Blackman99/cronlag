import { execFileSync } from "node:child_process";

export function findToken(explicit?: string): string | undefined {
  if (explicit) return explicit;
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return env;
  try {
    const t = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

export function repoFromGit(cwd = process.cwd()): string | undefined {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?\/?$/);
    return m?.[1];
  } catch {
    return undefined;
  }
}

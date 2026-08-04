import path from "node:path";

import { fingerprintManifest } from "@/core/lifecycle/fingerprint";
import type { SkillFingerprint } from "@/core/lifecycle/types";
import { parseSkillDocument } from "@/core/skills/parse";
import type { ParsedSkill } from "@/core/skills/types";

export interface GitTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

interface ParsedGithubLocation {
  owner: string;
  repo: string;
  ref?: string;
  sourceDirectory?: string;
}

interface GithubTreeResponse {
  sha?: string;
  tree?: GitTreeEntry[];
  truncated?: boolean;
}

export interface GithubSkillSourceSnapshot {
  sourceUrl: string;
  owner: string;
  repo: string;
  repository: string;
  ref: string;
  revision: string;
  sourceDirectory: string;
  entries: GitTreeEntry[];
  parsedSkill: ParsedSkill;
  skillContent: string;
  fingerprint: SkillFingerprint;
  trust: GithubSourceTrust;
}

export interface GithubSourceTrust {
  repositoryOwner: string;
  ownerType?: string;
  licenseSpdx?: string;
  archived?: boolean;
  stars?: number;
  openIssues?: number;
  lastPushedAt?: string;
  latestCommitAt?: string;
  latestCommitAuthor?: string;
  latestCommitMessage?: string;
  activity: "active" | "quiet" | "stale" | "unknown";
  versionSummary: string;
  lock: {
    repository: string;
    ref: string;
    revision: string;
    fingerprint: string;
  };
}

interface GithubSourceOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  fetcher?: typeof fetch;
}

function githubHeaders(env: Readonly<Partial<NodeJS.ProcessEnv>>): HeadersInit {
  const token = env.GITHUB_TOKEN?.trim();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "skill-atlas-local",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function parseGithubSkillUrl(sourceUrl: string): ParsedGithubLocation {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("请输入有效的 GitHub HTTPS 地址。");
  }
  if (url.protocol !== "https:" || url.hostname.toLocaleLowerCase() !== "github.com") {
    throw new Error("当前仅支持 github.com 上的 HTTPS 源。");
  }
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segments.length < 2) throw new Error("GitHub 地址缺少 owner/repository。");
  const [owner, rawRepo] = segments;
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new Error("GitHub owner 或 repository 格式无效。");
  }
  if (segments[2] && segments[2] !== "tree") {
    throw new Error("请提供仓库首页或包含 /tree/<ref>/ 的 Skill 目录地址。");
  }
  const ref = segments[2] === "tree" ? segments[3] : undefined;
  const sourceDirectory = segments[2] === "tree" ? segments.slice(4).join("/") : undefined;
  if (sourceDirectory) validateRelativePath(sourceDirectory);
  return { owner, repo, ref, sourceDirectory };
}

export function validateRelativePath(relativePath: string): void {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (
    !normalized
    || normalized === "."
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`检测到不安全的相对路径：${relativePath}`);
  }
  if (normalized.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error(`检测到路径穿越片段：${relativePath}`);
  }
}

async function githubJson<T>(
  url: string,
  env: Readonly<Partial<NodeJS.ProcessEnv>>,
  fetcher: typeof fetch,
): Promise<T> {
  const response = await fetcher(url, {
    headers: githubHeaders(env),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub API 请求失败（HTTP ${response.status}）。`);
  return (await response.json()) as T;
}

async function githubJsonOptional<T>(
  url: string,
  env: Readonly<Partial<NodeJS.ProcessEnv>>,
  fetcher: typeof fetch,
): Promise<T | undefined> {
  try { return await githubJson<T>(url, env, fetcher); } catch { return undefined; }
}

export async function fetchGithubBlob(
  entry: GitTreeEntry,
  options: GithubSourceOptions = {},
): Promise<Buffer> {
  if (!entry.url.startsWith("https://api.github.com/repos/")) {
    throw new Error("GitHub 返回了不受信任的文件地址。");
  }
  const env = options.env || process.env;
  const fetcher = options.fetcher || fetch;
  const payload = await githubJson<{ content?: string; encoding?: string }>(entry.url, env, fetcher);
  if (!payload.content || payload.encoding !== "base64") {
    throw new Error(`GitHub 文件内容格式异常：${entry.path}`);
  }
  const data = Buffer.from(payload.content.replaceAll("\n", ""), "base64");
  if (entry.size !== undefined && data.byteLength !== entry.size) {
    throw new Error(`文件大小校验失败：${entry.path}`);
  }
  return data;
}

export async function inspectGithubSkillSource(
  input: { sourceUrl: string; skillName?: string },
  options: GithubSourceOptions = {},
): Promise<GithubSkillSourceSnapshot> {
  const env = options.env || process.env;
  const fetcher = options.fetcher || fetch;
  const sourceUrl = input.sourceUrl.trim();
  const location = parseGithubSkillUrl(sourceUrl);
  const repositoryMetadataPromise = githubJsonOptional<{
    owner?: { login?: string; type?: string };
    license?: { spdx_id?: string } | null;
    archived?: boolean;
    stargazers_count?: number;
    open_issues_count?: number;
    pushed_at?: string;
    default_branch?: string;
  }>(`https://api.github.com/repos/${location.owner}/${location.repo}`, env, fetcher);
  let ref = location.ref;
  if (!ref) {
    const repository = await githubJson<{ default_branch?: string }>(
      `https://api.github.com/repos/${location.owner}/${location.repo}`,
      env,
      fetcher,
    );
    ref = repository.default_branch || "main";
  }

  const tree = await githubJson<GithubTreeResponse>(
    `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    env,
    fetcher,
  );
  if (tree.truncated) throw new Error("GitHub 文件树过大且已被截断，无法安全审查。");
  if (!tree.sha) throw new Error("GitHub 文件树缺少版本摘要。");
  const allEntries = tree.tree || [];
  const requestedName = input.skillName?.trim();
  let sourceDirectory = location.sourceDirectory;

  if (!sourceDirectory) {
    const skillFiles = allEntries.filter(
      (entry) => entry.type === "blob" && path.posix.basename(entry.path).toLocaleLowerCase() === "skill.md",
    );
    const matching = requestedName
      ? skillFiles.filter(
          (entry) => path.posix.basename(path.posix.dirname(entry.path)).toLocaleLowerCase() === requestedName.toLocaleLowerCase(),
        )
      : skillFiles.filter((entry) => entry.path === "SKILL.md");
    if (matching.length !== 1) {
      throw new Error(
        requestedName
          ? `仓库中未找到唯一的 ${requestedName}/SKILL.md，请提供精确的 /tree/<ref>/<skill-directory> 地址。`
          : "仓库根目录没有唯一 SKILL.md，请同时提供 Skill 名称或精确目录地址。",
      );
    }
    sourceDirectory = path.posix.dirname(matching[0].path);
    if (sourceDirectory === ".") sourceDirectory = "";
  }

  const prefix = sourceDirectory ? `${sourceDirectory.replace(/\/$/, "")}/` : "";
  const entries = allEntries
    .filter((entry) => entry.path.startsWith(prefix) && entry.type !== "tree")
    .map((entry) => ({ ...entry, path: entry.path.slice(prefix.length) }));
  const skillEntry = entries.find(
    (entry) => entry.path.toLocaleLowerCase() === "skill.md" && entry.type === "blob",
  );
  if (!skillEntry) throw new Error("所选目录不包含 SKILL.md。");
  for (const entry of entries) {
    validateRelativePath(entry.path);
    if (!entry.sha) throw new Error(`GitHub 文件条目缺少摘要：${entry.path}`);
  }

  const skillContent = (await fetchGithubBlob(skillEntry, { env, fetcher })).toString("utf8");
  const parsedSkill = parseSkillDocument(
    skillContent,
    sourceDirectory ? path.posix.basename(sourceDirectory) : location.repo,
  );
  const blobEntries = entries.filter((entry) => entry.type === "blob");
  const fingerprint = fingerprintManifest(blobEntries.map((entry) => ({
    path: entry.path,
    size: entry.size || 0,
    gitBlobSha: entry.sha,
  })));
  const [repositoryMetadata, commits] = await Promise.all([
    repositoryMetadataPromise,
    githubJsonOptional<Array<{
      commit?: { author?: { name?: string; date?: string }; committer?: { date?: string }; message?: string };
      author?: { login?: string } | null;
    }>>(`https://api.github.com/repos/${location.owner}/${location.repo}/commits?sha=${encodeURIComponent(ref)}&path=${encodeURIComponent(sourceDirectory || "")}&per_page=1`, env, fetcher),
  ]);
  const latest = commits?.[0];
  const latestCommitAt = latest?.commit?.committer?.date || latest?.commit?.author?.date;
  const activityDate = Date.parse(latestCommitAt || repositoryMetadata?.pushed_at || "");
  const ageDays = Number.isFinite(activityDate) ? (Date.now() - activityDate) / 86_400_000 : Number.NaN;
  const activity: GithubSourceTrust["activity"] = !Number.isFinite(ageDays)
    ? "unknown"
    : ageDays <= 120 ? "active" : ageDays <= 365 ? "quiet" : "stale";
  const licenseSpdx = repositoryMetadata?.license?.spdx_id && repositoryMetadata.license.spdx_id !== "NOASSERTION"
    ? repositoryMetadata.license.spdx_id
    : undefined;
  const trust: GithubSourceTrust = {
    repositoryOwner: repositoryMetadata?.owner?.login || location.owner,
    ownerType: repositoryMetadata?.owner?.type,
    licenseSpdx,
    archived: repositoryMetadata?.archived,
    stars: repositoryMetadata?.stargazers_count,
    openIssues: repositoryMetadata?.open_issues_count,
    lastPushedAt: repositoryMetadata?.pushed_at,
    latestCommitAt,
    latestCommitAuthor: latest?.author?.login || latest?.commit?.author?.name,
    latestCommitMessage: latest?.commit?.message?.split("\n")[0]?.slice(0, 240),
    activity,
    versionSummary: `${tree.sha.slice(0, 12)} · ${blobEntries.length} files${latestCommitAt ? ` · ${latestCommitAt.slice(0, 10)}` : ""}`,
    lock: { repository: `${location.owner}/${location.repo}`, ref, revision: tree.sha, fingerprint: fingerprint.value },
  };

  return {
    sourceUrl,
    owner: location.owner,
    repo: location.repo,
    repository: `${location.owner}/${location.repo}`,
    ref,
    revision: tree.sha,
    sourceDirectory: sourceDirectory || "/",
    entries,
    parsedSkill,
    skillContent,
    fingerprint,
    trust,
  };
}

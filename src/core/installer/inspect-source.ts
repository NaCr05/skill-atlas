import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { parseSkillDocument } from "../skills/parse";
import { isPathInside, resolvePersonalSkillsRoot } from "../skills/paths";
import type {
  GitTreeEntry,
  InstallationReview,
  InstallRisk,
  InternalInstallPlan,
} from "./types";

const MAX_FILES = 500;
const MAX_BYTES = 20 * 1024 * 1024;
const EXECUTABLE_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".exe",
  ".js",
  ".mjs",
  ".msi",
  ".ps1",
  ".py",
  ".sh",
]);

interface ParsedGithubLocation {
  owner: string;
  repo: string;
  ref?: string;
  sourceDirectory?: string;
}

interface GithubTreeResponse {
  tree?: GitTreeEntry[];
  truncated?: boolean;
}

const globalPlans = globalThis as typeof globalThis & {
  __skillAtlasInstallPlans?: Map<string, InternalInstallPlan>;
};

export const installationPlans =
  globalPlans.__skillAtlasInstallPlans || new Map<string, InternalInstallPlan>();
globalPlans.__skillAtlasInstallPlans = installationPlans;

function githubHeaders(env: Readonly<Partial<NodeJS.ProcessEnv>>): HeadersInit {
  const token = env.GITHUB_TOKEN?.trim();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "codex-skill-dashboard-local",
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
    throw new Error("MVP 仅支持 github.com 上的公开 HTTPS 源。");
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
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    path.posix.isAbsolute(normalized)
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
  if (!response.ok) {
    throw new Error(`GitHub API 请求失败（HTTP ${response.status}）。`);
  }
  return (await response.json()) as T;
}

async function blobText(
  entry: GitTreeEntry,
  env: Readonly<Partial<NodeJS.ProcessEnv>>,
  fetcher: typeof fetch,
): Promise<string> {
  if (!entry.url.startsWith("https://api.github.com/repos/")) {
    throw new Error("GitHub 返回了不受信任的文件地址。");
  }
  const payload = await githubJson<{ content?: string; encoding?: string }>(
    entry.url,
    env,
    fetcher,
  );
  if (!payload.content || payload.encoding !== "base64") {
    throw new Error("无法读取远程 SKILL.md。" );
  }
  return Buffer.from(payload.content.replaceAll("\n", ""), "base64").toString("utf8");
}

function safeSkillName(name: string): string {
  const clean = name.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(clean) || clean === ".system") {
    throw new Error(`Skill 名称不适合作为安装目录：${name}`);
  }
  return clean;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function inspectGithubSkill(
  input: { sourceUrl: string; skillName?: string },
  options?: {
    env?: Readonly<Partial<NodeJS.ProcessEnv>>;
    homeDirectory?: string;
    fetcher?: typeof fetch;
    now?: Date;
  },
): Promise<InstallationReview> {
  const env = options?.env || process.env;
  const fetcher = options?.fetcher || fetch;
  const location = parseGithubSkillUrl(input.sourceUrl.trim());
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
  const allEntries = tree.tree || [];
  const requestedName = input.skillName?.trim();
  let sourceDirectory = location.sourceDirectory;

  if (!sourceDirectory) {
    const skillFiles = allEntries.filter(
      (entry) =>
        entry.type === "blob" &&
        path.posix.basename(entry.path).toLocaleLowerCase() === "skill.md",
    );
    const matching = requestedName
      ? skillFiles.filter(
          (entry) =>
            path.posix.basename(path.posix.dirname(entry.path)).toLocaleLowerCase() ===
            requestedName.toLocaleLowerCase(),
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
  const entries = allEntries.filter(
    (entry) => entry.path.startsWith(prefix) && entry.type !== "tree",
  );
  const relativeEntries = entries.map((entry) => ({
    ...entry,
    path: entry.path.slice(prefix.length),
  }));
  const skillEntry = relativeEntries.find(
    (entry) => entry.path.toLocaleLowerCase() === "skill.md" && entry.type === "blob",
  );
  if (!skillEntry) throw new Error("所选目录不包含 SKILL.md。");
  for (const entry of relativeEntries) validateRelativePath(entry.path);

  const skillContent = await blobText(skillEntry, env, fetcher);
  const parsed = parseSkillDocument(
    skillContent,
    sourceDirectory ? path.posix.basename(sourceDirectory) : location.repo,
  );
  const skillName = safeSkillName(requestedName || parsed.name);
  const skillsRoot = resolvePersonalSkillsRoot(env, options?.homeDirectory);
  const targetDirectory = path.resolve(skillsRoot, skillName);
  if (!isPathInside(skillsRoot, targetDirectory)) {
    throw new Error("目标目录超出 CODEX_HOME/skills。" );
  }

  const totalBytes = relativeEntries.reduce((sum, entry) => sum + (entry.size || 0), 0);
  const scripts = relativeEntries.filter((entry) =>
    EXECUTABLE_EXTENSIONS.has(path.extname(entry.path).toLocaleLowerCase()),
  );
  const unsupported = relativeEntries.filter(
    (entry) => entry.type === "commit" || entry.mode === "120000" || entry.mode === "160000",
  );
  const risks: InstallRisk[] = [
    {
      level: "info",
      title: "来源边界",
      detail: `将从 github.com/${location.owner}/${location.repo} 的 ${ref} 引用读取 ${relativeEntries.length} 个文件。`,
    },
  ];
  if (scripts.length) {
    risks.push({
      level: "review",
      title: `包含 ${scripts.length} 个可执行脚本`,
      detail: scripts.slice(0, 8).map((entry) => entry.path).join("、"),
    });
  }
  if (!parsed.metadataValid) {
    risks.push({
      level: "review",
      title: "Skill 元数据需要复核",
      detail: parsed.issues.join("；"),
    });
  }
  if (relativeEntries.length > MAX_FILES || totalBytes > MAX_BYTES) {
    risks.push({
      level: "blocked",
      title: "目录超过 MVP 安全上限",
      detail: `上限为 ${MAX_FILES} 个文件和 20 MB；当前为 ${relativeEntries.length} 个文件、${totalBytes} 字节。`,
    });
  }
  if (unsupported.length) {
    risks.push({
      level: "blocked",
      title: "包含链接或子模块",
      detail: unsupported.map((entry) => entry.path).join("、"),
    });
  }
  if (await pathExists(targetDirectory)) {
    risks.push({
      level: "blocked",
      title: "目标目录已存在",
      detail: "MVP 不覆盖或更新现有 Skill，请先保留原目录并改用新的名称/来源。",
    });
  }

  const now = options?.now || new Date();
  const planId = randomUUID();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const plan: InternalInstallPlan = {
    planId,
    expiresAt,
    sourceUrl: input.sourceUrl.trim(),
    repository: `${location.owner}/${location.repo}`,
    ref,
    sourceDirectory: sourceDirectory || "/",
    skillName,
    description: parsed.description,
    targetDirectory,
    files: relativeEntries.map((entry) => ({ path: entry.path, size: entry.size || 0 })),
    totalBytes,
    risks,
    installAllowed: !risks.some((risk) => risk.level === "blocked"),
    owner: location.owner,
    repo: location.repo,
    entries: relativeEntries,
  };
  installationPlans.set(planId, plan);
  const { owner: _owner, repo: _repo, entries: _entries, ...review } = plan;
  void _owner;
  void _repo;
  void _entries;
  return review;
}

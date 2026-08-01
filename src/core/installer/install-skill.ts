import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { isPathInside, resolvePersonalSkillsRoot } from "../skills/paths";
import { installationPlans, validateRelativePath } from "./inspect-source";
import type { GitTreeEntry, InstallationResult } from "./types";

function githubHeaders(env: Readonly<Partial<NodeJS.ProcessEnv>>): HeadersInit {
  const token = env.GITHUB_TOKEN?.trim();
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "codex-skill-dashboard-local",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchBlob(
  entry: GitTreeEntry,
  env: Readonly<Partial<NodeJS.ProcessEnv>>,
  fetcher: typeof fetch,
): Promise<Buffer> {
  if (!entry.url.startsWith("https://api.github.com/repos/")) {
    throw new Error("GitHub 返回了不受信任的文件地址。");
  }
  const response = await fetcher(entry.url, {
    headers: githubHeaders(env),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`文件下载失败（HTTP ${response.status}）：${entry.path}`);
  const payload = (await response.json()) as { content?: string; encoding?: string };
  if (!payload.content || payload.encoding !== "base64") {
    throw new Error(`GitHub 文件内容格式异常：${entry.path}`);
  }
  const data = Buffer.from(payload.content.replaceAll("\n", ""), "base64");
  if (entry.size !== undefined && data.byteLength !== entry.size) {
    throw new Error(`文件大小校验失败：${entry.path}`);
  }
  return data;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function confirmInstallation(
  planId: string,
  options?: {
    env?: Readonly<Partial<NodeJS.ProcessEnv>>;
    homeDirectory?: string;
    fetcher?: typeof fetch;
    now?: Date;
  },
): Promise<InstallationResult> {
  const plan = installationPlans.get(planId);
  if (!plan) throw new Error("安装审查单不存在或已被使用，请重新审查。" );
  installationPlans.delete(planId);
  if (!plan.installAllowed) throw new Error("此安装审查包含阻断风险。" );
  const now = options?.now || new Date();
  if (new Date(plan.expiresAt).getTime() < now.getTime()) {
    throw new Error("安装审查已过期，请重新检查源文件。" );
  }

  const env = options?.env || process.env;
  const fetcher = options?.fetcher || fetch;
  const skillsRoot = resolvePersonalSkillsRoot(env, options?.homeDirectory);
  const targetDirectory = path.resolve(plan.targetDirectory);
  if (!isPathInside(skillsRoot, targetDirectory)) {
    throw new Error("目标目录不在当前 CODEX_HOME/skills 内。" );
  }
  if (await exists(targetDirectory)) {
    throw new Error("目标目录在确认后被创建，已停止安装以避免覆盖。" );
  }
  await mkdir(skillsRoot, { recursive: true });
  const stagingDirectory = path.join(skillsRoot, `.install-${plan.planId}`);
  if (!isPathInside(skillsRoot, stagingDirectory)) throw new Error("暂存目录无效。" );

  try {
    await mkdir(stagingDirectory, { recursive: false });
    for (const entry of plan.entries) {
      if (entry.type !== "blob") throw new Error(`不支持的 Git 项类型：${entry.path}`);
      validateRelativePath(entry.path);
      const destination = path.resolve(stagingDirectory, ...entry.path.split("/"));
      if (!isPathInside(stagingDirectory, destination)) {
        throw new Error(`文件路径越过暂存目录：${entry.path}`);
      }
      const data = await fetchBlob(entry, env, fetcher);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, data, { flag: "wx" });
    }
    const installedSkill = path.join(stagingDirectory, "SKILL.md");
    const skillContents = await readFile(installedSkill, "utf8");
    if (!skillContents.trim()) throw new Error("下载后的 SKILL.md 为空。" );
    await rename(stagingDirectory, targetDirectory);
  } catch (error) {
    if (isPathInside(skillsRoot, stagingDirectory)) {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    throw error;
  }

  return {
    skillName: plan.skillName,
    targetDirectory,
    fileCount: plan.files.length,
    totalBytes: plan.totalBytes,
    verifiedFiles: plan.files.map((file) => file.path),
  };
}

import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { inspectGithubSkillSource } from "@/core/github/skill-source";
import { isPathInside, resolvePersonalSkillsRoot } from "@/core/skills/paths";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import type { InstallationReview, InstallRisk, InternalInstallPlan } from "./types";
import { evaluateSourcePolicy, loadSourcePolicy } from "@/core/source-policy/source-policy";

export { parseGithubSkillUrl, validateRelativePath } from "@/core/github/skill-source";

const MAX_FILES = 500;
const MAX_BYTES = 20 * 1024 * 1024;
const EXECUTABLE_EXTENSIONS = new Set([
  ".bat", ".cmd", ".com", ".exe", ".js", ".mjs", ".msi", ".ps1", ".py", ".sh",
]);

export const installationPlans = getReviewPlanStore<InternalInstallPlan>("installation");

function safeSkillName(name: string): string {
  const clean = name.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(clean) || clean === ".system") {
    throw new SkillAtlasError("INSTALL_SOURCE_INVALID");
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
  const snapshot = await inspectGithubSkillSource(input, { env, fetcher: options?.fetcher });
  const requestedName = input.skillName?.trim();
  const skillName = safeSkillName(requestedName || snapshot.parsedSkill.name);
  const skillsRoot = resolvePersonalSkillsRoot(env, options?.homeDirectory);
  const targetDirectory = path.resolve(skillsRoot, skillName);
  if (!isPathInside(skillsRoot, targetDirectory)) throw new SkillAtlasError("INSTALL_SOURCE_INVALID");

  const totalBytes = snapshot.entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
  const scripts = snapshot.entries.filter((entry) =>
    EXECUTABLE_EXTENSIONS.has(path.extname(entry.path).toLocaleLowerCase()),
  );
  const unsupported = snapshot.entries.filter(
    (entry) => entry.type === "commit" || entry.mode === "120000" || entry.mode === "160000",
  );
  const sourcePolicy = evaluateSourcePolicy(snapshot.trust, await loadSourcePolicy(options));
  const risks: InstallRisk[] = [{
    level: "info",
    title: "来源边界",
    detail: `将从 github.com/${snapshot.repository} 的 ${snapshot.ref} 引用读取 ${snapshot.entries.length} 个文件。`,
  }];
  if (snapshot.trust.activity === "stale") {
    risks.push({ level: "review", title: "仓库活跃度较低", detail: "最近可见提交或推送已超过一年，请确认此 Skill 仍适合当前 Codex 版本。" });
  }
  if (!snapshot.trust.licenseSpdx) {
    risks.push({ level: "review", title: "未识别到明确许可证", detail: "GitHub 仓库没有返回可识别的 SPDX 许可证；安装前请检查使用和再分发条件。" });
  }
  if (scripts.length) {
    risks.push({
      level: "review",
      title: `包含 ${scripts.length} 个可执行脚本`,
      detail: scripts.slice(0, 8).map((entry) => entry.path).join("、"),
    });
  }
  if (!snapshot.parsedSkill.metadataValid) {
    risks.push({
      level: "review",
      title: "Skill 元数据需要复核",
      detail: snapshot.parsedSkill.issues.join("；"),
    });
  }
  if (snapshot.entries.length > MAX_FILES || totalBytes > MAX_BYTES) {
    risks.push({
      level: "blocked",
      title: "目录超过安全上限",
      detail: `上限为 ${MAX_FILES} 个文件和 20 MB；当前为 ${snapshot.entries.length} 个文件、${totalBytes} 字节。`,
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
      detail: "当前安装流程不覆盖或更新现有 Skill，请改用更新预览功能。",
    });
  }
  risks.push(...sourcePolicy.risks);

  const now = options?.now || new Date();
  const planId = randomUUID();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const plan: InternalInstallPlan = {
    planId,
    expiresAt,
    sourceUrl: snapshot.sourceUrl,
    repository: snapshot.repository,
    ref: snapshot.ref,
    revision: snapshot.revision,
    fingerprint: snapshot.fingerprint,
    sourceDirectory: snapshot.sourceDirectory,
    skillName,
    description: snapshot.parsedSkill.description,
    targetDirectory,
    files: snapshot.entries.map((entry) => ({ path: entry.path, size: entry.size || 0 })),
    totalBytes,
    risks,
    installAllowed: !risks.some((risk) => risk.level === "blocked"),
    sourceTrust: snapshot.trust,
    sourcePolicy,
    owner: snapshot.owner,
    repo: snapshot.repo,
    entries: snapshot.entries,
  };
  installationPlans.put(planId, plan, now);
  const { owner: _owner, repo: _repo, entries: _entries, ...review } = plan;
  void _owner;
  void _repo;
  void _entries;
  return review;
}

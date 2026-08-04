import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { fetchGithubBlob } from "@/core/github/skill-source";
import { snapshotLocalSkill } from "@/core/lifecycle/fingerprint";
import { recordTrackedSource, skillDirectoryKey } from "@/core/lifecycle/source-registry";
import { isPathInside, resolvePersonalSkillsRoot } from "../skills/paths";
import { installationPlans, validateRelativePath } from "./inspect-source";
import type { InstallationResult } from "./types";

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
  const now = options?.now || new Date();
  const consumed = installationPlans.consume(planId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("INSTALL_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("INSTALL_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (!plan.installAllowed) throw new SkillAtlasError("INSTALL_BLOCKED");

  const env = options?.env || process.env;
  const fetcher = options?.fetcher || fetch;
  const skillsRoot = resolvePersonalSkillsRoot(env, options?.homeDirectory);
  const targetDirectory = path.resolve(plan.targetDirectory);
  if (!isPathInside(skillsRoot, targetDirectory)) {
    throw new SkillAtlasError("INSTALL_STATE_CHANGED");
  }
  if (await exists(targetDirectory)) {
    throw new SkillAtlasError("INSTALL_STATE_CHANGED");
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
      const data = await fetchGithubBlob(entry, { env, fetcher });
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, data, { flag: "wx" });
    }
    const installedSkill = path.join(stagingDirectory, "SKILL.md");
    const skillContents = await readFile(installedSkill, "utf8");
    if (!skillContents.trim()) throw new Error("下载后的 SKILL.md 为空。" );
    const stagedSnapshot = await snapshotLocalSkill(stagingDirectory, { maxFiles: 500 });
    if (!stagedSnapshot.fingerprint.complete || stagedSnapshot.fingerprint.value !== plan.fingerprint.value) {
      throw new Error("下载后的文件指纹与安装审查不一致。" );
    }
    await rename(stagingDirectory, targetDirectory);
  } catch (error) {
    if (isPathInside(skillsRoot, stagingDirectory)) {
      await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
    throw error;
  }

  let sourceTracking: InstallationResult["sourceTracking"] = "recorded";
  try {
    await recordTrackedSource({
      skillDirectory: skillDirectoryKey(targetDirectory, { env, homeDirectory: options?.homeDirectory }),
      sourceUrl: plan.sourceUrl,
      repository: plan.repository,
      ref: plan.ref,
      sourceDirectory: plan.sourceDirectory,
      revision: plan.revision,
      upstreamFingerprint: plan.fingerprint.value,
      localFingerprint: plan.fingerprint.value,
      trackedAt: now.toISOString(),
      sourceTrust: plan.sourceTrust,
      policyStatus: plan.sourcePolicy.blocked ? "blocked" : plan.sourcePolicy.trusted ? "trusted" : "unlisted",
    }, { env, homeDirectory: options?.homeDirectory });
  } catch {
    sourceTracking = "failed";
  }

  return {
    skillName: plan.skillName,
    targetDirectory,
    fileCount: plan.files.length,
    totalBytes: plan.totalBytes,
    verifiedFiles: plan.files.map((file) => file.path),
    sourceTracking,
  };
}

import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { discoverSkills } from "@/core/skills/discover";
import type { SkillRecord } from "@/core/skills/types";
import {
  recordTrackedSource,
  removeTrackedSource,
  skillDirectoryKey,
} from "./source-registry";
import {
  assertManageableSkillDirectory,
  MAX_TRASH_FILES,
  pathExists,
  resolveTrashRoot,
  resolveTrashTransactionWriter,
  sameTrashPath,
  snapshotTrashSkill,
  writeTrashManifest,
  type SkillTrashOptions,
} from "./skill-trash-store";
import { withLifecycleLock } from "./transaction-store";
import type {
  InternalSkillRemovalPlan,
  LifecycleTransaction,
  SkillRemovalResult,
  SkillRemovalReview,
  TrashedSkillRecord,
} from "./types";

const PLAN_TTL_MS = 10 * 60_000;

export const removalPlans = getReviewPlanStore<InternalSkillRemovalPlan>("skill-removal");

function dependentSkillsAfterRemoval(
  skills: SkillRecord[],
  removed: SkillRecord,
): SkillRemovalReview["hardDependents"] {
  const remainingNames = new Set(
    skills
      .filter((skill) => skill.id !== removed.id)
      .map((skill) => skill.name.toLocaleLowerCase()),
  );
  const removedName = removed.name.toLocaleLowerCase();
  if (remainingNames.has(removedName)) return [];
  return skills
    .filter(
      (skill) =>
        skill.id !== removed.id &&
        skill.dependencies.some(
          (dependency) => dependency.toLocaleLowerCase() === removedName,
        ),
    )
    .map(({ id, name, displayName }) => ({ id, name, displayName }));
}

function instructionReferencesAfterRemoval(
  skills: SkillRecord[],
  removed: SkillRecord,
): SkillRemovalReview["instructionReferences"] {
  const removedName = removed.name.toLocaleLowerCase();
  const replacementExists = skills.some(
    (skill) =>
      skill.id !== removed.id &&
      skill.name.toLocaleLowerCase() === removedName,
  );
  if (replacementExists) return [];
  return skills
    .filter(
      (skill) =>
        skill.id !== removed.id &&
        skill.referencedSkills.some(
          (reference) => reference.toLocaleLowerCase() === removedName,
        ),
    )
    .map(({ id, name, displayName }) => ({ id, name, displayName }));
}

export async function inspectSkillRemoval(
  input: { skillId: string },
  options: SkillTrashOptions = {},
): Promise<SkillRemovalReview> {
  const inventory = await discoverSkills({
    env: options.env,
    homeDirectory: options.homeDirectory,
    forceRefresh: true,
  });
  const skill = inventory.skills.find((entry) => entry.id === input.skillId);
  if (!skill) throw new Error("未找到要移入回收站的 Skill，请重新扫描。");
  if (skill.source.kind !== "personal" || skill.source.permission !== "manage") {
    throw new Error("只有个人 Codex Skills 可以从 Skill Atlas 移入回收站。");
  }
  const directoryPath = await assertManageableSkillDirectory(skill.directoryPath, options);
  const snapshot = await snapshotTrashSkill(directoryPath);
  const hardDependents = dependentSkillsAfterRemoval(inventory.skills, skill);
  const instructionReferences = instructionReferencesAfterRemoval(inventory.skills, skill);
  const risks: SkillRemovalReview["risks"] = [
    {
      level: "info",
      code: "personal-skill",
      title: "个人可管理 Skill",
      detail: "只会停用这个个人目录，不会修改系统、插件或共享目录。",
    },
    {
      level: "info",
      code: "complete-backup",
      title: "完整目录将保留在 Skill Atlas 回收站",
      detail: `${snapshot.fingerprint.fileCount} 个文件，共 ${snapshot.fingerprint.totalBytes} 字节；可以恢复到原目录。`,
    },
  ];
  if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length) {
    risks.push({
      level: "blocked",
      code: "unsupported-path",
      title: "目录无法生成完整安全快照",
      detail: snapshot.unsupportedPaths.length
        ? "发现链接或不支持的路径：" + snapshot.unsupportedPaths.slice(0, 8).join("、")
        : "文件数量超过当前安全上限 " + String(MAX_TRASH_FILES) + "。",
    });
  }
  if (hardDependents.length) {
    risks.push({
      level: "blocked",
      code: "hard-dependents",
      title: "其他 Skill 仍将它声明为必需依赖",
      detail: hardDependents.map((entry) => entry.displayName).join("、"),
    });
  }
  if (instructionReferences.length) {
    risks.push({
      level: "review",
      code: "instruction-references",
      title: "其他 Skill 的正文仍引用它",
      detail: instructionReferences.map((entry) => entry.displayName).join("、"),
    });
  }

  const now = options.now || new Date();
  const planId = (options.idFactory || randomUUID)();
  const plan: InternalSkillRemovalPlan = {
    planId,
    expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(),
    skillId: skill.id,
    skillName: skill.name,
    displayName: skill.displayName,
    directoryPath,
    directoryKey: skillDirectoryKey(directoryPath, options),
    fingerprint: snapshot.fingerprint,
    hardDependents,
    instructionReferences,
    sourceTracking: skill.sourceTracking,
    risks,
    removalAllowed: !risks.some((risk) => risk.level === "blocked"),
  };
  removalPlans.put(planId, plan, now);
  const { directoryKey: _directoryKey, ...review } = plan;
  void _directoryKey;
  return review;
}

export async function confirmSkillRemoval(
  planId: string,
  options: SkillTrashOptions = {},
): Promise<SkillRemovalResult> {
  const now = options.now || new Date();
  const consumed = removalPlans.consume(planId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("REMOVAL_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("REMOVAL_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (!plan.removalAllowed) throw new SkillAtlasError("REMOVAL_BLOCKED");

  return withLifecycleLock(plan.directoryPath, async () => {
    const writer = resolveTrashTransactionWriter(options);
    const trashId = (options.idFactory || randomUUID)();
    const transactionDirectory = path.join(resolveTrashRoot(options), trashId);
    const trashDirectory = path.join(transactionDirectory, "skill");
    const transaction: LifecycleTransaction = {
      id: trashId,
      operation: "uninstall",
      skillId: plan.skillId,
      skillName: plan.skillName,
      state: "planned",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expectedFingerprint: plan.fingerprint.value,
      originalDirectory: plan.directoryPath,
      backupDirectory: trashDirectory,
    };
    let moved = false;
    let removedTracking = false;
    const manifest: TrashedSkillRecord = {
      trashId,
      skillId: plan.skillId,
      skillName: plan.skillName,
      displayName: plan.displayName,
      originalDirectory: plan.directoryPath,
      trashDirectory,
      deletedAt: now.toISOString(),
      fingerprint: plan.fingerprint,
      sourceTracking: plan.sourceTracking,
      state: "planned",
    };

    try {
      const inventory = await discoverSkills({
        env: options.env,
        homeDirectory: options.homeDirectory,
        forceRefresh: true,
      });
      const current = inventory.skills.find((skill) => skill.id === plan.skillId);
      if (!current) throw new Error("Skill 在确认前已不存在，请重新扫描。");
      if (
        current.source.kind !== "personal" ||
        current.source.permission !== "manage" ||
        !sameTrashPath(current.directoryPath, plan.directoryPath)
      ) {
        throw new Error("Skill 的来源、权限或目录在确认前发生了变化。");
      }
      const directoryPath = await assertManageableSkillDirectory(current.directoryPath, options);
      const snapshot = await snapshotTrashSkill(directoryPath);
      if (
        !snapshot.fingerprint.complete ||
        snapshot.unsupportedPaths.length ||
        snapshot.fingerprint.value !== plan.fingerprint.value
      ) {
        throw new Error("Skill 文件在审查后发生变化，已停止操作。");
      }
      if (await pathExists(transactionDirectory)) {
        throw new Error("回收站事务目录已存在，已停止操作。");
      }

      await mkdir(resolveTrashRoot(options), { recursive: true });
      await mkdir(transactionDirectory, { recursive: false });
      await writeTrashManifest(manifest, options);
      await writer(transaction);
      await rename(directoryPath, trashDirectory);
      moved = true;

      transaction.state = "backed-up";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);
      const backedUp = await snapshotTrashSkill(trashDirectory);
      if (
        !backedUp.fingerprint.complete ||
        backedUp.unsupportedPaths.length ||
        backedUp.fingerprint.value !== plan.fingerprint.value
      ) {
        throw new Error("回收站中的 Skill 指纹与删除审查不一致。");
      }

      const removed = await removeTrackedSource(directoryPath, options);
      removedTracking = Boolean(removed);
      if (removed) manifest.sourceTracking = { status: "tracked", ...removed };
      manifest.state = "committed";
      await writeTrashManifest(manifest, options);
      transaction.state = "committed";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);

      return {
        trashId,
        skillId: plan.skillId,
        skillName: plan.skillName,
        originalDirectory: directoryPath,
        trashDirectory,
        deletedAt: manifest.deletedAt,
        fileCount: plan.fingerprint.fileCount,
        totalBytes: plan.fingerprint.totalBytes,
        rollbackAvailable: true,
      };
    } catch (cause) {
      const failure = cause instanceof Error ? cause.message : "Skill 删除事务失败。";
      let rollbackFailure = "";
      if (moved) {
        try {
          if (await pathExists(plan.directoryPath)) throw new Error("原目录已被其他内容占用。");
          await rename(trashDirectory, plan.directoryPath);
          if (removedTracking && manifest.sourceTracking.status === "tracked") {
            await recordTrackedSource(manifest.sourceTracking, options);
          }
          const restored = await snapshotTrashSkill(plan.directoryPath);
          if (restored.fingerprint.value !== plan.fingerprint.value) {
            throw new Error("回滚后的目录指纹不一致。");
          }
          transaction.state = "rolled-back";
        } catch (rollbackError) {
          rollbackFailure = rollbackError instanceof Error ? rollbackError.message : "未知回滚错误。";
          transaction.state = "failed";
        }
      } else {
        transaction.state = "failed";
      }
      transaction.updatedAt = new Date().toISOString();
      transaction.failure = rollbackFailure
        ? failure + "；自动回滚也失败：" + rollbackFailure
        : failure;
      manifest.state = "failed";
      manifest.failure = transaction.failure;
      await writeTrashManifest(manifest, options).catch(() => undefined);
      await writer(transaction).catch(() => undefined);
      throw new Error(transaction.failure);
    }
  });
}

import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { isPathInside } from "@/core/skills/paths";
import {
  assertDirectPrivateDirectory,
  assertTrashSkillDirectory,
  assertTrashTransactionDirectory,
  pathExists,
  readTrashManifest,
  resolvePurgeRoot,
  resolveTrashTransactionWriter,
  sameTrashPath,
  snapshotTrashSkill,
  type SkillTrashOptions,
} from "./skill-trash-store";
import { withLifecycleLock } from "./transaction-store";
import type {
  InternalPermanentDeletionPlan,
  LifecycleTransaction,
  PermanentDeletionResult,
  PermanentDeletionReview,
} from "./types";

const PLAN_TTL_MS = 10 * 60_000;

export const permanentDeletionPlans = getReviewPlanStore<InternalPermanentDeletionPlan>("permanent-deletion");

export async function inspectPermanentDeletion(
  input: { trashId: string },
  options: SkillTrashOptions = {},
): Promise<PermanentDeletionReview> {
  const manifest = await readTrashManifest(input.trashId, options);
  if (!(["committed", "failed"] as const).includes(manifest.state as "committed" | "failed")) {
    throw new Error("这条回收站记录当前不能永久删除。");
  }
  const transactionDirectory = await assertTrashTransactionDirectory(manifest, options);
  const skillDirectory = await assertTrashSkillDirectory(manifest, options);
  const snapshot = await snapshotTrashSkill(skillDirectory);
  if (
    !snapshot.fingerprint.complete ||
    snapshot.unsupportedPaths.length ||
    snapshot.fingerprint.value !== manifest.fingerprint.value
  ) {
    throw new Error("回收站中的 Skill 已变化或不完整，拒绝永久删除。");
  }

  const now = options.now || new Date();
  const planId = (options.idFactory || randomUUID)();
  const plan: InternalPermanentDeletionPlan = {
    planId,
    expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(),
    trashId: manifest.trashId,
    skillId: manifest.skillId,
    skillName: manifest.skillName,
    displayName: manifest.displayName,
    originalDirectory: manifest.originalDirectory,
    trashDirectory: manifest.trashDirectory,
    transactionDirectory,
    fingerprint: snapshot.fingerprint,
    confirmationText: manifest.skillName,
    deletionAllowed: true,
  };
  permanentDeletionPlans.put(planId, plan, now);
  const { transactionDirectory: _transactionDirectory, ...review } = plan;
  void _transactionDirectory;
  return review;
}

export async function confirmPermanentDeletion(
  input: { planId: string; confirmationText: string },
  options: SkillTrashOptions = {},
): Promise<PermanentDeletionResult> {
  const now = options.now || new Date();
  const consumed = permanentDeletionPlans.consume(input.planId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("PURGE_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("PURGE_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (input.confirmationText !== plan.confirmationText) {
    throw new SkillAtlasError("PURGE_CONFIRMATION_MISMATCH");
  }

  return withLifecycleLock(plan.transactionDirectory, async () => {
    const manifest = await readTrashManifest(plan.trashId, options);
    if (
      manifest.skillId !== plan.skillId ||
      manifest.skillName !== plan.skillName ||
      manifest.fingerprint.value !== plan.fingerprint.value ||
      !sameTrashPath(manifest.originalDirectory, plan.originalDirectory) ||
      !sameTrashPath(manifest.trashDirectory, plan.trashDirectory)
    ) {
      throw new Error("回收站记录在审查后发生变化，已停止永久删除。");
    }
    const transactionDirectory = await assertTrashTransactionDirectory(manifest, options);
    if (!sameTrashPath(transactionDirectory, plan.transactionDirectory)) {
      throw new Error("回收站事务路径在审查后发生变化。");
    }
    const skillDirectory = await assertTrashSkillDirectory(manifest, options);
    const snapshot = await snapshotTrashSkill(skillDirectory);
    if (
      !snapshot.fingerprint.complete ||
      snapshot.unsupportedPaths.length ||
      snapshot.fingerprint.value !== plan.fingerprint.value
    ) {
      throw new Error("回收站中的 Skill 在审查后发生变化，已停止永久删除。");
    }

    const purgeId = (options.idFactory || randomUUID)();
    const quarantineRoot = resolvePurgeRoot(options);
    const quarantineDirectory = path.join(quarantineRoot, purgeId);
    if (
      !isPathInside(quarantineRoot, quarantineDirectory) ||
      sameTrashPath(quarantineRoot, quarantineDirectory) ||
      !sameTrashPath(path.dirname(quarantineDirectory), quarantineRoot)
    ) {
      throw new Error("永久删除隔离路径无效。");
    }
    if (await pathExists(quarantineDirectory)) {
      throw new Error("永久删除隔离目录已存在，已停止操作。");
    }

    const writer = resolveTrashTransactionWriter(options);
    const transaction: LifecycleTransaction = {
      id: purgeId,
      operation: "purge",
      skillId: manifest.skillId,
      skillName: manifest.skillName,
      state: "planned",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expectedFingerprint: plan.fingerprint.value,
      originalDirectory: transactionDirectory,
      backupDirectory: quarantineDirectory,
    };
    let quarantined = false;
    try {
      await writer(transaction);
      await mkdir(quarantineRoot, { recursive: true });
      await rename(transactionDirectory, quarantineDirectory);
      quarantined = true;

      await assertDirectPrivateDirectory(quarantineRoot, quarantineDirectory, "Skill 永久删除隔离目录");
      const quarantinedSnapshot = await snapshotTrashSkill(path.join(quarantineDirectory, "skill"));
      if (
        !quarantinedSnapshot.fingerprint.complete ||
        quarantinedSnapshot.unsupportedPaths.length ||
        quarantinedSnapshot.fingerprint.value !== plan.fingerprint.value
      ) {
        throw new Error("隔离后的 Skill 指纹不一致。");
      }
      transaction.state = "staged";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);

      const remover = options.purgeRemover || ((directoryPath: string) => rm(directoryPath, {
        recursive: true,
        force: false,
        maxRetries: 2,
        retryDelay: 100,
      }));
      try {
        await remover(quarantineDirectory);
      } catch (removalError) {
        if (await pathExists(quarantineDirectory)) throw removalError;
      }
      if (await pathExists(quarantineDirectory)) {
        throw new Error("永久删除后隔离目录仍然存在。");
      }

      transaction.state = "committed";
      transaction.updatedAt = new Date().toISOString();
      let auditStatus: PermanentDeletionResult["auditStatus"] = "recorded";
      let auditWarning: string | undefined;
      try {
        await writer(transaction);
      } catch (auditError) {
        auditStatus = "incomplete";
        const message = auditError instanceof Error ? auditError.message : "未知审计写入错误";
        auditWarning = "永久删除已完成，但最终审计记录未能写入：" + message;
      }
      return {
        trashId: manifest.trashId,
        skillId: manifest.skillId,
        skillName: manifest.skillName,
        purgedAt: now.toISOString(),
        fileCount: plan.fingerprint.fileCount,
        totalBytes: plan.fingerprint.totalBytes,
        auditTransactionId: purgeId,
        auditStatus,
        auditWarning,
        recoverable: false,
      };
    } catch (cause) {
      const failure = cause instanceof Error ? cause.message : "Skill 永久删除事务失败。";
      let rollbackFailure = "";
      if (quarantined && await pathExists(quarantineDirectory)) {
        try {
          const remaining = await snapshotTrashSkill(path.join(quarantineDirectory, "skill"));
          if (
            !remaining.fingerprint.complete ||
            remaining.unsupportedPaths.length ||
            remaining.fingerprint.value !== plan.fingerprint.value
          ) {
            throw new Error("隔离目录已不完整，不能自动移回回收站。");
          }
          if (await pathExists(transactionDirectory)) {
            throw new Error("原回收站事务目录已被占用。");
          }
          await rename(quarantineDirectory, transactionDirectory);
          await assertTrashSkillDirectory(manifest, options);
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
        ? failure + "；自动回滚也失败：" + rollbackFailure + "；隔离位置：" + quarantineDirectory
        : failure;
      await writer(transaction).catch(() => undefined);
      throw new Error(transaction.failure);
    }
  });
}

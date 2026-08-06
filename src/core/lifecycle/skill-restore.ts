import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";

import { isPathInside, resolvePersonalSkillsRoot } from "@/core/skills/paths";
import { recordTrackedSource, removeTrackedSource } from "./source-registry";
import {
  assertTrashSkillDirectory,
  pathExists,
  readTrashManifest,
  resolveTrashTransactionWriter,
  sameTrashPath,
  snapshotTrashSkill,
  writeTrashManifest,
  type SkillTrashOptions,
} from "./skill-trash-store";
import { withLifecycleLock } from "./transaction-store";
import type { LifecycleTransaction, SkillRestoreResult } from "./types";

export async function restoreTrashedSkill(
  trashId: string,
  options: SkillTrashOptions = {},
): Promise<SkillRestoreResult> {
  const manifest = await readTrashManifest(trashId, options);
  if (!["committed", "failed"].includes(manifest.state)) {
    throw new Error("这条回收站记录当前不能恢复。");
  }
  const expectedTrashDirectory = await assertTrashSkillDirectory(manifest, options);
  const skillsRoot = resolvePersonalSkillsRoot(options.env, options.homeDirectory);
  const targetDirectory = path.resolve(manifest.originalDirectory);
  if (
    !isPathInside(skillsRoot, targetDirectory) ||
    sameTrashPath(skillsRoot, targetDirectory) ||
    !sameTrashPath(path.dirname(targetDirectory), skillsRoot)
  ) {
    throw new Error("恢复目标不在个人 Skills 根目录中。");
  }

  return withLifecycleLock(targetDirectory, async () => {
    if (await pathExists(targetDirectory)) {
      throw new Error("原 Skill 目录已被占用，恢复操作不会覆盖现有文件。");
    }
    const snapshot = await snapshotTrashSkill(expectedTrashDirectory);
    if (
      !snapshot.fingerprint.complete ||
      snapshot.unsupportedPaths.length ||
      snapshot.fingerprint.value !== manifest.fingerprint.value
    ) {
      throw new Error("回收站中的 Skill 已变化或不完整，无法安全恢复。");
    }

    const now = options.now || new Date();
    const restoreId = (options.idFactory || randomUUID)();
    const writer = resolveTrashTransactionWriter(options);
    const transaction: LifecycleTransaction = {
      id: restoreId,
      operation: "restore",
      skillId: manifest.skillId,
      skillName: manifest.skillName,
      state: "planned",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expectedFingerprint: manifest.fingerprint.value,
      originalDirectory: targetDirectory,
      backupDirectory: expectedTrashDirectory,
    };
    let moved = false;
    let trackingRestored = false;
    try {
      await writer(transaction);
      await mkdir(skillsRoot, { recursive: true });
      await rename(expectedTrashDirectory, targetDirectory);
      moved = true;
      const restored = await snapshotTrashSkill(targetDirectory);
      if (
        !restored.fingerprint.complete ||
        restored.unsupportedPaths.length ||
        restored.fingerprint.value !== manifest.fingerprint.value
      ) {
        throw new Error("恢复后的 Skill 指纹不一致。");
      }
      if (manifest.sourceTracking.status === "tracked") {
        await recordTrackedSource(manifest.sourceTracking, options);
        trackingRestored = true;
      }
      const restoredAt = now.toISOString();
      manifest.state = "restored";
      manifest.restoredAt = restoredAt;
      delete manifest.failure;
      await writeTrashManifest(manifest, options);
      transaction.state = "committed";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);
      return {
        trashId,
        skillId: manifest.skillId,
        skillName: manifest.skillName,
        restoredDirectory: targetDirectory,
        restoredAt,
        fileCount: manifest.fingerprint.fileCount,
        totalBytes: manifest.fingerprint.totalBytes,
      };
    } catch (cause) {
      const failure = cause instanceof Error ? cause.message : "Skill 恢复事务失败。";
      let rollbackFailure = "";
      if (moved) {
        try {
          if (trackingRestored) await removeTrackedSource(targetDirectory, options);
          if (await pathExists(expectedTrashDirectory)) {
            throw new Error("回收站目标已被其他内容占用。");
          }
          await rename(targetDirectory, expectedTrashDirectory);
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

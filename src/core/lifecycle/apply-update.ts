import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { fetchGithubBlob, validateRelativePath } from "@/core/github/skill-source";
import { isPathInside, resolvePersonalSkillsRoot } from "@/core/skills/paths";
import { updatePreviewPlans } from "./inspect-update";
import { snapshotLocalSkill } from "./fingerprint";
import { readSourceRegistry, recordTrackedSource, removeTrackedSource } from "./source-registry";
import { resolveLifecycleStorageRoots, sameWindowsPath } from "./storage";
import {
  resolveTransactionWriter,
  withLifecycleLock,
  writeJsonAtomically,
  type TransactionOptions,
} from "./transaction-store";
import type {
  LifecycleTransaction,
  SkillUpdateResult,
  TrackedSkillSource,
} from "./types";

const MAX_FILES = 500;

interface UpdateManifest {
  version: 1;
  transactionId: string;
  skillId: string;
  skillName: string;
  originalDirectory: string;
  backupDirectory: string;
  previousFingerprint: string;
  targetFingerprint: string;
  trackingRecord: TrackedSkillSource;
  previousTracking?: TrackedSkillSource;
}

export interface ApplyUpdateOptions extends TransactionOptions {
  fetcher?: typeof fetch;
  now?: Date;
  idFactory?: () => string;
  checkpoint?: (state: "staged" | "backed-up" | "installed" | "rollback-started" | "rollback-succeeded" | "rollback-failed") => void | Promise<void>;
}

async function exists(location: string): Promise<boolean> {
  try {
    await stat(location);
    return true;
  } catch {
    return false;
  }
}

async function assertManageableSkillDirectory(
  directoryPath: string,
  options: ApplyUpdateOptions,
): Promise<string> {
  const root = path.resolve(resolvePersonalSkillsRoot(options.env, options.homeDirectory));
  const directory = path.resolve(directoryPath);
  if (
    !isPathInside(root, directory)
    || sameWindowsPath(root, directory)
    || !sameWindowsPath(path.dirname(directory), root)
  ) throw new SkillAtlasError("UPDATE_STATE_CHANGED");
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new SkillAtlasError("UPDATE_STATE_CHANGED");
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  if (!isPathInside(realRoot, realDirectory) || sameWindowsPath(realRoot, realDirectory)) {
    throw new SkillAtlasError("UPDATE_STATE_CHANGED");
  }
  return directory;
}

function directPrivatePath(root: string, id: string): string {
  const location = path.join(root, id);
  if (
    !isPathInside(root, location)
    || sameWindowsPath(root, location)
    || !sameWindowsPath(path.dirname(location), root)
  ) throw new SkillAtlasError("UPDATE_STATE_CHANGED");
  return location;
}

async function verifiedFingerprint(directory: string, expected: string): Promise<void> {
  const snapshot = await snapshotLocalSkill(directory, { maxFiles: MAX_FILES });
  if (
    !snapshot.fingerprint.complete
    || snapshot.unsupportedPaths.length
    || snapshot.fingerprint.value !== expected
  ) throw new SkillAtlasError("UPDATE_STATE_CHANGED");
}

export async function confirmSkillUpdate(
  previewId: string,
  options: ApplyUpdateOptions = {},
): Promise<SkillUpdateResult> {
  const now = options.now || new Date();
  const consumed = updatePreviewPlans.consume(previewId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("UPDATE_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("UPDATE_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (!plan.updateAllowed) throw new SkillAtlasError("UPDATE_BLOCKED");

  return withLifecycleLock(plan.localDirectory, async () => {
    const originalDirectory = await assertManageableSkillDirectory(plan.localDirectory, options);
    await verifiedFingerprint(originalDirectory, plan.local.value);

    const transactionId = (options.idFactory || randomUUID)();
    const roots = resolveLifecycleStorageRoots(options);
    const stagingDirectory = directPrivatePath(roots.stagingRoot, transactionId);
    const stagedSkillDirectory = path.join(stagingDirectory, "skill");
    const backupContainer = directPrivatePath(roots.backupRoot, transactionId);
    const backupDirectory = path.join(backupContainer, "skill");
    const manifestPath = path.join(backupContainer, "manifest.json");
    if (await exists(stagingDirectory) || await exists(backupContainer)) {
      throw new SkillAtlasError("UPDATE_STATE_CHANGED");
    }

    const writer = resolveTransactionWriter(options);
    const trackingRecord: TrackedSkillSource = {
      ...plan.trackingRecord,
      upstreamFingerprint: plan.upstream.value,
      localFingerprint: plan.upstream.value,
      revision: plan.source.revision,
      trackedAt: now.toISOString(),
    };
    const transaction: LifecycleTransaction = {
      id: transactionId,
      operation: "update",
      skillId: plan.skillId,
      skillName: plan.skillName,
      state: "planned",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expectedFingerprint: plan.local.value,
      targetFingerprint: plan.upstream.value,
      originalDirectory,
      stagingDirectory,
      backupDirectory,
      manifestPath,
    };
    let backupMoved = false;
    let installed = false;
    let trackingUpdated = false;
    const previousTracking = (await readSourceRegistry(options)).get(
      plan.trackingRecord.skillDirectory.replaceAll("\\", "/").toLocaleLowerCase(),
    );

    try {
      await writer(transaction);
      await mkdir(stagedSkillDirectory, { recursive: true });
      for (const entry of plan.entries) {
        if (entry.type !== "blob") throw new SkillAtlasError("UPDATE_STATE_CHANGED");
        validateRelativePath(entry.path);
        const destination = path.resolve(stagedSkillDirectory, ...entry.path.split("/"));
        if (!isPathInside(stagedSkillDirectory, destination)) throw new SkillAtlasError("UPDATE_STATE_CHANGED");
        const data = await fetchGithubBlob(entry, { env: options.env, fetcher: options.fetcher });
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, data, { flag: "wx" });
      }
      await verifiedFingerprint(stagedSkillDirectory, plan.upstream.value);
      transaction.state = "staged";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);
      await options.checkpoint?.("staged");

      await mkdir(roots.backupRoot, { recursive: true });
      await mkdir(backupContainer, { recursive: false });
      const manifest: UpdateManifest = {
        version: 1,
        transactionId,
        skillId: plan.skillId,
        skillName: plan.skillName,
        originalDirectory,
        backupDirectory,
        previousFingerprint: plan.local.value,
        targetFingerprint: plan.upstream.value,
        trackingRecord,
        previousTracking,
      };
      await writeJsonAtomically(manifestPath, manifest);
      await rename(originalDirectory, backupDirectory);
      backupMoved = true;
      await verifiedFingerprint(backupDirectory, plan.local.value);
      transaction.state = "backed-up";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);
      await options.checkpoint?.("backed-up");

      await rename(stagedSkillDirectory, originalDirectory);
      installed = true;
      await verifiedFingerprint(originalDirectory, plan.upstream.value);
      await options.checkpoint?.("installed");
      await recordTrackedSource(trackingRecord, options);
      trackingUpdated = true;
      transaction.state = "committed";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);
      await rm(stagingDirectory, { recursive: true, force: true });

      return {
        transactionId,
        skillId: plan.skillId,
        skillName: plan.skillName,
        updatedDirectory: originalDirectory,
        backupDirectory,
        previousFingerprint: plan.local,
        installedFingerprint: plan.upstream,
        revision: plan.source.revision,
        updatedAt: now.toISOString(),
        rollbackAvailable: true,
      };
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Skill 更新事务失败。";
      let rollbackFailure = "";
      if (backupMoved) {
        try {
          await options.checkpoint?.("rollback-started");
          if (await exists(originalDirectory)) {
            await verifiedFingerprint(originalDirectory, plan.upstream.value);
            const failedDirectory = path.join(stagingDirectory, "failed-skill");
            if (await exists(failedDirectory)) throw new Error("更新失败暂存目录已被占用。");
            await rename(originalDirectory, failedDirectory);
          }
          if (await exists(originalDirectory)) throw new Error("原 Skill 目录仍被占用。");
          await rename(backupDirectory, originalDirectory);
          await verifiedFingerprint(originalDirectory, plan.local.value);
          if (trackingUpdated) {
            if (previousTracking) await recordTrackedSource(previousTracking, options);
            else await removeTrackedSource(originalDirectory, options);
          }
          transaction.state = "rolled-back";
          await options.checkpoint?.("rollback-succeeded");
        } catch (rollbackError) {
          rollbackFailure = rollbackError instanceof Error ? rollbackError.message : "未知回滚错误。";
          transaction.state = "failed";
          await options.checkpoint?.("rollback-failed");
        }
      } else {
        transaction.state = "failed";
      }
      transaction.updatedAt = new Date().toISOString();
      transaction.failure = rollbackFailure
        ? `${failure}；自动回滚也失败：${rollbackFailure}`
        : failure;
      await writer(transaction).catch(() => undefined);
      if (!installed && !backupMoved) {
        await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
      throw new SkillAtlasError("UPDATE_APPLY_FAILED", { cause: error });
    }
  });
}

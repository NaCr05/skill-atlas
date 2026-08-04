import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { discoverSkills } from "@/core/skills/discover";
import {
  isPathInside,
  resolvePersonalSkillsRoot,
} from "@/core/skills/paths";
import type { SkillRecord } from "@/core/skills/types";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { snapshotLocalSkill } from "./fingerprint";
import { inspectLifecycleRecovery } from "./reconcile";
import { isTrashedSkillRecord } from "./records";
import {
  recordTrackedSource,
  removeTrackedSource,
  skillDirectoryKey,
} from "./source-registry";
import type {
  InternalPermanentDeletionPlan,
  InternalSkillRemovalPlan,
  LifecycleTransaction,
  PermanentDeletionResult,
  PermanentDeletionReview,
  SkillRemovalResult,
  SkillRemovalReview,
  SkillRestoreResult,
  SkillTrashOverview,
  TrashedSkillRecord,
} from "./types";
import { resolveLifecycleStorageRoots, sameWindowsPath } from "./storage";
import { listDisabledSkills } from "./skill-state";
import {
  resolveTransactionWriter,
  withLifecycleLock,
  writeJsonAtomically,
  type TransactionWriter,
} from "./transaction-store";

const PLAN_TTL_MS = 10 * 60_000;
const MAX_FILES = 500;

export const removalPlans = getReviewPlanStore<InternalSkillRemovalPlan>("skill-removal");
export const permanentDeletionPlans = getReviewPlanStore<InternalPermanentDeletionPlan>("permanent-deletion");
type PurgeRemover = (directoryPath: string) => Promise<void>;

interface SkillTrashOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
  now?: Date;
  idFactory?: () => string;
  transactionWriter?: TransactionWriter;
  purgeRemover?: PurgeRemover;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function samePath(left: string, right: string): boolean {
  return sameWindowsPath(left, right);
}

function trashRoot(options: SkillTrashOptions): string {
  return resolveLifecycleStorageRoots(options).trashRoot;
}

function purgeRoot(options: SkillTrashOptions): string {
  return resolveLifecycleStorageRoots(options).purgeRoot;
}

function transactionWriter(options: SkillTrashOptions): TransactionWriter {
  return resolveTransactionWriter(options);
}

async function assertManageableDirectory(
  directoryPath: string,
  options: SkillTrashOptions,
): Promise<string> {
  const skillsRoot = path.resolve(
    resolvePersonalSkillsRoot(options.env, options.homeDirectory),
  );
  const resolvedDirectory = path.resolve(directoryPath);
  if (
    !isPathInside(skillsRoot, resolvedDirectory) ||
    samePath(skillsRoot, resolvedDirectory) ||
    !samePath(path.dirname(resolvedDirectory), skillsRoot)
  ) {
    throw new Error("只允许管理个人 Skills 根目录中的直接子目录。");
  }
  const details = await lstat(resolvedDirectory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("Skill 目录不是可管理的普通目录。");
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(skillsRoot),
    realpath(resolvedDirectory),
  ]);
  if (!isPathInside(realRoot, realDirectory) || samePath(realRoot, realDirectory)) {
    throw new Error("Skill 的真实路径超出了个人 Skills 目录。");
  }
  return resolvedDirectory;
}

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
  const directoryPath = await assertManageableDirectory(skill.directoryPath, options);
  const snapshot = await snapshotLocalSkill(directoryPath, { maxFiles: MAX_FILES });
  const hardDependents = dependentSkillsAfterRemoval(inventory.skills, skill);
  const instructionReferences = instructionReferencesAfterRemoval(
    inventory.skills,
    skill,
  );
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
      detail:
        String(snapshot.fingerprint.fileCount) +
        " 个文件，共 " +
        String(snapshot.fingerprint.totalBytes) +
        " 字节；可以恢复到原目录。",
    },
  ];
  if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length) {
    risks.push({
      level: "blocked",
      code: "unsupported-path",
      title: "目录无法生成完整安全快照",
      detail: snapshot.unsupportedPaths.length
        ? "发现链接或不支持的路径：" + snapshot.unsupportedPaths.slice(0, 8).join("、")
        : "文件数量超过当前安全上限 " + String(MAX_FILES) + "。",
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

function manifestLocation(trashId: string, options: SkillTrashOptions): string {
  const root = trashRoot(options);
  const location = path.join(root, trashId, "manifest.json");
  if (!isPathInside(root, location)) throw new Error("回收站记录路径无效。");
  return location;
}

async function writeTrashManifest(
  record: TrashedSkillRecord,
  options: SkillTrashOptions,
): Promise<void> {
  await writeJsonAtomically(manifestLocation(record.trashId, options), record);
}

async function readTrashManifest(
  trashId: string,
  options: SkillTrashOptions,
): Promise<TrashedSkillRecord> {
  if (!/^[0-9a-f-]{36}$/i.test(trashId)) throw new Error("回收站记录 ID 无效。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestLocation(trashId, options), "utf8"));
  } catch {
    throw new Error("未找到这条 Skill 回收站记录。");
  }
  if (!isTrashedSkillRecord(parsed) || parsed.trashId !== trashId) {
    throw new Error("Skill 回收站记录损坏或格式不受支持。");
  }
  return parsed;
}

async function assertTrashSkillDirectory(
  record: TrashedSkillRecord,
  options: SkillTrashOptions,
): Promise<string> {
  const root = trashRoot(options);
  const expected = path.join(root, record.trashId, "skill");
  if (!samePath(expected, record.trashDirectory)) {
    throw new Error("回收站中的 Skill 路径与记录不一致。");
  }
  const details = await lstat(expected);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("回收站中的 Skill 不是可恢复的普通目录。");
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(root),
    realpath(expected),
  ]);
  if (!isPathInside(realRoot, realDirectory) || samePath(realRoot, realDirectory)) {
    throw new Error("回收站中 Skill 的真实路径超出了安全目录。");
  }
  return expected;
}

async function assertDirectPrivateDirectory(
  rootPath: string,
  directoryPath: string,
  label: string,
): Promise<string> {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedDirectory = path.resolve(directoryPath);
  if (
    !isPathInside(resolvedRoot, resolvedDirectory) ||
    samePath(resolvedRoot, resolvedDirectory) ||
    !samePath(path.dirname(resolvedDirectory), resolvedRoot)
  ) {
    throw new Error(label + "路径不在允许的私有目录中。");
  }
  const details = await lstat(resolvedDirectory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(label + "不是可管理的普通目录。");
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(resolvedRoot),
    realpath(resolvedDirectory),
  ]);
  if (
    !isPathInside(realRoot, realDirectory) ||
    samePath(realRoot, realDirectory) ||
    !samePath(path.dirname(realDirectory), realRoot)
  ) {
    throw new Error(label + "真实路径超出了允许的私有目录。");
  }
  return resolvedDirectory;
}

async function assertTrashTransactionDirectory(
  record: TrashedSkillRecord,
  options: SkillTrashOptions,
): Promise<string> {
  return assertDirectPrivateDirectory(
    trashRoot(options),
    path.join(trashRoot(options), record.trashId),
    "Skill 回收站事务目录",
  );
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
    const writer = transactionWriter(options);
    const trashId = (options.idFactory || randomUUID)();
    const transactionDirectory = path.join(trashRoot(options), trashId);
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
        !samePath(current.directoryPath, plan.directoryPath)
      ) {
        throw new Error("Skill 的来源、权限或目录在确认前发生了变化。");
      }
      const directoryPath = await assertManageableDirectory(
        current.directoryPath,
        options,
      );
      const snapshot = await snapshotLocalSkill(directoryPath, { maxFiles: MAX_FILES });
      if (
        !snapshot.fingerprint.complete ||
        snapshot.unsupportedPaths.length ||
        snapshot.fingerprint.value !== plan.fingerprint.value
      ) {
        throw new Error("Skill 文件在审查后发生变化，已停止操作。");
      }
      if (await exists(transactionDirectory)) {
        throw new Error("回收站事务目录已存在，已停止操作。");
      }

      await mkdir(trashRoot(options), { recursive: true });
      await mkdir(transactionDirectory, { recursive: false });
      await writeTrashManifest(manifest, options);
      await writer(transaction);
      await rename(directoryPath, trashDirectory);
      moved = true;

      transaction.state = "backed-up";
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction);
      const backedUp = await snapshotLocalSkill(trashDirectory, { maxFiles: MAX_FILES });
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
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Skill 删除事务失败。";
      let rollbackFailure = "";
      if (moved) {
        try {
          if (await exists(plan.directoryPath)) {
            throw new Error("原目录已被其他内容占用。");
          }
          await rename(trashDirectory, plan.directoryPath);
          if (
            removedTracking &&
            manifest.sourceTracking.status === "tracked"
          ) {
            await recordTrackedSource(manifest.sourceTracking, options);
          }
          const restored = await snapshotLocalSkill(plan.directoryPath, {
            maxFiles: MAX_FILES,
          });
          if (restored.fingerprint.value !== plan.fingerprint.value) {
            throw new Error("回滚后的目录指纹不一致。");
          }
          transaction.state = "rolled-back";
        } catch (rollbackError) {
          rollbackFailure =
            rollbackError instanceof Error
              ? rollbackError.message
              : "未知回滚错误。";
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

export async function listTrashedSkills(
  options: SkillTrashOptions = {},
): Promise<TrashedSkillRecord[]> {
  const root = trashRoot(options);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const record = await readTrashManifest(entry.name, options);
          if (
            !["committed", "failed"].includes(record.state) ||
            !(await exists(record.trashDirectory))
          ) {
            return undefined;
          }
          await assertTrashSkillDirectory(record, options);
          return record;
        } catch {
          return undefined;
        }
      }),
  );
  return records
    .filter((record): record is TrashedSkillRecord => Boolean(record))
    .sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt));
}

export async function getSkillTrashOverview(
  options: SkillTrashOptions = {},
): Promise<SkillTrashOverview> {
  const [records, disabledRecords, recovery] = await Promise.all([
    listTrashedSkills(options),
    listDisabledSkills(options),
    inspectLifecycleRecovery(options),
  ]);
  return {
    rootPath: trashRoot(options),
    count: records.length,
    totalBytes: records.reduce(
      (total, record) => total + record.fingerprint.totalBytes,
      0,
    ),
    records,
    disabledRoot: resolveLifecycleStorageRoots(options).disabledRoot,
    disabledCount: disabledRecords.length,
    disabledRecords,
    recovery,
  };
}

export async function inspectPermanentDeletion(
  input: { trashId: string },
  options: SkillTrashOptions = {},
): Promise<PermanentDeletionReview> {
  const manifest = await readTrashManifest(input.trashId, options);
  if (!(["committed", "failed"] as const).includes(manifest.state as "committed" | "failed")) {
    throw new Error("这条回收站记录当前不能永久删除。");
  }
  const transactionDirectory = await assertTrashTransactionDirectory(
    manifest,
    options,
  );
  const skillDirectory = await assertTrashSkillDirectory(manifest, options);
  const snapshot = await snapshotLocalSkill(skillDirectory, { maxFiles: MAX_FILES });
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
  if (consumed.status === "missing") {
    throw new SkillAtlasError("PURGE_PLAN_MISSING");
  }
  if (consumed.status === "expired") {
    throw new SkillAtlasError("PURGE_PLAN_EXPIRED");
  }
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
      !samePath(manifest.originalDirectory, plan.originalDirectory) ||
      !samePath(manifest.trashDirectory, plan.trashDirectory)
    ) {
      throw new Error("回收站记录在审查后发生变化，已停止永久删除。");
    }
    const transactionDirectory = await assertTrashTransactionDirectory(
      manifest,
      options,
    );
    if (!samePath(transactionDirectory, plan.transactionDirectory)) {
      throw new Error("回收站事务路径在审查后发生变化。");
    }
    const skillDirectory = await assertTrashSkillDirectory(manifest, options);
    const snapshot = await snapshotLocalSkill(skillDirectory, { maxFiles: MAX_FILES });
    if (
      !snapshot.fingerprint.complete ||
      snapshot.unsupportedPaths.length ||
      snapshot.fingerprint.value !== plan.fingerprint.value
    ) {
      throw new Error("回收站中的 Skill 在审查后发生变化，已停止永久删除。");
    }

    const purgeId = (options.idFactory || randomUUID)();
    const quarantineRoot = purgeRoot(options);
    const quarantineDirectory = path.join(quarantineRoot, purgeId);
    if (
      !isPathInside(quarantineRoot, quarantineDirectory) ||
      samePath(quarantineRoot, quarantineDirectory) ||
      !samePath(path.dirname(quarantineDirectory), quarantineRoot)
    ) {
      throw new Error("永久删除隔离路径无效。");
    }
    if (await exists(quarantineDirectory)) {
      throw new Error("永久删除隔离目录已存在，已停止操作。");
    }

    const writer = transactionWriter(options);
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

      await assertDirectPrivateDirectory(
        quarantineRoot,
        quarantineDirectory,
        "Skill 永久删除隔离目录",
      );
      const quarantinedSnapshot = await snapshotLocalSkill(
        path.join(quarantineDirectory, "skill"),
        { maxFiles: MAX_FILES },
      );
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

      const remover = options.purgeRemover ||
        ((directoryPath: string) =>
          rm(directoryPath, {
            recursive: true,
            force: false,
            maxRetries: 2,
            retryDelay: 100,
          }));
      try {
        await remover(quarantineDirectory);
      } catch (removalError) {
        if (await exists(quarantineDirectory)) throw removalError;
      }
      if (await exists(quarantineDirectory)) {
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
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Skill 永久删除事务失败。";
      let rollbackFailure = "";
      if (quarantined && await exists(quarantineDirectory)) {
        try {
          const remaining = await snapshotLocalSkill(
            path.join(quarantineDirectory, "skill"),
            { maxFiles: MAX_FILES },
          );
          if (
            !remaining.fingerprint.complete ||
            remaining.unsupportedPaths.length ||
            remaining.fingerprint.value !== plan.fingerprint.value
          ) {
            throw new Error("隔离目录已不完整，不能自动移回回收站。");
          }
          if (await exists(transactionDirectory)) {
            throw new Error("原回收站事务目录已被占用。");
          }
          await rename(quarantineDirectory, transactionDirectory);
          await assertTrashSkillDirectory(manifest, options);
          transaction.state = "rolled-back";
        } catch (rollbackError) {
          rollbackFailure = rollbackError instanceof Error
            ? rollbackError.message
            : "未知回滚错误。";
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
    samePath(skillsRoot, targetDirectory) ||
    !samePath(path.dirname(targetDirectory), skillsRoot)
  ) {
    throw new Error("恢复目标不在个人 Skills 根目录中。");
  }

  return withLifecycleLock(targetDirectory, async () => {
    if (await exists(targetDirectory)) {
      throw new Error("原 Skill 目录已被占用，恢复操作不会覆盖现有文件。");
    }
    const snapshot = await snapshotLocalSkill(expectedTrashDirectory, {
      maxFiles: MAX_FILES,
    });
    if (
      !snapshot.fingerprint.complete ||
      snapshot.unsupportedPaths.length ||
      snapshot.fingerprint.value !== manifest.fingerprint.value
    ) {
      throw new Error("回收站中的 Skill 已变化或不完整，无法安全恢复。");
    }

    const now = options.now || new Date();
    const restoreId = (options.idFactory || randomUUID)();
    const writer = transactionWriter(options);
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
      const restored = await snapshotLocalSkill(targetDirectory, {
        maxFiles: MAX_FILES,
      });
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
    } catch (error) {
      const failure = error instanceof Error ? error.message : "Skill 恢复事务失败。";
      let rollbackFailure = "";
      if (moved) {
        try {
          if (trackingRestored) {
            await removeTrackedSource(targetDirectory, options);
          }
          if (await exists(expectedTrashDirectory)) {
            throw new Error("回收站目标已被其他内容占用。");
          }
          await rename(targetDirectory, expectedTrashDirectory);
          transaction.state = "rolled-back";
        } catch (rollbackError) {
          rollbackFailure =
            rollbackError instanceof Error
              ? rollbackError.message
              : "未知回滚错误。";
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

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { discoverSkills } from "@/core/skills/discover";
import { isPathInside, resolvePersonalSkillsRoot } from "@/core/skills/paths";
import type { SkillRecord } from "@/core/skills/types";
import { snapshotLocalSkill } from "./fingerprint";
import { isDisabledSkillRecord } from "./records";
import { resolveLifecycleStorageRoots, sameWindowsPath } from "./storage";
import {
  resolveTransactionWriter,
  withLifecycleLock,
  writeJsonAtomically,
  type TransactionOptions,
} from "./transaction-store";
import type {
  DisabledSkillRecord,
  InternalSkillDisablePlan,
  LifecycleTransaction,
  SkillDisableResult,
  SkillDisableReview,
  SkillEnableResult,
} from "./types";

const MAX_FILES = 500;
const PLAN_TTL_MS = 10 * 60_000;
export const disablePlans = getReviewPlanStore<InternalSkillDisablePlan>("skill-disable");

export interface SkillStateOptions extends TransactionOptions {
  now?: Date;
  idFactory?: () => string;
  checkpoint?: (state: "moved" | "verified") => void | Promise<void>;
}

async function exists(location: string): Promise<boolean> {
  try { await stat(location); return true; } catch { return false; }
}

function disabledContainer(disabledId: string, options: SkillStateOptions): string {
  if (!/^[0-9a-f-]{36}$/i.test(disabledId)) throw new SkillAtlasError("ENABLE_FAILED");
  const root = resolveLifecycleStorageRoots(options).disabledRoot;
  const location = path.join(root, disabledId);
  if (!isPathInside(root, location) || !sameWindowsPath(path.dirname(location), root)) {
    throw new SkillAtlasError("ENABLE_FAILED");
  }
  return location;
}

async function assertPersonalDirectory(directoryPath: string, options: SkillStateOptions): Promise<string> {
  const root = path.resolve(resolvePersonalSkillsRoot(options.env, options.homeDirectory));
  const directory = path.resolve(directoryPath);
  if (!isPathInside(root, directory) || sameWindowsPath(root, directory) || !sameWindowsPath(path.dirname(directory), root)) {
    throw new SkillAtlasError("DISABLE_FAILED");
  }
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new SkillAtlasError("DISABLE_FAILED");
  const [realRoot, realDirectory] = await Promise.all([realpath(root), realpath(directory)]);
  if (!isPathInside(realRoot, realDirectory) || sameWindowsPath(realRoot, realDirectory)) {
    throw new SkillAtlasError("DISABLE_FAILED");
  }
  return directory;
}

async function verified(directory: string, fingerprint: string): Promise<void> {
  const snapshot = await snapshotLocalSkill(directory, { maxFiles: MAX_FILES });
  if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length || snapshot.fingerprint.value !== fingerprint) {
    throw new Error("Skill directory fingerprint does not match its reviewed state.");
  }
}

function hardDependents(skills: SkillRecord[], target: SkillRecord): SkillDisableReview["hardDependents"] {
  const targetName = target.name.toLocaleLowerCase();
  const replacementExists = skills.some((skill) => skill.id !== target.id && skill.name.toLocaleLowerCase() === targetName);
  if (replacementExists) return [];
  return skills
    .filter((skill) => skill.id !== target.id && skill.dependencies.some((name) => name.toLocaleLowerCase() === targetName))
    .map(({ id, name, displayName }) => ({ id, name, displayName }));
}

export async function inspectSkillDisable(
  input: { skillId: string },
  options: SkillStateOptions = {},
): Promise<SkillDisableReview> {
  const inventory = await discoverSkills({ env: options.env, homeDirectory: options.homeDirectory, forceRefresh: true });
  const skill = inventory.skills.find((entry) => entry.id === input.skillId);
  if (!skill) throw new SkillAtlasError("SKILL_NOT_FOUND");
  if (skill.source.kind !== "personal" || skill.source.permission !== "manage") throw new SkillAtlasError("DISABLE_BLOCKED");
  const directoryPath = await assertPersonalDirectory(skill.directoryPath, options);
  const snapshot = await snapshotLocalSkill(directoryPath, { maxFiles: MAX_FILES });
  const dependents = hardDependents(inventory.skills, skill);
  const risks: SkillDisableReview["risks"] = [
    { level: "info", code: "personal-skill", title: "Personal manageable Skill", detail: "Only this personal Skill directory will be moved." },
    { level: "info", code: "complete-private-copy", title: "Complete private disabled copy", detail: `${snapshot.fingerprint.fileCount} files will remain intact and can be restored in place.` },
  ];
  if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length) {
    risks.push({ level: "blocked", code: "unsupported-path", title: "A complete safe snapshot could not be created", detail: snapshot.unsupportedPaths.join(", ") || `The directory exceeds ${MAX_FILES} files.` });
  }
  if (dependents.length) {
    risks.push({ level: "blocked", code: "hard-dependents", title: "Other Skills require this Skill", detail: dependents.map((entry) => entry.displayName).join(", ") });
  }
  const now = options.now || new Date();
  const planId = (options.idFactory || randomUUID)();
  const plan: InternalSkillDisablePlan = {
    planId,
    expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(),
    skillId: skill.id,
    skillName: skill.name,
    displayName: skill.displayName,
    directoryPath,
    fingerprint: snapshot.fingerprint,
    hardDependents: dependents,
    risks,
    disableAllowed: !risks.some((risk) => risk.level === "blocked"),
    sourceTracking: skill.sourceTracking,
  };
  disablePlans.put(planId, plan, now);
  return plan;
}

function manifestPath(disabledId: string, options: SkillStateOptions): string {
  return path.join(disabledContainer(disabledId, options), "manifest.json");
}

async function readDisabledRecord(disabledId: string, options: SkillStateOptions): Promise<DisabledSkillRecord> {
  let value: unknown;
  try { value = JSON.parse(await readFile(manifestPath(disabledId, options), "utf8")); }
  catch { throw new SkillAtlasError("ENABLE_FAILED"); }
  if (!isDisabledSkillRecord(value) || value.disabledId !== disabledId) throw new SkillAtlasError("ENABLE_FAILED");
  return value;
}

export async function confirmSkillDisable(planId: string, options: SkillStateOptions = {}): Promise<SkillDisableResult> {
  const now = options.now || new Date();
  const consumed = disablePlans.consume(planId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("DISABLE_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("DISABLE_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (!plan.disableAllowed) throw new SkillAtlasError("DISABLE_BLOCKED");
  return withLifecycleLock(plan.directoryPath, async () => {
    const current = (await discoverSkills({ env: options.env, homeDirectory: options.homeDirectory, forceRefresh: true })).skills.find((skill) => skill.id === plan.skillId);
    if (!current || !sameWindowsPath(current.directoryPath, plan.directoryPath)) throw new SkillAtlasError("DISABLE_FAILED");
    const originalDirectory = await assertPersonalDirectory(current.directoryPath, options);
    await verified(originalDirectory, plan.fingerprint.value);
    const disabledId = (options.idFactory || randomUUID)();
    const container = disabledContainer(disabledId, options);
    const disabledDirectory = path.join(container, "skill");
    if (await exists(container)) throw new SkillAtlasError("DISABLE_FAILED");
    const record: DisabledSkillRecord = {
      disabledId, skillId: plan.skillId, skillName: plan.skillName, displayName: plan.displayName,
      originalDirectory, disabledDirectory, disabledAt: now.toISOString(), fingerprint: plan.fingerprint,
      sourceTracking: plan.sourceTracking, state: "planned",
    };
    const transaction: LifecycleTransaction = {
      id: disabledId, operation: "disable", skillId: plan.skillId, skillName: plan.skillName,
      state: "planned", createdAt: now.toISOString(), updatedAt: now.toISOString(),
      expectedFingerprint: plan.fingerprint.value, originalDirectory, backupDirectory: disabledDirectory,
      manifestPath: path.join(container, "manifest.json"),
    };
    const writer = resolveTransactionWriter(options);
    let moved = false;
    try {
      await mkdir(resolveLifecycleStorageRoots(options).disabledRoot, { recursive: true });
      await mkdir(container, { recursive: false });
      await writeJsonAtomically(transaction.manifestPath!, record);
      await writer(transaction);
      await rename(originalDirectory, disabledDirectory);
      moved = true;
      await options.checkpoint?.("moved");
      await verified(disabledDirectory, plan.fingerprint.value);
      await options.checkpoint?.("verified");
      record.state = "committed";
      transaction.state = "committed";
      transaction.updatedAt = new Date().toISOString();
      await writeJsonAtomically(transaction.manifestPath!, record);
      await writer(transaction);
      return { disabledId, skillId: plan.skillId, skillName: plan.skillName, originalDirectory, disabledDirectory, disabledAt: record.disabledAt, fileCount: plan.fingerprint.fileCount, totalBytes: plan.fingerprint.totalBytes, reEnableAvailable: true };
    } catch (error) {
      let rollbackFailure = "";
      if (moved) {
        try {
          if (await exists(originalDirectory)) throw new Error("Original directory is occupied.");
          await rename(disabledDirectory, originalDirectory);
          await verified(originalDirectory, plan.fingerprint.value);
          transaction.state = "rolled-back";
        } catch (rollbackError) {
          rollbackFailure = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          transaction.state = "failed";
        }
      } else transaction.state = "failed";
      record.state = "failed";
      record.failure = rollbackFailure || (error instanceof Error ? error.message : String(error));
      transaction.failure = record.failure;
      transaction.updatedAt = new Date().toISOString();
      await writeJsonAtomically(transaction.manifestPath!, record).catch(() => undefined);
      await writer(transaction).catch(() => undefined);
      throw new SkillAtlasError("DISABLE_FAILED", { cause: error });
    }
  });
}

export async function listDisabledSkills(options: SkillStateOptions = {}): Promise<DisabledSkillRecord[]> {
  const root = resolveLifecycleStorageRoots(options).disabledRoot;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const records = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      const record = await readDisabledRecord(entry.name, options);
      if (!["committed", "failed"].includes(record.state)) return undefined;
      await verified(record.disabledDirectory, record.fingerprint.value);
      return record;
    } catch { return undefined; }
  }));
  return records.filter((record): record is DisabledSkillRecord => Boolean(record)).sort((a, b) => Date.parse(b.disabledAt) - Date.parse(a.disabledAt));
}

export async function enableDisabledSkill(disabledId: string, options: SkillStateOptions = {}): Promise<SkillEnableResult> {
  const record = await readDisabledRecord(disabledId, options);
  if (!["committed", "failed"].includes(record.state)) throw new SkillAtlasError("ENABLE_FAILED");
  return withLifecycleLock(record.originalDirectory, async () => {
    const root = path.resolve(resolvePersonalSkillsRoot(options.env, options.homeDirectory));
    const target = path.resolve(record.originalDirectory);
    if (!isPathInside(root, target) || !sameWindowsPath(path.dirname(target), root) || await exists(target)) throw new SkillAtlasError("ENABLE_FAILED");
    const expectedDisabled = path.join(disabledContainer(disabledId, options), "skill");
    if (!sameWindowsPath(expectedDisabled, record.disabledDirectory)) throw new SkillAtlasError("ENABLE_FAILED");
    await verified(expectedDisabled, record.fingerprint.value);
    const now = options.now || new Date();
    const transactionId = (options.idFactory || randomUUID)();
    const transaction: LifecycleTransaction = {
      id: transactionId, operation: "enable", skillId: record.skillId, skillName: record.skillName,
      state: "planned", createdAt: now.toISOString(), updatedAt: now.toISOString(),
      expectedFingerprint: record.fingerprint.value, originalDirectory: target, backupDirectory: expectedDisabled,
      manifestPath: manifestPath(disabledId, options),
    };
    const writer = resolveTransactionWriter(options);
    let moved = false;
    try {
      await writer(transaction);
      await rename(expectedDisabled, target);
      moved = true;
      await options.checkpoint?.("moved");
      await verified(target, record.fingerprint.value);
      await options.checkpoint?.("verified");
      record.state = "enabled";
      record.enabledAt = now.toISOString();
      transaction.state = "committed";
      transaction.updatedAt = new Date().toISOString();
      await writeJsonAtomically(transaction.manifestPath!, record);
      await writer(transaction);
      await rm(disabledContainer(disabledId, options), { recursive: true, force: true });
      return { disabledId, skillId: record.skillId, skillName: record.skillName, restoredDirectory: target, enabledAt: record.enabledAt, fileCount: record.fingerprint.fileCount, totalBytes: record.fingerprint.totalBytes };
    } catch (error) {
      if (moved && !(await exists(expectedDisabled))) {
        try {
          await rename(target, expectedDisabled);
          await verified(expectedDisabled, record.fingerprint.value);
          record.state = "committed";
          record.enabledAt = undefined;
          record.failure = error instanceof Error ? error.message : String(error);
          await writeJsonAtomically(transaction.manifestPath!, record);
          transaction.state = "rolled-back";
        }
        catch { transaction.state = "failed"; }
      } else transaction.state = "failed";
      transaction.failure = error instanceof Error ? error.message : String(error);
      transaction.updatedAt = new Date().toISOString();
      await writer(transaction).catch(() => undefined);
      throw new SkillAtlasError("ENABLE_FAILED", { cause: error });
    }
  });
}

import { lstat, mkdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { isPathInside, resolvePersonalSkillsRoot } from "@/core/skills/paths";
import { snapshotLocalSkill } from "./fingerprint";
import { inspectLifecycleRecovery } from "./reconcile";
import { isLifecycleTransaction, isTrashedSkillRecord } from "./records";
import { resolveLifecycleStorageRoots, sameWindowsPath } from "./storage";
import { recordTrackedSource, removeTrackedSource, skillDirectoryKey } from "./source-registry";
import { persistLifecycleTransaction, withLifecycleLock, type TransactionOptions } from "./transaction-store";
import type { LifecycleRecoveryAction, LifecycleTransaction, TrackedSkillSource, TrashedSkillRecord } from "./types";

const MAX_FILES = 500;

export interface RecoveryActionResult {
  issueId: string;
  action: LifecycleRecoveryAction;
  outcome: "restored" | "cleaned" | "committed" | "rolled-back";
  transactionId?: string;
}

async function exists(location?: string): Promise<boolean> {
  if (!location) return false;
  try { await stat(location); return true; } catch { return false; }
}

async function fingerprint(location: string): Promise<string | undefined> {
  try {
    const snapshot = await snapshotLocalSkill(location, { maxFiles: MAX_FILES });
    return snapshot.fingerprint.complete && !snapshot.unsupportedPaths.length ? snapshot.fingerprint.value : undefined;
  } catch { return undefined; }
}

async function assertDirectPrivate(root: string, location: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(location);
  if (!isPathInside(resolvedRoot, resolved) || !sameWindowsPath(path.dirname(resolved), resolvedRoot)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  const details = await lstat(resolved);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  const [realRoot, realLocation] = await Promise.all([realpath(resolvedRoot), realpath(resolved)]);
  if (!isPathInside(realRoot, realLocation) || !sameWindowsPath(path.dirname(realLocation), realRoot)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
}

function assertOriginalPath(location: string, options: TransactionOptions): void {
  const root = path.resolve(resolvePersonalSkillsRoot(options.env, options.homeDirectory));
  const target = path.resolve(location);
  if (!isPathInside(root, target) || !sameWindowsPath(path.dirname(target), root)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
}

async function restoreQuarantine(issueLocation: string, options: TransactionOptions): Promise<void> {
  const roots = resolveLifecycleStorageRoots(options);
  await assertDirectPrivate(roots.purgeRoot, issueLocation);
  const value = JSON.parse(await readFile(path.join(issueLocation, "manifest.json"), "utf8")) as unknown;
  if (!isTrashedSkillRecord(value)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  const record: TrashedSkillRecord = value;
  const source = path.join(issueLocation, "skill");
  const target = path.join(roots.trashRoot, record.trashId);
  if (!sameWindowsPath(path.dirname(target), roots.trashRoot) || await exists(target)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  if (await fingerprint(source) !== record.fingerprint.value) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  await rename(issueLocation, target);
  if (await fingerprint(path.join(target, "skill")) !== record.fingerprint.value) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
}

async function cleanStaging(issueLocation: string, options: TransactionOptions): Promise<void> {
  const root = resolveLifecycleStorageRoots(options).stagingRoot;
  await assertDirectPrivate(root, issueLocation);
  await rm(issueLocation, { recursive: true, force: false });
}

function validateTransactionPaths(transaction: LifecycleTransaction, options: TransactionOptions): void {
  if (!transaction.originalDirectory || !transaction.backupDirectory) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  assertOriginalPath(transaction.originalDirectory, options);
  const roots = resolveLifecycleStorageRoots(options);
  if (transaction.operation === "update") {
    const expected = path.join(roots.backupRoot, transaction.id, "skill");
    if (!sameWindowsPath(expected, transaction.backupDirectory) || !transaction.manifestPath || !sameWindowsPath(path.join(roots.backupRoot, transaction.id, "manifest.json"), transaction.manifestPath)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  } else if (transaction.operation === "disable") {
    const expected = path.join(roots.disabledRoot, transaction.id, "skill");
    if (!sameWindowsPath(expected, transaction.backupDirectory) || !transaction.manifestPath || !sameWindowsPath(path.join(roots.disabledRoot, transaction.id, "manifest.json"), transaction.manifestPath)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  } else if (transaction.operation === "enable") {
    if (!transaction.manifestPath) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
    const container = path.dirname(transaction.manifestPath);
    if (!isPathInside(roots.disabledRoot, container) || !sameWindowsPath(path.dirname(container), roots.disabledRoot) || !sameWindowsPath(path.join(container, "skill"), transaction.backupDirectory)) {
      throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
    }
  } else throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
}

function trackedSource(value: unknown): TrackedSkillSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<TrackedSkillSource>;
  const fields = [record.skillDirectory, record.sourceUrl, record.repository, record.ref, record.sourceDirectory, record.revision, record.upstreamFingerprint, record.localFingerprint, record.trackedAt];
  return fields.every((field) => typeof field === "string" && field.length > 0) ? record as TrackedSkillSource : undefined;
}

async function reconcileUpdateTracking(transaction: LifecycleTransaction, outcome: "committed" | "rolled-back", options: TransactionOptions): Promise<void> {
  if (!transaction.manifestPath || !transaction.originalDirectory) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  const document = JSON.parse(await readFile(transaction.manifestPath, "utf8")) as { trackingRecord?: unknown; previousTracking?: unknown };
  const next = trackedSource(document.trackingRecord);
  const previous = trackedSource(document.previousTracking);
  const expectedKey = skillDirectoryKey(transaction.originalDirectory, options).replaceAll("\\", "/").toLocaleLowerCase();
  if (!next || next.skillDirectory.replaceAll("\\", "/").toLocaleLowerCase() !== expectedKey) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  if (previous && previous.skillDirectory.replaceAll("\\", "/").toLocaleLowerCase() !== expectedKey) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  if (outcome === "committed") await recordTrackedSource(next, options);
  else if (previous) await recordTrackedSource(previous, options);
  else await removeTrackedSource(transaction.originalDirectory, options);
}

async function retryTransaction(location: string, options: TransactionOptions): Promise<"committed" | "rolled-back"> {
  const roots = resolveLifecycleStorageRoots(options);
  const expectedJournal = path.resolve(location);
  if (!isPathInside(roots.transactionRoot, expectedJournal) || !sameWindowsPath(path.dirname(expectedJournal), roots.transactionRoot)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  const value = JSON.parse(await readFile(expectedJournal, "utf8")) as unknown;
  if (!isLifecycleTransaction(value)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  const transaction = value;
  validateTransactionPaths(transaction, options);
  return withLifecycleLock(transaction.originalDirectory!, async () => {
    const original = await fingerprint(transaction.originalDirectory!);
    const backup = await fingerprint(transaction.backupDirectory!);
    let outcome: "committed" | "rolled-back";
    if (transaction.operation === "update") {
      if (original === transaction.targetFingerprint && backup === transaction.expectedFingerprint) outcome = "committed";
      else if (original === transaction.expectedFingerprint) outcome = "rolled-back";
      else if (!original && backup === transaction.expectedFingerprint) {
        await mkdir(path.dirname(transaction.originalDirectory!), { recursive: true });
        await rename(transaction.backupDirectory!, transaction.originalDirectory!);
        if (await fingerprint(transaction.originalDirectory!) !== transaction.expectedFingerprint) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
        outcome = "rolled-back";
      } else throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
    } else if (transaction.operation === "disable") {
      if (!original && backup === transaction.expectedFingerprint) outcome = "committed";
      else if (original === transaction.expectedFingerprint) outcome = "rolled-back";
      else throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
    } else {
      if (original === transaction.expectedFingerprint && !backup) outcome = "committed";
      else if (!original && backup === transaction.expectedFingerprint) outcome = "rolled-back";
      else throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
    }
    if (transaction.operation === "update") await reconcileUpdateTracking(transaction, outcome, options);
    transaction.state = outcome;
    transaction.updatedAt = new Date().toISOString();
    transaction.failure = undefined;
    await persistLifecycleTransaction(transaction, options);
    return outcome;
  });
}

export async function executeRecoveryAction(
  input: { issueId: string; action: LifecycleRecoveryAction },
  options: TransactionOptions = {},
): Promise<RecoveryActionResult> {
  const overview = await inspectLifecycleRecovery(options);
  const issue = overview.issues.find((entry) => entry.id === input.issueId);
  if (!issue || !issue.availableActions?.includes(input.action)) throw new SkillAtlasError("RECOVERY_ACTION_FAILED");
  if (input.action === "restore-quarantine") {
    await restoreQuarantine(issue.location, options);
    return { issueId: input.issueId, action: input.action, outcome: "restored", transactionId: issue.transactionId };
  }
  if (input.action === "clean-staging") {
    await cleanStaging(issue.location, options);
    return { issueId: input.issueId, action: input.action, outcome: "cleaned", transactionId: issue.transactionId };
  }
  const outcome = await retryTransaction(issue.location, options);
  return { issueId: input.issueId, action: input.action, outcome, transactionId: issue.transactionId };
}

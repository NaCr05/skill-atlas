import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { listMigrationArchives, type MigrationArchiveOverview } from "@/core/issues/migration-archive";
import { snapshotLocalSkill } from "@/core/lifecycle/fingerprint";
import { listDisabledSkills } from "@/core/lifecycle/skill-state";
import { resolveLifecycleStorageRoots, sameWindowsPath, type LifecycleStorageOptions } from "@/core/lifecycle/storage";
import { writeJsonAtomically } from "@/core/lifecycle/transaction-store";
import type { DisabledSkillRecord, LifecycleTransaction, SkillFingerprint } from "@/core/lifecycle/types";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { isPathInside } from "@/core/skills/paths";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/;
const MAX_FILES = 500;

export type ManagedStorageKind = "update-backup" | "disabled";

export interface ManagedStorageEntry {
  kind: ManagedStorageKind;
  id: string;
  skillId: string;
  skillName: string;
  directory: string;
  container: string;
  createdAt?: string;
  fingerprint: SkillFingerprint;
  cleanupAllowed: boolean;
  diagnostic?: string;
}

export interface StorageOverview {
  inspectedAt: string;
  totalBytes: number;
  roots: { backups: string; disabled: string; migrations: string };
  updateBackups: ManagedStorageEntry[];
  disabled: ManagedStorageEntry[];
  migrations: MigrationArchiveOverview;
}

export interface StorageCleanupReview {
  planId: string;
  expiresAt: string;
  kind: ManagedStorageKind;
  id: string;
  skillName: string;
  directory: string;
  fingerprint: SkillFingerprint;
  confirmationText: string;
}

interface InternalCleanupPlan extends StorageCleanupReview { container: string }

export interface StorageCleanupResult {
  kind: ManagedStorageKind;
  id: string;
  skillName: string;
  purgedAt: string;
  fileCount: number;
  totalBytes: number;
  recoverable: false;
}

const cleanupPlans = getReviewPlanStore<InternalCleanupPlan>("storage-cleanup");

async function exists(location: string): Promise<boolean> {
  try { await stat(location); return true; } catch { return false; }
}

async function readTransaction(id: string, options: LifecycleStorageOptions): Promise<LifecycleTransaction | undefined> {
  try {
    const location = path.join(resolveLifecycleStorageRoots(options).transactionRoot, `${id}.json`);
    return JSON.parse(await readFile(location, "utf8")) as LifecycleTransaction;
  } catch { return undefined; }
}

async function listUpdateBackups(options: LifecycleStorageOptions): Promise<ManagedStorageEntry[]> {
  const root = resolveLifecycleStorageRoots(options).backupRoot;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  return (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry): Promise<ManagedStorageEntry | undefined> => {
    if (!SAFE_ID.test(entry.name)) return undefined;
    const container = path.join(root, entry.name);
    const directory = path.join(container, "skill");
    try {
      const manifest = JSON.parse(await readFile(path.join(container, "manifest.json"), "utf8")) as {
        transactionId?: string; skillId?: string; skillName?: string; previousFingerprint?: string;
      };
      if (manifest.transactionId !== entry.name || !manifest.skillId || !manifest.skillName || !manifest.previousFingerprint) return undefined;
      const snapshot = await snapshotLocalSkill(directory, { maxFiles: MAX_FILES });
      const transaction = await readTransaction(entry.name, options);
      const consistent = snapshot.fingerprint.complete && snapshot.fingerprint.value === manifest.previousFingerprint;
      const committed = transaction?.state === "committed" || transaction?.state === "rolled-back";
      const createdAt = (await stat(container)).birthtime.toISOString();
      return {
        kind: "update-backup", id: entry.name, skillId: manifest.skillId, skillName: manifest.skillName,
        directory, container, createdAt, fingerprint: snapshot.fingerprint,
        cleanupAllowed: consistent && committed,
        diagnostic: !consistent ? "Backup fingerprint does not match its manifest." : !committed ? "The related transaction is not in a final state." : undefined,
      };
    } catch { return undefined; }
  }))).filter((entry): entry is ManagedStorageEntry => Boolean(entry)).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function disabledEntry(record: DisabledSkillRecord): ManagedStorageEntry {
  return {
    kind: "disabled", id: record.disabledId, skillId: record.skillId, skillName: record.skillName,
    directory: record.disabledDirectory, container: path.dirname(record.disabledDirectory), createdAt: record.disabledAt,
    fingerprint: record.fingerprint, cleanupAllowed: record.state === "committed" || record.state === "failed",
  };
}

export async function inspectManagedStorage(options: LifecycleStorageOptions = {}): Promise<StorageOverview> {
  const roots = resolveLifecycleStorageRoots(options);
  const [updateBackups, disabledRecords, migrations] = await Promise.all([
    listUpdateBackups(options), listDisabledSkills(options), listMigrationArchives(options),
  ]);
  const disabled = disabledRecords.map(disabledEntry);
  return {
    inspectedAt: new Date().toISOString(),
    totalBytes: updateBackups.reduce((sum, entry) => sum + entry.fingerprint.totalBytes, 0)
      + disabled.reduce((sum, entry) => sum + entry.fingerprint.totalBytes, 0) + migrations.totalBytes,
    roots: { backups: roots.backupRoot, disabled: roots.disabledRoot, migrations: roots.migrationRoot },
    updateBackups, disabled, migrations,
  };
}

async function findEntry(kind: ManagedStorageKind, id: string, options: LifecycleStorageOptions): Promise<ManagedStorageEntry> {
  if (!SAFE_ID.test(id)) throw new SkillAtlasError("STORAGE_ENTRY_INVALID");
  const overview = await inspectManagedStorage(options);
  const entry = (kind === "update-backup" ? overview.updateBackups : overview.disabled).find((item) => item.id === id);
  if (!entry || !entry.cleanupAllowed) throw new SkillAtlasError("STORAGE_ENTRY_INVALID");
  const expectedRoot = kind === "update-backup" ? resolveLifecycleStorageRoots(options).backupRoot : resolveLifecycleStorageRoots(options).disabledRoot;
  if (!isPathInside(expectedRoot, entry.container) || !sameWindowsPath(path.dirname(entry.container), expectedRoot) || !sameWindowsPath(path.dirname(entry.directory), entry.container)) throw new SkillAtlasError("STORAGE_ENTRY_INVALID");
  return entry;
}

export async function inspectStorageCleanup(kind: ManagedStorageKind, id: string, options: LifecycleStorageOptions & { now?: Date } = {}): Promise<StorageCleanupReview> {
  const entry = await findEntry(kind, id, options);
  const now = options.now || new Date();
  const plan: InternalCleanupPlan = {
    planId: randomUUID(), expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), kind, id,
    skillName: entry.skillName, directory: entry.directory, container: entry.container,
    fingerprint: entry.fingerprint, confirmationText: entry.skillName,
  };
  cleanupPlans.put(plan.planId, plan, now);
  const { container: _container, ...review } = plan;
  void _container;
  return review;
}

export async function confirmStorageCleanup(input: { planId: string; confirmationText: string }, options: LifecycleStorageOptions & { now?: Date; idFactory?: () => string } = {}): Promise<StorageCleanupResult> {
  const now = options.now || new Date();
  const consumed = cleanupPlans.consume(input.planId, now);
  if (consumed.status !== "ready") throw new SkillAtlasError("STORAGE_PLAN_INVALID");
  const plan = consumed.plan;
  if (input.confirmationText !== plan.confirmationText) throw new SkillAtlasError("STORAGE_CONFIRMATION_MISMATCH");
  const entry = await findEntry(plan.kind, plan.id, options);
  if (!sameWindowsPath(entry.container, plan.container) || !sameWindowsPath(entry.directory, plan.directory)) throw new SkillAtlasError("STORAGE_STATE_CHANGED");
  const snapshot = await snapshotLocalSkill(entry.directory, { maxFiles: MAX_FILES });
  if (!snapshot.fingerprint.complete || snapshot.fingerprint.value !== plan.fingerprint.value) throw new SkillAtlasError("STORAGE_STATE_CHANGED");
  const roots = resolveLifecycleStorageRoots(options);
  const quarantine = path.join(roots.storagePurgeRoot, (options.idFactory || randomUUID)());
  if (!isPathInside(roots.storagePurgeRoot, quarantine) || sameWindowsPath(quarantine, roots.storagePurgeRoot) || await exists(quarantine)) throw new SkillAtlasError("STORAGE_STATE_CHANGED");
  const metadata = await lstat(entry.container);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new SkillAtlasError("STORAGE_STATE_CHANGED");
  await mkdir(roots.storagePurgeRoot, { recursive: true });
  await rename(entry.container, quarantine);
  try {
    const movedDirectory = path.join(quarantine, path.relative(entry.container, entry.directory));
    const moved = await snapshotLocalSkill(movedDirectory, { maxFiles: MAX_FILES });
    if (!moved.fingerprint.complete || moved.fingerprint.value !== plan.fingerprint.value) throw new SkillAtlasError("STORAGE_STATE_CHANGED");
    await rm(quarantine, { recursive: true, force: false });
    await writeJsonAtomically(path.join(roots.atlasRoot, "last-storage-cleanup.json"), {
      version: 1, kind: plan.kind, id: plan.id, skillName: plan.skillName, purgedAt: now.toISOString(), fingerprint: plan.fingerprint,
    });
  } catch (error) {
    if (!(await exists(entry.container)) && await exists(quarantine)) await rename(quarantine, entry.container).catch(() => undefined);
    throw error;
  }
  return { kind: plan.kind, id: plan.id, skillName: plan.skillName, purgedAt: now.toISOString(), fileCount: plan.fingerprint.fileCount, totalBytes: plan.fingerprint.totalBytes, recoverable: false };
}

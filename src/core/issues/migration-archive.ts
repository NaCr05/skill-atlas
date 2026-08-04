import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { snapshotLocalSkill } from "@/core/lifecycle/fingerprint";
import { resolveLifecycleStorageRoots, sameWindowsPath } from "@/core/lifecycle/storage";
import { resolveTransactionWriter, withLifecycleLock, writeJsonAtomically, type TransactionOptions } from "@/core/lifecycle/transaction-store";
import type { LifecycleTransaction, SkillFingerprint } from "@/core/lifecycle/types";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { isPathInside, resolveCodexEnvironment } from "@/core/skills/paths";

const MAX_FILES = 500;
const PLAN_TTL_MS = 10 * 60_000;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/;

export interface MigrationArchiveRecord {
  version: 1;
  migrationId: string;
  skillId: string;
  skillName: string;
  originalDirectory: string;
  archivedDirectory: string;
  migratedAt: string;
  fingerprint: SkillFingerprint;
  state?: "archived" | "restored";
  restoredAt?: string;
}

export interface MigrationArchiveEntry {
  migrationId: string;
  skillId?: string;
  skillName: string;
  originalDirectory?: string;
  archivedDirectory: string;
  migratedAt?: string;
  fingerprint?: SkillFingerprint;
  health: "ready" | "invalid";
  restorable: boolean;
  purgeAllowed: boolean;
  diagnostic?: string;
}

export interface MigrationArchiveOverview {
  rootPath: string;
  count: number;
  totalBytes: number;
  records: MigrationArchiveEntry[];
}

export interface MigrationArchiveRestoreResult {
  migrationId: string;
  skillId: string;
  skillName: string;
  restoredDirectory: string;
  restoredAt: string;
  fileCount: number;
  totalBytes: number;
}

export interface MigrationArchivePurgeReview {
  planId: string;
  expiresAt: string;
  migrationId: string;
  skillId: string;
  skillName: string;
  archivedDirectory: string;
  fingerprint: SkillFingerprint;
  confirmationText: string;
  purgeAllowed: true;
}

interface InternalPurgePlan extends MigrationArchivePurgeReview { container: string }
export interface MigrationArchivePurgeResult {
  migrationId: string;
  skillId: string;
  skillName: string;
  purgedAt: string;
  fileCount: number;
  totalBytes: number;
  auditTransactionId: string;
  auditStatus: "recorded" | "incomplete";
  auditWarning?: string;
  recoverable: false;
}

export interface MigrationArchiveOptions extends TransactionOptions {
  now?: Date;
  idFactory?: () => string;
  purgeRemover?: (location: string) => Promise<void>;
  checkpoint?: (state: "moved" | "verified") => void | Promise<void>;
}

export const migrationArchivePurgePlans = getReviewPlanStore<InternalPurgePlan>("migration-archive-purge");

function diagnostic(error: unknown): string { return error instanceof Error ? error.message : String(error); }
async function exists(location: string) { try { await stat(location); return true; } catch { return false; } }
function containerPath(migrationId: string, options: TransactionOptions): string {
  if (!SAFE_ID.test(migrationId)) throw new SkillAtlasError("MIGRATION_ARCHIVE_READ_FAILED");
  return path.join(resolveLifecycleStorageRoots(options).migrationRoot, migrationId);
}
function manifestPath(migrationId: string, options: TransactionOptions): string { return path.join(containerPath(migrationId, options), "manifest.json"); }

function fingerprintValid(value: unknown): value is SkillFingerprint {
  const item = value as Partial<SkillFingerprint> | undefined;
  return Boolean(item && item.algorithm === "sha256-manifest-v1" && typeof item.value === "string" && /^[a-f0-9]{64}$/i.test(item.value) && Number.isSafeInteger(item.fileCount) && Number.isSafeInteger(item.totalBytes) && typeof item.complete === "boolean");
}

function recordValid(value: unknown): value is MigrationArchiveRecord {
  const record = value as Partial<MigrationArchiveRecord> | undefined;
  return Boolean(record && record.version === 1 && SAFE_ID.test(record.migrationId || "") && typeof record.skillId === "string" && typeof record.skillName === "string" && typeof record.originalDirectory === "string" && typeof record.archivedDirectory === "string" && typeof record.migratedAt === "string" && fingerprintValid(record.fingerprint) && (record.state === undefined || record.state === "archived" || record.state === "restored"));
}

async function assertDirectContainer(root: string, location: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(location);
  if (!isPathInside(resolvedRoot, resolved) || !sameWindowsPath(path.dirname(resolved), resolvedRoot)) throw new Error("Archive container is outside the private migration root.");
  const details = await lstat(resolved);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Archive container is not an ordinary directory.");
  const [realRoot, realLocation] = await Promise.all([realpath(resolvedRoot), realpath(resolved)]);
  if (!isPathInside(realRoot, realLocation) || !sameWindowsPath(path.dirname(realLocation), realRoot)) throw new Error("Archive container resolves outside the private migration root.");
}

async function assertArchivedSkill(record: MigrationArchiveRecord, options: MigrationArchiveOptions): Promise<string> {
  const container = containerPath(record.migrationId, options);
  await assertDirectContainer(resolveLifecycleStorageRoots(options).migrationRoot, container);
  const expected = path.join(container, "skill");
  if (!sameWindowsPath(expected, record.archivedDirectory)) throw new Error("Archive manifest path does not match its container.");
  const details = await lstat(expected);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Archived Skill is not an ordinary directory.");
  const realContainer = await realpath(container);
  const realSkill = await realpath(expected);
  if (!isPathInside(realContainer, realSkill) || !sameWindowsPath(path.dirname(realSkill), realContainer)) throw new Error("Archived Skill resolves outside its container.");
  const snapshot = await snapshotLocalSkill(expected, { maxFiles: MAX_FILES });
  if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length || snapshot.fingerprint.value !== record.fingerprint.value) throw new Error("Archived Skill fingerprint does not match its manifest.");
  return expected;
}

async function readRecord(migrationId: string, options: MigrationArchiveOptions): Promise<MigrationArchiveRecord> {
  const parsed = JSON.parse(await readFile(manifestPath(migrationId, options), "utf8")) as unknown;
  if (!recordValid(parsed) || parsed.migrationId !== migrationId || parsed.state === "restored") throw new Error("Migration archive manifest is invalid or inactive.");
  await assertArchivedSkill(parsed, options);
  return parsed;
}

function assertCompatibilityTarget(target: string, options: MigrationArchiveOptions): void {
  const resolved = path.resolve(target);
  const source = resolveCodexEnvironment(options.env, options.homeDirectory).sources.find((entry) => entry.kind === "compatibility" && entry.permission === "migration-only" && sameWindowsPath(path.dirname(resolved), entry.rootPath));
  if (!source || !isPathInside(source.rootPath, resolved)) throw new SkillAtlasError("MIGRATION_ARCHIVE_RESTORE_FAILED");
}

export function createMigrationArchiveRecord(input: Omit<MigrationArchiveRecord, "version" | "state">): MigrationArchiveRecord {
  return { version: 1, state: "archived", ...input };
}

export async function writeMigrationArchiveRecord(record: MigrationArchiveRecord, options: TransactionOptions = {}): Promise<void> {
  await writeJsonAtomically(manifestPath(record.migrationId, options), record);
}

export async function listMigrationArchives(options: MigrationArchiveOptions = {}): Promise<MigrationArchiveOverview> {
  const root = resolveLifecycleStorageRoots(options).migrationRoot;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rootPath: root, count: 0, totalBytes: 0, records: [] };
    throw new SkillAtlasError("MIGRATION_ARCHIVE_READ_FAILED", { cause: error });
  }
  const records = await Promise.all(entries.map(async (entry): Promise<MigrationArchiveEntry | undefined> => {
    const archivedDirectory = path.join(root, entry.name, "skill");
    try {
      if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) throw new Error("Archive entry is not a supported direct directory.");
      const record = await readRecord(entry.name, options);
      return { ...record, health: "ready", restorable: true, purgeAllowed: true };
    } catch (error) {
      try {
        const parsed = JSON.parse(await readFile(path.join(root, entry.name, "manifest.json"), "utf8")) as unknown;
        if (recordValid(parsed) && parsed.state === "restored") return undefined;
      } catch { /* Keep malformed entries visible. */ }
      return { migrationId: entry.name, skillName: entry.name, archivedDirectory, health: "invalid", restorable: false, purgeAllowed: false, diagnostic: diagnostic(error) };
    }
  }));
  const visible = records.filter((record): record is MigrationArchiveEntry => Boolean(record)).sort((left, right) => Date.parse(right.migratedAt || "") - Date.parse(left.migratedAt || ""));
  return { rootPath: root, count: visible.length, totalBytes: visible.reduce((total, record) => total + (record.fingerprint?.totalBytes || 0), 0), records: visible };
}

export async function restoreMigrationArchive(migrationId: string, options: MigrationArchiveOptions = {}): Promise<MigrationArchiveRestoreResult> {
  const record = await readRecord(migrationId, options).catch((error) => { throw new SkillAtlasError("MIGRATION_ARCHIVE_RESTORE_FAILED", { cause: error }); });
  assertCompatibilityTarget(record.originalDirectory, options);
  return withLifecycleLock(record.originalDirectory, async () => {
    if (await exists(record.originalDirectory)) throw new SkillAtlasError("MIGRATION_ARCHIVE_RESTORE_FAILED");
    const archived = await assertArchivedSkill(record, options);
    const now = options.now || new Date();
    const transactionId = (options.idFactory || randomUUID)();
    const transaction: LifecycleTransaction = { id: transactionId, operation: "restore-migration", skillId: record.skillId, skillName: record.skillName, state: "planned", createdAt: now.toISOString(), updatedAt: now.toISOString(), expectedFingerprint: record.fingerprint.value, originalDirectory: record.originalDirectory, backupDirectory: archived, manifestPath: manifestPath(migrationId, options) };
    const writer = resolveTransactionWriter(options);
    let moved = false;
    try {
      await writer(transaction);
      await rename(archived, record.originalDirectory); moved = true; await options.checkpoint?.("moved");
      const restored = await snapshotLocalSkill(record.originalDirectory, { maxFiles: MAX_FILES });
      if (!restored.fingerprint.complete || restored.unsupportedPaths.length || restored.fingerprint.value !== record.fingerprint.value) throw new Error("Restored Skill fingerprint mismatch.");
      await options.checkpoint?.("verified");
      record.state = "restored"; record.restoredAt = now.toISOString();
      await writeMigrationArchiveRecord(record, options);
      transaction.state = "committed"; transaction.updatedAt = new Date().toISOString(); await writer(transaction);
      await rm(containerPath(migrationId, options), { recursive: true, force: true }).catch(() => undefined);
      return { migrationId, skillId: record.skillId, skillName: record.skillName, restoredDirectory: record.originalDirectory, restoredAt: record.restoredAt, fileCount: record.fingerprint.fileCount, totalBytes: record.fingerprint.totalBytes };
    } catch (error) {
      if (moved && !(await exists(archived))) {
        try {
          await rename(record.originalDirectory, archived);
          await assertArchivedSkill({ ...record, state: "archived", restoredAt: undefined }, options);
          record.state = "archived"; record.restoredAt = undefined; await writeMigrationArchiveRecord(record, options);
          transaction.state = "rolled-back";
        } catch { transaction.state = "failed"; }
      } else transaction.state = "failed";
      transaction.failure = diagnostic(error); transaction.updatedAt = new Date().toISOString(); await writer(transaction).catch(() => undefined);
      throw new SkillAtlasError("MIGRATION_ARCHIVE_RESTORE_FAILED", { cause: error });
    }
  });
}

export async function inspectMigrationArchivePurge(migrationId: string, options: MigrationArchiveOptions = {}): Promise<MigrationArchivePurgeReview> {
  const record = await readRecord(migrationId, options).catch((error) => { throw new SkillAtlasError("MIGRATION_ARCHIVE_PURGE_INSPECTION_FAILED", { cause: error }); });
  const now = options.now || new Date();
  const planId = (options.idFactory || randomUUID)();
  const plan: InternalPurgePlan = { planId, expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(), migrationId, skillId: record.skillId, skillName: record.skillName, archivedDirectory: record.archivedDirectory, fingerprint: record.fingerprint, confirmationText: record.skillName, purgeAllowed: true, container: containerPath(migrationId, options) };
  migrationArchivePurgePlans.put(planId, plan, now);
  const { container: _container, ...review } = plan; void _container; return review;
}

export async function confirmMigrationArchivePurge(input: { planId: string; confirmationText: string }, options: MigrationArchiveOptions = {}): Promise<MigrationArchivePurgeResult> {
  const now = options.now || new Date();
  const consumed = migrationArchivePurgePlans.consume(input.planId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("MIGRATION_ARCHIVE_PURGE_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("MIGRATION_ARCHIVE_PURGE_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (input.confirmationText !== plan.confirmationText) throw new SkillAtlasError("MIGRATION_ARCHIVE_PURGE_CONFIRMATION_MISMATCH");
  return withLifecycleLock(plan.container, async () => {
    const record = await readRecord(plan.migrationId, options);
    if (record.skillId !== plan.skillId || record.skillName !== plan.skillName || record.fingerprint.value !== plan.fingerprint.value || !sameWindowsPath(record.archivedDirectory, plan.archivedDirectory)) throw new SkillAtlasError("MIGRATION_ARCHIVE_PURGE_FAILED");
    const transactionId = (options.idFactory || randomUUID)();
    const roots = resolveLifecycleStorageRoots(options);
    const quarantine = path.join(roots.migrationPurgeRoot, transactionId);
    if (!sameWindowsPath(path.dirname(quarantine), roots.migrationPurgeRoot) || await exists(quarantine)) throw new SkillAtlasError("MIGRATION_ARCHIVE_PURGE_FAILED");
    const transaction: LifecycleTransaction = { id: transactionId, operation: "purge-migration", skillId: record.skillId, skillName: record.skillName, state: "planned", createdAt: now.toISOString(), updatedAt: now.toISOString(), expectedFingerprint: record.fingerprint.value, originalDirectory: plan.container, backupDirectory: quarantine, manifestPath: path.join(quarantine, "manifest.json") };
    const writer = resolveTransactionWriter(options);
    let quarantined = false;
    try {
      await writer(transaction); await mkdir(roots.migrationPurgeRoot, { recursive: true }); await rename(plan.container, quarantine); quarantined = true;
      const snapshot = await snapshotLocalSkill(path.join(quarantine, "skill"), { maxFiles: MAX_FILES });
      if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length || snapshot.fingerprint.value !== plan.fingerprint.value) throw new Error("Quarantined archive fingerprint mismatch.");
      transaction.state = "staged"; transaction.updatedAt = new Date().toISOString(); await writer(transaction);
      const remover = options.purgeRemover || ((location: string) => rm(location, { recursive: true, force: false, maxRetries: 2, retryDelay: 100 }));
      await remover(quarantine);
      if (await exists(quarantine)) throw new Error("Migration purge quarantine still exists.");
      transaction.state = "committed"; transaction.updatedAt = new Date().toISOString();
      let auditStatus: MigrationArchivePurgeResult["auditStatus"] = "recorded";
      let auditWarning: string | undefined;
      try {
        await writer(transaction);
      } catch (auditError) {
        auditStatus = "incomplete";
        auditWarning = `The archive was permanently removed, but the final audit record could not be written: ${diagnostic(auditError)}`;
      }
      return {
        migrationId: plan.migrationId,
        skillId: plan.skillId,
        skillName: plan.skillName,
        purgedAt: now.toISOString(),
        fileCount: plan.fingerprint.fileCount,
        totalBytes: plan.fingerprint.totalBytes,
        auditTransactionId: transactionId,
        auditStatus,
        auditWarning,
        recoverable: false,
      };
    } catch (error) {
      if (quarantined && await exists(quarantine)) {
        try {
          const remaining = await snapshotLocalSkill(path.join(quarantine, "skill"), { maxFiles: MAX_FILES });
          if (!remaining.fingerprint.complete || remaining.unsupportedPaths.length || remaining.fingerprint.value !== plan.fingerprint.value || await exists(plan.container)) throw new Error("Quarantine is not intact for rollback.");
          await rename(quarantine, plan.container); await readRecord(plan.migrationId, options); transaction.state = "rolled-back";
        } catch { transaction.state = "failed"; }
      } else transaction.state = "failed";
      transaction.failure = diagnostic(error); transaction.updatedAt = new Date().toISOString(); await writer(transaction).catch(() => undefined);
      throw new SkillAtlasError("MIGRATION_ARCHIVE_PURGE_FAILED", { cause: error });
    }
  });
}

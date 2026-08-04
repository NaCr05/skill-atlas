import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Dirent } from "node:fs";

import { isPathInside } from "@/core/skills/paths";
import { snapshotLocalSkill } from "./fingerprint";
import { isLifecycleTransaction, isTrashedSkillRecord } from "./records";
import {
  resolveLifecycleStorageRoots,
  sameWindowsPath,
  type LifecycleStorageOptions,
} from "./storage";
import type {
  LifecycleRecoveryIssue,
  LifecycleRecoveryOverview,
  LifecycleTransaction,
  TrashedSkillRecord,
} from "./types";

const MAX_FILES = 500;
const ACTIVE_TRANSACTION_GRACE_MS = 2 * 60_000;

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function issue(
  value: Omit<LifecycleRecoveryIssue, "id"> & { id?: string },
): LifecycleRecoveryIssue {
  return {
    ...value,
    id: value.id || `${value.code}:${value.location}`,
  };
}

async function directEntries(
  root: string,
): Promise<{ entries: Dirent[]; error?: string }> {
  try {
    return { entries: await readdir(root, { withFileTypes: true }) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { entries: [] };
    return { entries: [], error: diagnostic(error) };
  }
}

async function assertDirectOrdinaryDirectory(root: string, location: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedLocation = path.resolve(location);
  if (
    !isPathInside(resolvedRoot, resolvedLocation) ||
    sameWindowsPath(resolvedRoot, resolvedLocation) ||
    !sameWindowsPath(path.dirname(resolvedLocation), resolvedRoot)
  ) {
    throw new Error("目录不在允许的生命周期存储根目录中。");
  }
  const details = await lstat(resolvedLocation);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("生命周期记录不是普通目录。");
  }
  const [realRoot, realLocation] = await Promise.all([
    realpath(resolvedRoot),
    realpath(resolvedLocation),
  ]);
  if (!isPathInside(realRoot, realLocation) || sameWindowsPath(realRoot, realLocation)) {
    throw new Error("生命周期记录的真实路径超出安全目录。");
  }
}

async function readTrashRecord(location: string): Promise<TrashedSkillRecord> {
  const value = JSON.parse(await readFile(path.join(location, "manifest.json"), "utf8")) as unknown;
  if (!isTrashedSkillRecord(value)) throw new Error("manifest.json 格式不受支持。");
  return value;
}

async function scanTrash(root: string): Promise<LifecycleRecoveryIssue[]> {
  const issues: LifecycleRecoveryIssue[] = [];
  const listing = await directEntries(root);
  if (listing.error) {
    return [issue({
      code: "trash-root-unreadable",
      category: "trash",
      severity: "danger",
      recoverability: "manual-review",
      location: root,
      diagnostic: listing.error,
    })];
  }

  for (const entry of listing.entries) {
    const location = path.join(root, entry.name);
    if (!entry.isDirectory()) {
      issues.push(issue({
        code: "trash-entry-unsafe",
        category: "trash",
        severity: "warning",
        recoverability: "manual-review",
        location,
      }));
      continue;
    }
    try {
      await assertDirectOrdinaryDirectory(root, location);
    } catch (error) {
      issues.push(issue({
        code: "trash-entry-unsafe",
        category: "trash",
        severity: "danger",
        recoverability: "manual-review",
        location,
        diagnostic: diagnostic(error),
      }));
      continue;
    }

    let record: TrashedSkillRecord;
    try {
      record = await readTrashRecord(location);
    } catch (error) {
      issues.push(issue({
        code: "trash-manifest-invalid",
        category: "trash",
        severity: "danger",
        recoverability: "manual-review",
        location,
        transactionId: entry.name,
        diagnostic: diagnostic(error),
      }));
      continue;
    }

    if (record.state === "restored") continue;
    if (record.state === "planned") {
      issues.push(issue({
        code: "trash-operation-incomplete",
        category: "trash",
        severity: "warning",
        recoverability: "manual-review",
        location,
        transactionId: record.trashId,
        skillName: record.skillName,
        state: record.state,
        detectedAt: record.deletedAt,
      }));
      continue;
    }

    const expectedSkillDirectory = path.join(location, "skill");
    if (!sameWindowsPath(record.trashDirectory, expectedSkillDirectory)) {
      issues.push(issue({
        code: "trash-path-mismatch",
        category: "trash",
        severity: "danger",
        recoverability: "manual-review",
        location,
        relatedPath: record.trashDirectory,
        transactionId: record.trashId,
        skillName: record.skillName,
        state: record.state,
      }));
      continue;
    }

    try {
      await assertDirectOrdinaryDirectory(location, expectedSkillDirectory);
      const snapshot = await snapshotLocalSkill(expectedSkillDirectory, { maxFiles: MAX_FILES });
      if (
        !snapshot.fingerprint.complete ||
        snapshot.unsupportedPaths.length ||
        snapshot.fingerprint.value !== record.fingerprint.value
      ) {
        issues.push(issue({
          code: "trash-fingerprint-mismatch",
          category: "trash",
          severity: "danger",
          recoverability: "manual-review",
          location: expectedSkillDirectory,
          transactionId: record.trashId,
          skillName: record.skillName,
          state: record.state,
          detectedAt: record.deletedAt,
        }));
      } else if (record.state === "failed") {
        issues.push(issue({
          code: "trash-record-failed",
          category: "trash",
          severity: "warning",
          recoverability: "safe-restore",
          location: expectedSkillDirectory,
          transactionId: record.trashId,
          skillName: record.skillName,
          state: record.state,
          detectedAt: record.deletedAt,
          diagnostic: record.failure,
        }));
      }
    } catch (error) {
      issues.push(issue({
        code: "trash-skill-missing",
        category: "trash",
        severity: "danger",
        recoverability: "manual-review",
        location: expectedSkillDirectory,
        transactionId: record.trashId,
        skillName: record.skillName,
        state: record.state,
        detectedAt: record.deletedAt,
        diagnostic: diagnostic(error),
      }));
    }
  }
  return issues;
}

async function scanQuarantine(root: string): Promise<LifecycleRecoveryIssue[]> {
  const listing = await directEntries(root);
  if (listing.error) {
    return [issue({
      code: "purge-root-unreadable",
      category: "quarantine",
      severity: "danger",
      recoverability: "manual-review",
      location: root,
      diagnostic: listing.error,
    })];
  }
  const issues: LifecycleRecoveryIssue[] = [];
  for (const entry of listing.entries) {
    const location = path.join(root, entry.name);
    try {
      if (!entry.isDirectory()) throw new Error("隔离区条目不是普通目录。");
      await assertDirectOrdinaryDirectory(root, location);
    } catch (error) {
      issues.push(issue({
        code: "purge-entry-unsafe",
        category: "quarantine",
        severity: "danger",
        recoverability: "manual-review",
        location,
        transactionId: entry.name,
        diagnostic: diagnostic(error),
      }));
      continue;
    }

    let record: TrashedSkillRecord;
    try {
      record = await readTrashRecord(location);
    } catch (error) {
      issues.push(issue({
        code: "purge-manifest-invalid",
        category: "quarantine",
        severity: "danger",
        recoverability: "manual-review",
        location,
        transactionId: entry.name,
        diagnostic: diagnostic(error),
      }));
      continue;
    }

    const skillDirectory = path.join(location, "skill");
    try {
      await assertDirectOrdinaryDirectory(location, skillDirectory);
      const snapshot = await snapshotLocalSkill(skillDirectory, { maxFiles: MAX_FILES });
      const intact = snapshot.fingerprint.complete &&
        !snapshot.unsupportedPaths.length &&
        snapshot.fingerprint.value === record.fingerprint.value;
      issues.push(issue({
        code: intact ? "purge-quarantine-intact" : "purge-quarantine-partial",
        category: "quarantine",
        severity: intact ? "warning" : "danger",
        recoverability: intact ? "safe-restore" : "manual-review",
        availableActions: intact ? ["restore-quarantine"] : undefined,
        location,
        relatedPath: path.dirname(record.trashDirectory),
        transactionId: entry.name,
        skillName: record.skillName,
        state: record.state,
        detectedAt: record.deletedAt,
      }));
    } catch (error) {
      issues.push(issue({
        code: "purge-quarantine-partial",
        category: "quarantine",
        severity: "danger",
        recoverability: "manual-review",
        location,
        relatedPath: path.dirname(record.trashDirectory),
        transactionId: entry.name,
        skillName: record.skillName,
        state: record.state,
        detectedAt: record.deletedAt,
        diagnostic: diagnostic(error),
      }));
    }
  }
  return issues;
}

function transactionIssue(
  transaction: LifecycleTransaction,
  location: string,
  now: Date,
): LifecycleRecoveryIssue | undefined {
  if (transaction.state === "failed") {
    const retryable = ["update", "disable", "enable"].includes(transaction.operation);
    return issue({
      code: "transaction-failed",
      category: "transaction",
      severity: "danger",
      recoverability: retryable ? "safe-retry" : "audit-only",
      availableActions: retryable ? ["retry-transaction"] : undefined,
      location,
      transactionId: transaction.id,
      skillName: transaction.skillName,
      operation: transaction.operation,
      state: transaction.state,
      detectedAt: transaction.updatedAt || transaction.createdAt,
      relatedPath: transaction.backupDirectory,
      diagnostic: transaction.failure,
    });
  }
  if (!["planned", "staged", "backed-up"].includes(transaction.state)) return undefined;
  const updatedAt = Date.parse(transaction.updatedAt || transaction.createdAt);
  if (Number.isFinite(updatedAt) && now.getTime() - updatedAt < ACTIVE_TRANSACTION_GRACE_MS) {
    return undefined;
  }
  return issue({
    code: "transaction-incomplete",
    category: "transaction",
    severity: "warning",
    recoverability: ["update", "disable", "enable"].includes(transaction.operation) ? "safe-retry" : "manual-review",
    availableActions: ["update", "disable", "enable"].includes(transaction.operation) ? ["retry-transaction"] : undefined,
    location,
    transactionId: transaction.id,
    skillName: transaction.skillName,
    operation: transaction.operation,
    state: transaction.state,
    detectedAt: transaction.updatedAt || transaction.createdAt,
    relatedPath: transaction.backupDirectory,
    diagnostic: transaction.failure,
  });
}

async function protectedStagingIds(transactionRoot: string): Promise<Set<string>> {
  const listing = await directEntries(transactionRoot);
  const protectedIds = new Set<string>();
  for (const entry of listing.entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
    try {
      const value = JSON.parse(await readFile(path.join(transactionRoot, entry.name), "utf8")) as unknown;
      if (isLifecycleTransaction(value) && value.stagingDirectory && !["committed", "rolled-back"].includes(value.state)) {
        protectedIds.add(value.id.toLocaleLowerCase());
      }
    } catch { /* Invalid journals are reported separately. */ }
  }
  return protectedIds;
}

async function scanStaging(root: string, now: Date, protectedIds: Set<string>): Promise<LifecycleRecoveryIssue[]> {
  const listing = await directEntries(root);
  if (listing.error) {
    return [issue({
      code: "staging-root-unreadable",
      category: "staging",
      severity: "danger",
      recoverability: "manual-review",
      location: root,
      diagnostic: listing.error,
    })];
  }
  const issues: LifecycleRecoveryIssue[] = [];
  for (const entry of listing.entries) {
    const location = path.join(root, entry.name);
    try {
      if (!entry.isDirectory()) throw new Error("Staging entry is not a directory.");
      await assertDirectOrdinaryDirectory(root, location);
      const details = await stat(location);
      if (protectedIds.has(entry.name.toLocaleLowerCase())) continue;
      if (now.getTime() - details.mtimeMs < ACTIVE_TRANSACTION_GRACE_MS) continue;
      issues.push(issue({
        code: "staging-entry-orphaned",
        category: "staging",
        severity: "warning",
        recoverability: "safe-cleanup",
        availableActions: ["clean-staging"],
        location,
        transactionId: entry.name,
        detectedAt: details.mtime.toISOString(),
      }));
    } catch (error) {
      issues.push(issue({
        code: "staging-entry-unsafe",
        category: "staging",
        severity: "danger",
        recoverability: "manual-review",
        location,
        diagnostic: diagnostic(error),
      }));
    }
  }
  return issues;
}

async function scanTransactions(root: string, now: Date): Promise<LifecycleRecoveryIssue[]> {
  const listing = await directEntries(root);
  if (listing.error) {
    return [issue({
      code: "transaction-root-unreadable",
      category: "transaction",
      severity: "danger",
      recoverability: "manual-review",
      location: root,
      diagnostic: listing.error,
    })];
  }
  const issues: LifecycleRecoveryIssue[] = [];
  for (const entry of listing.entries) {
    const location = path.join(root, entry.name);
    if (!entry.isFile() || entry.isSymbolicLink() || path.extname(entry.name).toLowerCase() !== ".json") {
      issues.push(issue({
        code: "transaction-record-invalid",
        category: "transaction",
        severity: "warning",
        recoverability: "manual-review",
        location,
      }));
      continue;
    }
    try {
      const value = JSON.parse(await readFile(location, "utf8")) as unknown;
      if (!isLifecycleTransaction(value)) throw new Error("事务日志格式不受支持。");
      const finding = transactionIssue(value, location, now);
      if (finding) issues.push(finding);
    } catch (error) {
      issues.push(issue({
        code: "transaction-record-invalid",
        category: "transaction",
        severity: "danger",
        recoverability: "manual-review",
        location,
        diagnostic: diagnostic(error),
      }));
    }
  }
  return issues;
}

export async function inspectLifecycleRecovery(
  options: LifecycleStorageOptions & { now?: Date } = {},
): Promise<LifecycleRecoveryOverview> {
  const now = options.now || new Date();
  const roots = resolveLifecycleStorageRoots(options);
  const protectedIds = await protectedStagingIds(roots.transactionRoot);
  const [trashIssues, quarantineIssues, transactionIssues, stagingIssues] = await Promise.all([
    scanTrash(roots.trashRoot),
    scanQuarantine(roots.purgeRoot),
    scanTransactions(roots.transactionRoot, now),
    scanStaging(roots.stagingRoot, now, protectedIds),
  ]);
  const issues = [...trashIssues, ...quarantineIssues, ...transactionIssues, ...stagingIssues]
    .sort((left, right) => {
      const severity = Number(right.severity === "danger") - Number(left.severity === "danger");
      return severity || Date.parse(right.detectedAt || "") - Date.parse(left.detectedAt || "");
    });
  return {
    inspectedAt: now.toISOString(),
    healthy: issues.length === 0,
    counts: {
      total: issues.length,
      trash: trashIssues.length,
      quarantine: quarantineIssues.length,
      transactions: transactionIssues.length,
      staging: stagingIssues.length,
    },
    roots,
    issues,
  };
}

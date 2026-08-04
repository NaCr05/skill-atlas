import type {
  DisabledSkillRecord,
  LifecycleOperation,
  LifecycleTransaction,
  LifecycleTransactionState,
  SkillFingerprint,
  SkillSourceTracking,
  TrashedSkillRecord,
} from "./types";

const OPERATIONS = new Set<LifecycleOperation>([
  "track-source",
  "update",
  "disable",
  "enable",
  "uninstall",
  "restore",
  "purge",
  "migrate-duplicate",
  "restore-migration",
  "purge-migration",
]);

const TRANSACTION_STATES = new Set<LifecycleTransactionState>([
  "planned",
  "staged",
  "backed-up",
  "committed",
  "rolled-back",
  "failed",
]);

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isFingerprint(value: unknown): value is SkillFingerprint {
  const fingerprint = recordValue(value);
  return fingerprint.algorithm === "sha256-manifest-v1" &&
    typeof fingerprint.value === "string" &&
    /^[0-9a-f]{64}$/i.test(fingerprint.value) &&
    typeof fingerprint.fileCount === "number" &&
    Number.isSafeInteger(fingerprint.fileCount) &&
    fingerprint.fileCount >= 0 &&
    typeof fingerprint.totalBytes === "number" &&
    Number.isSafeInteger(fingerprint.totalBytes) &&
    fingerprint.totalBytes >= 0 &&
    typeof fingerprint.complete === "boolean";
}

function isSourceTracking(value: unknown): value is SkillSourceTracking {
  const source = recordValue(value);
  if (source.status === "not-applicable" || source.status === "untracked") return true;
  return source.status === "tracked" &&
    [
      source.skillDirectory,
      source.sourceUrl,
      source.repository,
      source.ref,
      source.sourceDirectory,
      source.revision,
      source.upstreamFingerprint,
      source.localFingerprint,
      source.trackedAt,
    ].every((field) => typeof field === "string" && field.length > 0);
}

export function isTrashedSkillRecord(value: unknown): value is TrashedSkillRecord {
  const record = recordValue(value);
  return typeof record.trashId === "string" &&
    typeof record.skillId === "string" &&
    typeof record.skillName === "string" &&
    typeof record.displayName === "string" &&
    typeof record.originalDirectory === "string" &&
    typeof record.trashDirectory === "string" &&
    typeof record.deletedAt === "string" &&
    optionalString(record.restoredAt) &&
    isFingerprint(record.fingerprint) &&
    isSourceTracking(record.sourceTracking) &&
    ["planned", "committed", "restored", "failed"].includes(String(record.state)) &&
    optionalString(record.failure);
}

export function isDisabledSkillRecord(value: unknown): value is DisabledSkillRecord {
  const record = recordValue(value);
  return typeof record.disabledId === "string" &&
    typeof record.skillId === "string" &&
    typeof record.skillName === "string" &&
    typeof record.displayName === "string" &&
    typeof record.originalDirectory === "string" &&
    typeof record.disabledDirectory === "string" &&
    typeof record.disabledAt === "string" &&
    optionalString(record.enabledAt) &&
    isFingerprint(record.fingerprint) &&
    isSourceTracking(record.sourceTracking) &&
    ["planned", "committed", "enabled", "failed"].includes(String(record.state)) &&
    optionalString(record.failure);
}

export function isLifecycleTransaction(value: unknown): value is LifecycleTransaction {
  const transaction = recordValue(value);
  return typeof transaction.id === "string" &&
    OPERATIONS.has(transaction.operation as LifecycleOperation) &&
    typeof transaction.skillId === "string" &&
    TRANSACTION_STATES.has(transaction.state as LifecycleTransactionState) &&
    typeof transaction.createdAt === "string" &&
    optionalString(transaction.updatedAt) &&
    typeof transaction.expectedFingerprint === "string" &&
    optionalString(transaction.skillName) &&
    optionalString(transaction.originalDirectory) &&
    optionalString(transaction.stagingDirectory) &&
    optionalString(transaction.backupDirectory) &&
    optionalString(transaction.targetFingerprint) &&
    optionalString(transaction.manifestPath) &&
    optionalString(transaction.failure);
}

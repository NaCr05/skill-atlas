import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { resolveLifecycleStorageRoots, type LifecycleStorageOptions } from "@/core/lifecycle/storage";
import { writeJsonAtomically } from "@/core/lifecycle/transaction-store";

export type OperationKind =
  | "install" | "update" | "disable" | "enable" | "remove" | "restore" | "purge"
  | "recovery" | "batch-update-check" | "duplicate-migration"
  | "migration-restore" | "migration-purge" | "storage-cleanup" | "data-import";
export type OperationStatus = "running" | "succeeded" | "failed" | "interrupted";
export type OperationStageCode =
  | "preflight" | "download" | "backup" | "replace" | "verify" | "rollback" | "complete";
export type OperationStageStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface OperationStageRecord {
  code: OperationStageCode;
  status: OperationStageStatus;
  startedAt?: string;
  finishedAt?: string;
  detail?: string;
}

export interface OperationRecord {
  id: string;
  kind: OperationKind;
  status: OperationStatus;
  target: string;
  startedAt: string;
  finishedAt?: string;
  detail?: string;
  errorCode?: string;
  recoveryHref?: string;
  runtimeId?: string;
  interruptedAt?: string;
  stages?: OperationStageRecord[];
}

interface OperationDocument { version: 1; records: OperationRecord[] }
interface RecordedOperation<T> {
  kind: OperationKind;
  target: string;
  recoveryHref?: string;
  work: (progress: OperationProgressReporter) => Promise<T>;
  describe?: (result: T) => string;
}

const MAX_RECORDS = 300;
const OPERATION_KINDS = new Set<OperationKind>([
  "install",
  "update",
  "disable",
  "enable",
  "remove",
  "restore",
  "purge",
  "recovery",
  "batch-update-check",
  "duplicate-migration",
  "migration-restore",
  "migration-purge",
  "storage-cleanup",
  "data-import",
]);
const OPERATION_STAGE_CODES = new Set<OperationStageCode>(["preflight", "download", "backup", "replace", "verify", "rollback", "complete"]);
const OPERATION_STAGE_STATUSES = new Set<OperationStageStatus>(["pending", "running", "succeeded", "failed", "skipped"]);
const INTERRUPTED_GRACE_MS = 2 * 60_000;
const operationRuntime = globalThis as typeof globalThis & {
  __skillAtlasOperationRuntimeId?: string;
  __skillAtlasActiveOperations?: Set<string>;
  __skillAtlasOperationWriteQueue?: Promise<void>;
};
const runtimeId = operationRuntime.__skillAtlasOperationRuntimeId || randomUUID();
operationRuntime.__skillAtlasOperationRuntimeId = runtimeId;
const activeOperations = operationRuntime.__skillAtlasActiveOperations || new Set<string>();
operationRuntime.__skillAtlasActiveOperations = activeOperations;
operationRuntime.__skillAtlasOperationWriteQueue ||= Promise.resolve();

function location(options: LifecycleStorageOptions): string {
  return path.join(resolveLifecycleStorageRoots(options).atlasRoot, "operations.json");
}

function validRecord(value: unknown): value is OperationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<OperationRecord>;
  const recoveryValid = record.recoveryHref === undefined || (typeof record.recoveryHref === "string" && /^\/[a-zA-Z0-9/_?&=.%+-]*$/.test(record.recoveryHref));
  const stagesValid = record.stages === undefined || (Array.isArray(record.stages) && record.stages.length <= 20 && record.stages.every((stage) =>
    Boolean(stage) && OPERATION_STAGE_CODES.has(stage.code) && OPERATION_STAGE_STATUSES.has(stage.status)
      && (stage.detail === undefined || (typeof stage.detail === "string" && stage.detail.length <= 2_000)),
  ));
  return typeof record.id === "string" && record.id.length <= 160 && OPERATION_KINDS.has(record.kind as OperationKind) &&
    ["running", "succeeded", "failed", "interrupted"].includes(String(record.status)) &&
    typeof record.target === "string" && record.target.length <= 1000 && typeof record.startedAt === "string" && Number.isFinite(Date.parse(record.startedAt))
    && (record.detail === undefined || (typeof record.detail === "string" && record.detail.length <= 4_000)) && recoveryValid && stagesValid;
}

export type OperationProgressReporter = (
  code: OperationStageCode,
  status: OperationStageStatus,
  detail?: string,
) => Promise<void>;

async function readRecords(options: LifecycleStorageOptions): Promise<OperationRecord[]> {
  try {
    const document = JSON.parse(await readFile(location(options), "utf8")) as Partial<OperationDocument>;
    return Array.isArray(document.records) ? document.records.filter(validRecord).slice(0, MAX_RECORDS) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new SkillAtlasError("OPERATION_READ_FAILED", { cause: error });
  }
}

function queue<T>(work: () => Promise<T>): Promise<T> {
  const previous = operationRuntime.__skillAtlasOperationWriteQueue || Promise.resolve();
  let resolveResult: (value: T | PromiseLike<T>) => void = () => {};
  let rejectResult: (reason?: unknown) => void = () => {};
  const result = new Promise<T>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  operationRuntime.__skillAtlasOperationWriteQueue = previous.catch(() => undefined).then(async () => {
    try { resolveResult(await work()); } catch (error) { rejectResult(error); }
  });
  return result;
}

function interruptStale(records: OperationRecord[], now: Date): boolean {
  let changed = false;
  for (const record of records) {
    if (record.status !== "running") continue;
    const age = now.getTime() - Date.parse(record.startedAt);
    const foreignRuntime = Boolean(record.runtimeId && record.runtimeId !== runtimeId);
    const orphanedCurrentRuntime = record.runtimeId === runtimeId && !activeOperations.has(record.id) && age >= INTERRUPTED_GRACE_MS;
    const legacyExpired = !record.runtimeId && age >= INTERRUPTED_GRACE_MS;
    if (!foreignRuntime && !orphanedCurrentRuntime && !legacyExpired) continue;
    record.status = "interrupted";
    record.finishedAt = now.toISOString();
    record.interruptedAt = now.toISOString();
    record.errorCode = "OPERATION_INTERRUPTED";
    record.detail = "The previous Skill Atlas process stopped before this operation recorded a final result.";
    changed = true;
  }
  return changed;
}

export async function listOperations(
  options: LifecycleStorageOptions & { now?: Date } = {},
): Promise<OperationRecord[]> {
  return queue(async () => {
    const records = await readRecords(options);
    if (interruptStale(records, options.now || new Date())) {
      await writeJsonAtomically(location(options), { version: 1, records } satisfies OperationDocument);
    }
    return records;
  });
}

export async function mergeOperationRecords(
  imported: unknown[],
  options: LifecycleStorageOptions = {},
): Promise<number> {
  const valid = imported.filter(validRecord).map((record) => record.status === "running" ? {
    ...record,
    status: "interrupted" as const,
    finishedAt: record.finishedAt || new Date().toISOString(),
    errorCode: "OPERATION_INTERRUPTED",
  } : record);
  await queue(async () => {
    const current = await readRecords(options);
    const merged = new Map(current.map((record) => [record.id, record]));
    for (const record of valid) if (!merged.has(record.id)) merged.set(record.id, record);
    const records = [...merged.values()].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, MAX_RECORDS);
    await writeJsonAtomically(location(options), { version: 1, records } satisfies OperationDocument);
  });
  return valid.length;
}

async function put(record: OperationRecord, options: LifecycleStorageOptions): Promise<void> {
  await queue(async () => {
    const records = await readRecords(options);
    const next = [record, ...records.filter((entry) => entry.id !== record.id)]
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, MAX_RECORDS);
    await writeJsonAtomically(location(options), { version: 1, records: next } satisfies OperationDocument);
  });
}

async function safelyPut(record: OperationRecord, options: LifecycleStorageOptions): Promise<void> {
  await put(record, options).catch(() => undefined);
}

export async function runRecordedOperation<T>(
  input: RecordedOperation<T>,
  options: LifecycleStorageOptions = {},
): Promise<T> {
  const record: OperationRecord = {
    id: randomUUID(), kind: input.kind, status: "running", target: input.target,
    startedAt: new Date().toISOString(), recoveryHref: input.recoveryHref, runtimeId,
  };
  activeOperations.add(record.id);
  await safelyPut(record, options);
  const progress: OperationProgressReporter = async (code, status, detail) => {
    const now = new Date().toISOString();
    const stages = record.stages || [];
    const existing = stages.find((stage) => stage.code === code);
    const next: OperationStageRecord = {
      code,
      status,
      startedAt: existing?.startedAt || (status === "pending" ? undefined : now),
      finishedAt: ["succeeded", "failed", "skipped"].includes(status) ? now : undefined,
      detail: detail || existing?.detail,
    };
    record.stages = existing
      ? stages.map((stage) => stage.code === code ? next : stage)
      : [...stages, next];
    await safelyPut(record, options);
  };
  try {
    await progress("preflight", "running", "Review plan and current filesystem state.");
    const result = await input.work(progress);
    const preflight = record.stages?.find((stage) => stage.code === "preflight");
    if (preflight?.status === "running") await progress("preflight", "succeeded");
    await progress("complete", "succeeded", "Operation reached its committed result.");
    record.status = "succeeded";
    record.finishedAt = new Date().toISOString();
    record.detail = input.describe?.(result);
    await safelyPut(record, options);
    return result;
  } catch (error) {
    const runningStage = record.stages?.findLast((stage) => stage.status === "running");
    if (runningStage) await progress(runningStage.code, "failed", "This phase did not complete.");
    record.status = "failed";
    record.finishedAt = new Date().toISOString();
    record.errorCode = error instanceof SkillAtlasError ? error.code : "OPERATION_FAILED";
    record.detail = "Operation did not complete. Open the linked recovery or review surface for current evidence.";
    await safelyPut(record, options);
    throw error;
  } finally {
    activeOperations.delete(record.id);
  }
}

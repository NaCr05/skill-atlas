import { randomUUID } from "node:crypto";
import path from "node:path";

import { loadRuntimeAiSettings, saveRuntimeAiSettings } from "@/core/ai/runtime-config";
import { mergeTrackedSources, readSourceRegistry } from "@/core/lifecycle/source-registry";
import { resolveLifecycleStorageRoots, type LifecycleStorageOptions } from "@/core/lifecycle/storage";
import { writeJsonAtomically } from "@/core/lifecycle/transaction-store";
import type { TrackedSkillSource } from "@/core/lifecycle/types";
import { listOperations, mergeOperationRecords, type OperationRecord } from "@/core/operations/operation-log";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { loadSourcePolicy, saveSourcePolicy, type SourcePolicy } from "@/core/source-policy/source-policy";

export interface PortableServerData {
  operations: OperationRecord[];
  sourceRegistry: TrackedSkillSource[];
  sourcePolicy: SourcePolicy;
  ai: { selection: "auto" | "openai" | "deepseek"; models: { openai: string; deepseek: string }; secretsExcluded: true };
}

export interface ServerImportReview {
  planId: string;
  expiresAt: string;
  counts: { operations: number; sources: number; trustedOwners: number; trustedRepositories: number };
  apiKeysExcluded: true;
  strategy: "merge";
}

interface ImportPlan extends ServerImportReview { data: PortableServerData }
const importPlans = getReviewPlanStore<ImportPlan>("data-import");

export async function createPortableServerData(options: LifecycleStorageOptions = {}): Promise<PortableServerData> {
  const [operations, registry, sourcePolicy, ai] = await Promise.all([listOperations(options), readSourceRegistry(options), loadSourcePolicy(options), loadRuntimeAiSettings(options)]);
  return {
    operations,
    sourceRegistry: [...registry.values()],
    sourcePolicy,
    ai: { selection: ai.summary.selection === "invalid" ? "auto" : ai.summary.selection, models: { openai: ai.summary.providers.openai.model, deepseek: ai.summary.providers.deepseek.model }, secretsExcluded: true },
  };
}

function normalizeServerData(value: unknown): PortableServerData {
  if (!value || typeof value !== "object") throw new Error("Import does not contain server data.");
  const data = value as Partial<PortableServerData>;
  if (!Array.isArray(data.operations) || !Array.isArray(data.sourceRegistry) || !data.sourcePolicy || !data.ai) throw new Error("Import server data is incomplete.");
  const selection = ["auto", "openai", "deepseek"].includes(data.ai.selection) ? data.ai.selection : "auto";
  return {
    operations: data.operations.slice(0, 300), sourceRegistry: data.sourceRegistry.slice(0, 1000), sourcePolicy: data.sourcePolicy,
    ai: { selection, models: { openai: String(data.ai.models?.openai || "").slice(0, 120), deepseek: String(data.ai.models?.deepseek || "").slice(0, 120) }, secretsExcluded: true },
  };
}

export function inspectPortableImport(value: unknown, now = new Date()): ServerImportReview {
  const data = normalizeServerData(value);
  const plan: ImportPlan = {
    planId: randomUUID(), expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), data,
    counts: { operations: data.operations.length, sources: data.sourceRegistry.length, trustedOwners: data.sourcePolicy.trustedOwners.length, trustedRepositories: data.sourcePolicy.trustedRepositories.length },
    apiKeysExcluded: true, strategy: "merge",
  };
  importPlans.put(plan.planId, plan, now);
  const { data: _data, ...review } = plan; void _data;
  return review;
}

export async function confirmPortableImport(planId: string, options: LifecycleStorageOptions & { now?: Date } = {}): Promise<ServerImportReview & { backupDirectory: string }> {
  const consumed = importPlans.consume(planId, options.now || new Date());
  if (consumed.status !== "ready") throw new Error("Import review is missing or expired.");
  const { data, ...review } = consumed.plan;
  const roots = resolveLifecycleStorageRoots(options);
  const backupDirectory = path.join(roots.importBackupRoot, randomUUID());
  await writeJsonAtomically(path.join(backupDirectory, "before.json"), await createPortableServerData(options));
  await mergeOperationRecords(data.operations, options);
  await mergeTrackedSources(data.sourceRegistry, options);
  await saveSourcePolicy({
    trustedOwners: data.sourcePolicy.trustedOwners, trustedRepositories: data.sourcePolicy.trustedRepositories,
    trustMode: data.sourcePolicy.trustMode, licenseMode: data.sourcePolicy.licenseMode,
    allowedLicenses: data.sourcePolicy.allowedLicenses, warnArchived: data.sourcePolicy.warnArchived,
  }, options);
  await saveRuntimeAiSettings({ selection: data.ai.selection, providers: { openai: { model: data.ai.models.openai }, deepseek: { model: data.ai.models.deepseek } } }, options);
  return { ...review, backupDirectory };
}

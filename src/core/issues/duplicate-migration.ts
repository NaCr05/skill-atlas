import { randomUUID } from "node:crypto";
import { lstat, mkdir, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { snapshotLocalSkill } from "@/core/lifecycle/fingerprint";
import { resolveLifecycleStorageRoots, sameWindowsPath } from "@/core/lifecycle/storage";
import { resolveTransactionWriter, withLifecycleLock, type TransactionOptions } from "@/core/lifecycle/transaction-store";
import type { LifecycleTransaction, SkillFingerprint } from "@/core/lifecycle/types";
import { getReviewPlanStore } from "@/core/review-plans/review-plan-store";
import { discoverSkills } from "@/core/skills/discover";
import { isPathInside, resolveCodexEnvironment } from "@/core/skills/paths";
import { createMigrationArchiveRecord, writeMigrationArchiveRecord } from "./migration-archive";

const PLAN_TTL_MS = 10 * 60_000;
const MAX_FILES = 500;

export interface DuplicateMigrationReview {
  planId: string;
  expiresAt: string;
  skillId: string;
  skillName: string;
  sourceDirectory: string;
  sourceLabel: string;
  canonicalDirectory: string;
  archiveRoot: string;
  fingerprint: SkillFingerprint;
  migrationAllowed: boolean;
  risks: Array<{ level: "info" | "blocked"; title: string; detail: string }>;
}
interface InternalPlan extends DuplicateMigrationReview { sourceRoot: string }
export interface DuplicateMigrationResult { migrationId: string; skillName: string; originalDirectory: string; archivedDirectory: string; migratedAt: string; fileCount: number; totalBytes: number }
export interface DuplicateMigrationOptions extends TransactionOptions { now?: Date; idFactory?: () => string; checkpoint?: (state: "moved" | "verified") => void | Promise<void> }

export const duplicateMigrationPlans = getReviewPlanStore<InternalPlan>("duplicate-migration");

async function exists(location: string) { try { await stat(location); return true; } catch { return false; } }

async function assertMigrationSource(directoryPath: string, options: DuplicateMigrationOptions): Promise<string> {
  const environment = resolveCodexEnvironment(options.env, options.homeDirectory);
  const directory = path.resolve(directoryPath);
  const source = environment.sources.find((entry) => entry.kind === "compatibility" && entry.permission === "migration-only" && isPathInside(entry.rootPath, directory));
  if (!source || !sameWindowsPath(path.dirname(directory), source.rootPath)) throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED");
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED");
  const [realRoot, realDirectory] = await Promise.all([realpath(source.rootPath), realpath(directory)]);
  if (!isPathInside(realRoot, realDirectory) || !sameWindowsPath(path.dirname(realDirectory), realRoot)) throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED");
  return source.rootPath;
}

export async function inspectDuplicateMigration(input: { skillId: string }, options: DuplicateMigrationOptions = {}): Promise<DuplicateMigrationReview> {
  const inventory = await discoverSkills({ env: options.env, homeDirectory: options.homeDirectory, forceRefresh: true });
  const skill = inventory.skills.find((entry) => entry.id === input.skillId);
  if (!skill || skill.source.kind !== "compatibility" || skill.source.permission !== "migration-only") throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED");
  const duplicates = inventory.skills.filter((entry) => entry.id !== skill.id && entry.name.toLocaleLowerCase() === skill.name.toLocaleLowerCase());
  if (!duplicates.length) throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED");
  const sourceRoot = await assertMigrationSource(skill.directoryPath, options);
  const snapshot = await snapshotLocalSkill(skill.directoryPath, { maxFiles: MAX_FILES });
  const risks: DuplicateMigrationReview["risks"] = [
    { level: "info", title: "Compatibility entry only", detail: "The complete compatibility directory will move outside active Skill discovery; the preferred duplicate remains installed." },
    { level: "info", title: "Complete private archive", detail: `${snapshot.fingerprint.fileCount} files remain under Skill Atlas private storage for manual recovery.` },
  ];
  if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length) risks.push({ level: "blocked", title: "Complete fingerprint unavailable", detail: snapshot.unsupportedPaths.join(", ") || `More than ${MAX_FILES} files.` });
  const now = options.now || new Date();
  const planId = (options.idFactory || randomUUID)();
  const plan: InternalPlan = {
    planId, expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(), skillId: skill.id, skillName: skill.name,
    sourceDirectory: skill.directoryPath, sourceLabel: skill.source.label, canonicalDirectory: duplicates[0].directoryPath,
    archiveRoot: resolveLifecycleStorageRoots(options).migrationRoot, fingerprint: snapshot.fingerprint,
    migrationAllowed: !risks.some((risk) => risk.level === "blocked"), risks, sourceRoot,
  };
  duplicateMigrationPlans.put(planId, plan, now);
  const { sourceRoot: _sourceRoot, ...review } = plan; void _sourceRoot; return review;
}

export async function confirmDuplicateMigration(planId: string, options: DuplicateMigrationOptions = {}): Promise<DuplicateMigrationResult> {
  const now = options.now || new Date();
  const consumed = duplicateMigrationPlans.consume(planId, now);
  if (consumed.status === "missing") throw new SkillAtlasError("DUPLICATE_MIGRATION_PLAN_MISSING");
  if (consumed.status === "expired") throw new SkillAtlasError("DUPLICATE_MIGRATION_PLAN_EXPIRED");
  const plan = consumed.plan;
  if (!plan.migrationAllowed) throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED");
  return withLifecycleLock(plan.sourceDirectory, async () => {
    await assertMigrationSource(plan.sourceDirectory, options);
    const snapshot = await snapshotLocalSkill(plan.sourceDirectory, { maxFiles: MAX_FILES });
    if (!snapshot.fingerprint.complete || snapshot.unsupportedPaths.length || snapshot.fingerprint.value !== plan.fingerprint.value) throw new SkillAtlasError("DUPLICATE_MIGRATION_FAILED");
    const current = (await discoverSkills({ env: options.env, homeDirectory: options.homeDirectory, forceRefresh: true })).skills;
    if (!current.some((entry) => entry.id !== plan.skillId && entry.name.toLocaleLowerCase() === plan.skillName.toLocaleLowerCase())) throw new SkillAtlasError("DUPLICATE_MIGRATION_BLOCKED");
    const migrationId = (options.idFactory || randomUUID)();
    const root = resolveLifecycleStorageRoots(options).migrationRoot;
    const container = path.join(root, migrationId);
    const archivedDirectory = path.join(container, "skill");
    if (!sameWindowsPath(path.dirname(container), root) || await exists(container)) throw new SkillAtlasError("DUPLICATE_MIGRATION_FAILED");
    const transaction: LifecycleTransaction = { id: migrationId, operation: "migrate-duplicate", skillId: plan.skillId, skillName: plan.skillName, state: "planned", createdAt: now.toISOString(), updatedAt: now.toISOString(), expectedFingerprint: plan.fingerprint.value, originalDirectory: plan.sourceDirectory, backupDirectory: archivedDirectory, manifestPath: path.join(container, "manifest.json") };
    const writer = resolveTransactionWriter(options);
    let moved = false;
    try {
      await mkdir(root, { recursive: true }); await mkdir(container, { recursive: false });
      await writeMigrationArchiveRecord(createMigrationArchiveRecord({ migrationId, skillId: plan.skillId, skillName: plan.skillName, originalDirectory: plan.sourceDirectory, archivedDirectory, migratedAt: now.toISOString(), fingerprint: plan.fingerprint }), options);
      await writer(transaction);
      await rename(plan.sourceDirectory, archivedDirectory); moved = true; await options.checkpoint?.("moved");
      const archived = await snapshotLocalSkill(archivedDirectory, { maxFiles: MAX_FILES });
      if (archived.fingerprint.value !== plan.fingerprint.value || archived.unsupportedPaths.length) throw new Error("Archive fingerprint mismatch.");
      await options.checkpoint?.("verified"); transaction.state = "committed"; transaction.updatedAt = new Date().toISOString(); await writer(transaction);
      return { migrationId, skillName: plan.skillName, originalDirectory: plan.sourceDirectory, archivedDirectory, migratedAt: now.toISOString(), fileCount: plan.fingerprint.fileCount, totalBytes: plan.fingerprint.totalBytes };
    } catch (error) {
      if (moved && !(await exists(plan.sourceDirectory))) {
        try {
          await rename(archivedDirectory, plan.sourceDirectory);
          const restored = await snapshotLocalSkill(plan.sourceDirectory, { maxFiles: MAX_FILES });
          transaction.state = restored.fingerprint.complete &&
            !restored.unsupportedPaths.length &&
            restored.fingerprint.value === plan.fingerprint.value
            ? "rolled-back"
            : "failed";
        }
        catch { transaction.state = "failed"; }
      } else transaction.state = "failed";
      transaction.failure = error instanceof Error ? error.message : String(error); transaction.updatedAt = new Date().toISOString(); await writer(transaction).catch(() => undefined);
      if (!moved) await rm(container, { recursive: true, force: true }).catch(() => undefined);
      throw new SkillAtlasError("DUPLICATE_MIGRATION_FAILED", { cause: error });
    }
  });
}

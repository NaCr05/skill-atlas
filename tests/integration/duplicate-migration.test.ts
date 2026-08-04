import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { confirmDuplicateMigration, duplicateMigrationPlans, inspectDuplicateMigration } from "@/core/issues/duplicate-migration";
import {
  confirmMigrationArchivePurge,
  inspectMigrationArchivePurge,
  listMigrationArchives,
  migrationArchivePurgePlans,
  restoreMigrationArchive,
} from "@/core/issues/migration-archive";
import { discoverSkills, invalidateSkillInventoryCache } from "@/core/skills/discover";

const temporaryDirectories: string[] = [];
const contents = "---\nname: shared-skill\ndescription: Duplicate fixture.\n---\n\nUse safely.";

async function exists(location: string) { try { await stat(location); return true; } catch { return false; } }
async function writeSkill(root: string) {
  const directory = path.join(root, "shared-skill");
  await mkdir(path.join(directory, "references"), { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), contents);
  await writeFile(path.join(directory, "references", "note.md"), "supporting file");
  return directory;
}

beforeEach(() => { duplicateMigrationPlans.clear(); migrationArchivePurgePlans.clear(); invalidateSkillInventoryCache(); });
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("duplicate compatibility entry migration", () => {
  it("reviews one exact compatibility directory and archives it without touching the personal copy", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-duplicate-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const compatibilityRoot = path.join(temporary, ".agents", "skills");
    const personal = await writeSkill(path.join(codexHome, "skills"));
    const compatibility = await writeSkill(compatibilityRoot);
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") };
    const skill = (await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.find((entry) => entry.directoryPath === compatibility)!;

    const review = await inspectDuplicateMigration({ skillId: skill.id }, { env, homeDirectory: temporary, idFactory: () => "plan" });
    expect(review.migrationAllowed).toBe(true);
    expect(review.canonicalDirectory).toBe(personal);
    const result = await confirmDuplicateMigration(review.planId, { env, homeDirectory: temporary, idFactory: () => "migration" });

    expect(await exists(compatibility)).toBe(false);
    expect(await readFile(path.join(result.archivedDirectory, "references", "note.md"), "utf8")).toBe("supporting file");
    expect(await readFile(path.join(personal, "SKILL.md"), "utf8")).toBe(contents);

    const archives = await listMigrationArchives({ env, homeDirectory: temporary });
    expect(archives).toMatchObject({ count: 1, records: [{ migrationId: "migration", health: "ready", restorable: true, purgeAllowed: true }] });

    const restored = await restoreMigrationArchive("migration", { env, homeDirectory: temporary, idFactory: () => "restore-transaction" });
    expect(restored.restoredDirectory).toBe(compatibility);
    expect(await readFile(path.join(compatibility, "references", "note.md"), "utf8")).toBe("supporting file");
    expect((await listMigrationArchives({ env, homeDirectory: temporary })).count).toBe(0);
  });

  it("restores and verifies the original directory if a reviewed migration fails", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-duplicate-rollback-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const compatibility = await writeSkill(path.join(temporary, ".agents", "skills"));
    await writeSkill(path.join(codexHome, "skills"));
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") };
    const skill = (await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.find((entry) => entry.directoryPath === compatibility)!;
    const review = await inspectDuplicateMigration({ skillId: skill.id }, { env, homeDirectory: temporary, idFactory: () => "plan" });

    await expect(confirmDuplicateMigration(review.planId, {
      env,
      homeDirectory: temporary,
      idFactory: () => "migration",
      checkpoint: (state) => { if (state === "verified") throw new Error("simulated journal failure"); },
    })).rejects.toMatchObject({ code: "DUPLICATE_MIGRATION_FAILED" });

    expect(await readFile(path.join(compatibility, "SKILL.md"), "utf8")).toBe(contents);
    const transaction = JSON.parse(await readFile(path.join(codexHome, ".skill-atlas", "transactions", "migration.json"), "utf8")) as { state: string };
    expect(transaction.state).toBe("rolled-back");
  });

  it("permanently removes an individually reviewed archive and reports final audit failure explicitly", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-duplicate-purge-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const compatibility = await writeSkill(path.join(temporary, ".agents", "skills"));
    await writeSkill(path.join(codexHome, "skills"));
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") };
    const skill = (await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.find((entry) => entry.directoryPath === compatibility)!;
    const migration = await inspectDuplicateMigration({ skillId: skill.id }, { env, homeDirectory: temporary, idFactory: () => "migration-plan" });
    await confirmDuplicateMigration(migration.planId, { env, homeDirectory: temporary, idFactory: () => "archive-id" });
    const review = await inspectMigrationArchivePurge("archive-id", { env, homeDirectory: temporary, idFactory: () => "purge-plan" });

    const result = await confirmMigrationArchivePurge({ planId: review.planId, confirmationText: review.confirmationText }, {
      env,
      homeDirectory: temporary,
      idFactory: () => "purge-transaction",
      transactionWriter: async (transaction) => {
        if (transaction.state === "committed") throw new Error("disk full while writing final audit");
      },
    });

    expect(result).toMatchObject({ auditStatus: "incomplete", recoverable: false });
    expect(result.auditWarning).toContain("disk full");
    expect((await listMigrationArchives({ env, homeDirectory: temporary })).count).toBe(0);
    await expect(confirmMigrationArchivePurge({ planId: review.planId, confirmationText: review.confirmationText }, { env, homeDirectory: temporary }))
      .rejects.toMatchObject({ code: "MIGRATION_ARCHIVE_PURGE_PLAN_MISSING" });
  });
});

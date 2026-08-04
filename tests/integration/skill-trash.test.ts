import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  confirmPermanentDeletion,
  confirmSkillRemoval,
  inspectPermanentDeletion,
  inspectSkillRemoval,
  listTrashedSkills,
  permanentDeletionPlans,
  removalPlans,
  restoreTrashedSkill,
} from "@/core/lifecycle/skill-trash";
import {
  readSourceRegistry,
  recordTrackedSource,
} from "@/core/lifecycle/source-registry";
import { discoverSkills, invalidateSkillInventoryCache } from "@/core/skills/discover";

const temporaryDirectories: string[] = [];

async function createSkill(
  root: string,
  name: string,
  options: { dependencies?: string[]; body?: string } = {},
): Promise<string> {
  const directory = path.join(root, name);
  await mkdir(path.join(directory, "assets"), { recursive: true });
  const dependencyBlock = options.dependencies?.length
    ? "\ndependencies:\n  skills: [" + options.dependencies.join(", ") + "]"
    : "";
  await writeFile(
    path.join(directory, "SKILL.md"),
    "---\nname: " +
      name +
      "\ndescription: Fixture Skill used to verify recoverable removal." +
      dependencyBlock +
      "\n---\n\n" +
      (options.body || "Use the fixture safely."),
  );
  await writeFile(path.join(directory, "assets", "note.txt"), "supporting file");
  return directory;
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

beforeEach(() => {
  removalPlans.clear();
  permanentDeletionPlans.clear();
  invalidateSkillInventoryCache();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("recoverable Skill removal", () => {
  it("moves a complete personal Skill to the private trash and restores it", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-trash-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillsRoot = path.join(codexHome, "skills");
    const skillDirectory = await createSkill(skillsRoot, "sample");
    const env = {
      CODEX_HOME: codexHome,
      USERPROFILE: temporary,
      LOCALAPPDATA: path.join(temporary, "local"),
    };
    await recordTrackedSource(
      {
        skillDirectory: "sample",
        sourceUrl: "https://github.com/acme/skills/tree/main/skills/sample",
        repository: "acme/skills",
        ref: "main",
        sourceDirectory: "skills/sample",
        revision: "tree-v1",
        upstreamFingerprint: "upstream-v1",
        localFingerprint: "local-v1",
        trackedAt: "2026-08-04T00:00:00.000Z",
      },
      { env, homeDirectory: temporary },
    );
    const inventory = await discoverSkills({
      env,
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const skill = inventory.skills.find((entry) => entry.name === "sample");
    expect(skill).toBeDefined();

    const review = await inspectSkillRemoval(
      { skillId: skill!.id },
      {
        env,
        homeDirectory: temporary,
        now: new Date("2026-08-04T01:00:00.000Z"),
        idFactory: () => "11111111-1111-4111-8111-111111111111",
      },
    );
    expect(review.removalAllowed).toBe(true);
    expect(review.fingerprint.fileCount).toBe(2);

    const removed = await confirmSkillRemoval(review.planId, {
      env,
      homeDirectory: temporary,
      now: new Date("2026-08-04T01:01:00.000Z"),
      idFactory: () => "22222222-2222-4222-8222-222222222222",
    });
    expect(await exists(skillDirectory)).toBe(false);
    expect(await readFile(path.join(removed.trashDirectory, "assets", "note.txt"), "utf8")).toBe(
      "supporting file",
    );
    expect((await readSourceRegistry({ env, homeDirectory: temporary })).has("sample")).toBe(false);
    expect((await listTrashedSkills({ env, homeDirectory: temporary }))).toHaveLength(1);

    const restored = await restoreTrashedSkill(removed.trashId, {
      env,
      homeDirectory: temporary,
      now: new Date("2026-08-04T01:02:00.000Z"),
      idFactory: () => "33333333-3333-4333-8333-333333333333",
    });
    expect(restored.restoredDirectory).toBe(skillDirectory);
    expect(await readFile(path.join(skillDirectory, "assets", "note.txt"), "utf8")).toBe(
      "supporting file",
    );
    expect((await readSourceRegistry({ env, homeDirectory: temporary })).has("sample")).toBe(true);
    expect(await listTrashedSkills({ env, homeDirectory: temporary })).toEqual([]);

    const restoredInventory = await discoverSkills({
      env,
      homeDirectory: temporary,
      forceRefresh: true,
    });
    expect(restoredInventory.skills.find((entry) => entry.name === "sample")?.id).toBe(skill!.id);
  });

  it("permanently deletes only the reviewed trash record and keeps an audit transaction", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-purge-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillsRoot = path.join(codexHome, "skills");
    await createSkill(skillsRoot, "purged-skill");
    await createSkill(skillsRoot, "retained-skill");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });

    const removedRecords = [];
    for (const [index, name] of ["purged-skill", "retained-skill"].entries()) {
      const skill = inventory.skills.find((entry) => entry.name === name)!;
      const review = await inspectSkillRemoval(
        { skillId: skill.id },
        {
          env,
          homeDirectory: temporary,
          idFactory: () => `11111111-1111-4111-8111-11111111111${index}`,
        },
      );
      removedRecords.push(await confirmSkillRemoval(review.planId, {
        env,
        homeDirectory: temporary,
        idFactory: () => `22222222-2222-4222-8222-22222222222${index}`,
      }));
    }

    const removal = removedRecords[0];
    const review = await inspectPermanentDeletion(
      { trashId: removal.trashId },
      {
        env,
        homeDirectory: temporary,
        now: new Date("2026-08-04T02:00:00.000Z"),
        idFactory: () => "33333333-3333-4333-8333-333333333333",
      },
    );
    expect(review.confirmationText).toBe("purged-skill");
    expect(review.trashDirectory).toBe(removal.trashDirectory);

    const result = await confirmPermanentDeletion(
      { planId: review.planId, confirmationText: "purged-skill" },
      {
        env,
        homeDirectory: temporary,
        now: new Date("2026-08-04T02:01:00.000Z"),
        idFactory: () => "44444444-4444-4444-8444-444444444444",
      },
    );
    expect(result.recoverable).toBe(false);
    expect(result.auditStatus).toBe("recorded");
    expect(result.auditWarning).toBeUndefined();
    expect(await exists(path.dirname(removal.trashDirectory))).toBe(false);
    expect(await exists(removedRecords[1].trashDirectory)).toBe(true);
    expect((await listTrashedSkills({ env, homeDirectory: temporary })).map((record) => record.skillName)).toEqual(["retained-skill"]);

    const audit = JSON.parse(await readFile(
      path.join(codexHome, ".skill-atlas", "transactions", result.auditTransactionId + ".json"),
      "utf8",
    )) as { operation: string; state: string; skillName: string };
    expect(audit).toMatchObject({ operation: "purge", state: "committed", skillName: "purged-skill" });
  });

  it("requires the exact Skill name and consumes the permanent-deletion plan", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-purge-name-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    await createSkill(path.join(codexHome, "skills"), "exact-name");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const skill = inventory.skills.find((entry) => entry.name === "exact-name")!;
    const removalReview = await inspectSkillRemoval({ skillId: skill.id }, { env, homeDirectory: temporary });
    const removed = await confirmSkillRemoval(removalReview.planId, { env, homeDirectory: temporary });
    const review = await inspectPermanentDeletion({ trashId: removed.trashId }, { env, homeDirectory: temporary });

    await expect(confirmPermanentDeletion(
      { planId: review.planId, confirmationText: "Exact-Name" },
      { env, homeDirectory: temporary },
    )).rejects.toThrow(/名称不匹配/);
    await expect(confirmPermanentDeletion(
      { planId: review.planId, confirmationText: "exact-name" },
      { env, homeDirectory: temporary },
    )).rejects.toThrow(/不存在或已被使用/);
    expect(await exists(removed.trashDirectory)).toBe(true);
  });

  it("rejects trash content changed after permanent-deletion review", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-purge-drift-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    await createSkill(path.join(codexHome, "skills"), "drifted-trash");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const skill = inventory.skills.find((entry) => entry.name === "drifted-trash")!;
    const removalReview = await inspectSkillRemoval({ skillId: skill.id }, { env, homeDirectory: temporary });
    const removed = await confirmSkillRemoval(removalReview.planId, { env, homeDirectory: temporary });
    const review = await inspectPermanentDeletion({ trashId: removed.trashId }, { env, homeDirectory: temporary });
    await writeFile(path.join(removed.trashDirectory, "changed.txt"), "changed after review");

    await expect(confirmPermanentDeletion(
      { planId: review.planId, confirmationText: review.confirmationText },
      { env, homeDirectory: temporary },
    )).rejects.toThrow(/审查后发生变化/);
    expect(await exists(removed.trashDirectory)).toBe(true);
  });

  it("rolls an intact quarantine back into trash when permanent removal fails", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-purge-rollback-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    await createSkill(path.join(codexHome, "skills"), "purge-rollback");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const skill = inventory.skills.find((entry) => entry.name === "purge-rollback")!;
    const removalReview = await inspectSkillRemoval({ skillId: skill.id }, { env, homeDirectory: temporary });
    const removed = await confirmSkillRemoval(removalReview.planId, { env, homeDirectory: temporary });
    const review = await inspectPermanentDeletion({ trashId: removed.trashId }, { env, homeDirectory: temporary });

    await expect(confirmPermanentDeletion(
      { planId: review.planId, confirmationText: review.confirmationText },
      {
        env,
        homeDirectory: temporary,
        purgeRemover: async () => {
          throw new Error("simulated purge failure");
        },
      },
    )).rejects.toThrow(/simulated purge failure/);
    expect(await readFile(path.join(removed.trashDirectory, "assets", "note.txt"), "utf8")).toBe("supporting file");
    expect((await listTrashedSkills({ env, homeDirectory: temporary }))).toHaveLength(1);
  });

  it("blocks removal when another installed Skill would lose a hard dependency", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-dependent-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillsRoot = path.join(codexHome, "skills");
    await createSkill(skillsRoot, "required-skill");
    await createSkill(skillsRoot, "consumer", { dependencies: ["required-skill"] });
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({
      env,
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const required = inventory.skills.find((entry) => entry.name === "required-skill");

    const review = await inspectSkillRemoval(
      { skillId: required!.id },
      { env, homeDirectory: temporary },
    );
    expect(review.removalAllowed).toBe(false);
    expect(review.hardDependents.map((entry) => entry.name)).toEqual(["consumer"]);
    await expect(
      confirmSkillRemoval(review.planId, { env, homeDirectory: temporary }),
    ).rejects.toThrow(/阻断风险/);
  });

  it("refuses read-only sources and a Skill changed after review", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-guard-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const personalDirectory = await createSkill(
      path.join(codexHome, "skills"),
      "personal-skill",
    );
    await createSkill(path.join(codexHome, "skills", ".system"), "system-skill");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({
      env,
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const personal = inventory.skills.find((entry) => entry.name === "personal-skill");
    const system = inventory.skills.find((entry) => entry.name === "system-skill");

    await expect(
      inspectSkillRemoval({ skillId: system!.id }, { env, homeDirectory: temporary }),
    ).rejects.toThrow(/只有个人/);

    const review = await inspectSkillRemoval(
      { skillId: personal!.id },
      { env, homeDirectory: temporary },
    );
    await writeFile(path.join(personalDirectory, "assets", "changed.txt"), "changed");
    await expect(
      confirmSkillRemoval(review.planId, { env, homeDirectory: temporary }),
    ).rejects.toThrow(/审查后发生变化/);
    expect(await exists(personalDirectory)).toBe(true);
    expect(await listTrashedSkills({ env, homeDirectory: temporary })).toEqual([]);
  });

  it("rolls back the directory when a post-move transaction step fails", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-rollback-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillDirectory = await createSkill(
      path.join(codexHome, "skills"),
      "rollback-skill",
    );
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({
      env,
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const skill = inventory.skills.find((entry) => entry.name === "rollback-skill");
    const review = await inspectSkillRemoval(
      { skillId: skill!.id },
      { env, homeDirectory: temporary },
    );
    let writes = 0;
    await expect(
      confirmSkillRemoval(review.planId, {
        env,
        homeDirectory: temporary,
        transactionWriter: async () => {
          writes += 1;
          if (writes === 2) throw new Error("simulated journal failure");
        },
      }),
    ).rejects.toThrow(/simulated journal failure/);
    expect(await exists(skillDirectory)).toBe(true);
    expect(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8")).toContain(
      "rollback-skill",
    );
    expect(await listTrashedSkills({ env, homeDirectory: temporary })).toEqual([]);
  });

  it("never overwrites a directory recreated before restore", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-restore-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillDirectory = await createSkill(
      path.join(codexHome, "skills"),
      "conflict-skill",
    );
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({
      env,
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const skill = inventory.skills.find((entry) => entry.name === "conflict-skill");
    const review = await inspectSkillRemoval(
      { skillId: skill!.id },
      { env, homeDirectory: temporary },
    );
    const removed = await confirmSkillRemoval(review.planId, {
      env,
      homeDirectory: temporary,
    });
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(path.join(skillDirectory, "owner.txt"), "new owner");

    await expect(
      restoreTrashedSkill(removed.trashId, { env, homeDirectory: temporary }),
    ).rejects.toThrow(/不会覆盖/);
    expect(await readFile(path.join(skillDirectory, "owner.txt"), "utf8")).toBe(
      "new owner",
    );
    expect((await listTrashedSkills({ env, homeDirectory: temporary }))).toHaveLength(1);
  });

  it("rejects a tampered trash manifest instead of trusting recovery metadata", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-tampered-trash-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    await createSkill(path.join(codexHome, "skills"), "tampered-skill");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const inventory = await discoverSkills({
      env,
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const skill = inventory.skills.find((entry) => entry.name === "tampered-skill");
    const review = await inspectSkillRemoval(
      { skillId: skill!.id },
      { env, homeDirectory: temporary },
    );
    const removed = await confirmSkillRemoval(review.planId, {
      env,
      homeDirectory: temporary,
    });
    const manifestPath = path.join(path.dirname(removed.trashDirectory), "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      fingerprint: { value: string };
    };
    manifest.fingerprint.value = "not-a-valid-fingerprint";
    await writeFile(manifestPath, JSON.stringify(manifest));

    expect(await listTrashedSkills({ env, homeDirectory: temporary })).toEqual([]);
    await expect(
      restoreTrashedSkill(removed.trashId, { env, homeDirectory: temporary }),
    ).rejects.toThrow(/损坏/);
  });
});

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { confirmSkillDisable, disablePlans, enableDisabledSkill, inspectSkillDisable, listDisabledSkills } from "@/core/lifecycle/skill-state";
import { discoverSkills, invalidateSkillInventoryCache } from "@/core/skills/discover";

const temporaryDirectories: string[] = [];
async function exists(location: string) { try { await stat(location); return true; } catch { return false; } }

beforeEach(() => { disablePlans.clear(); invalidateSkillInventoryCache(); });
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("Skill disable lifecycle", () => {
  it("moves a complete Skill outside discovery and restores it in place", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-disable-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillDirectory = path.join(codexHome, "skills", "sample");
    await mkdir(path.join(skillDirectory, "assets"), { recursive: true });
    await writeFile(path.join(skillDirectory, "SKILL.md"), "---\nname: sample\ndescription: Disable fixture.\n---\n\nUse it.");
    await writeFile(path.join(skillDirectory, "assets", "note.txt"), "intact");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const skill = (await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.find((entry) => entry.name === "sample")!;
    const review = await inspectSkillDisable({ skillId: skill.id }, { env, homeDirectory: temporary, idFactory: () => "11111111-1111-4111-8111-111111111111" });
    expect(review.disableAllowed).toBe(true);
    const result = await confirmSkillDisable(review.planId, { env, homeDirectory: temporary, idFactory: () => "22222222-2222-4222-8222-222222222222" });

    expect(await exists(skillDirectory)).toBe(false);
    expect(await readFile(path.join(result.disabledDirectory, "assets", "note.txt"), "utf8")).toBe("intact");
    expect((await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.some((entry) => entry.name === "sample")).toBe(false);
    expect(await listDisabledSkills({ env, homeDirectory: temporary })).toHaveLength(1);

    await enableDisabledSkill(result.disabledId, { env, homeDirectory: temporary, idFactory: () => "33333333-3333-4333-8333-333333333333" });
    expect(await readFile(path.join(skillDirectory, "assets", "note.txt"), "utf8")).toBe("intact");
    expect((await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.some((entry) => entry.name === "sample")).toBe(true);
    expect(await listDisabledSkills({ env, homeDirectory: temporary })).toEqual([]);
  });

  it("rolls back if verification fails after the directory is moved", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-disable-rollback-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillDirectory = path.join(codexHome, "skills", "sample");
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(path.join(skillDirectory, "SKILL.md"), "---\nname: sample\ndescription: Rollback fixture.\n---\n\nUse it.");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const skill = (await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.find((entry) => entry.name === "sample")!;
    const review = await inspectSkillDisable({ skillId: skill.id }, { env, homeDirectory: temporary });
    await expect(confirmSkillDisable(review.planId, { env, homeDirectory: temporary, checkpoint: (state) => { if (state === "moved") throw new Error("simulated failure"); } })).rejects.toThrow();
    expect(await exists(skillDirectory)).toBe(true);
    expect(await readFile(path.join(skillDirectory, "SKILL.md"), "utf8")).toContain("Rollback fixture");
  });
});

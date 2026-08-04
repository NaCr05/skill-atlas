import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { discoverSkills, invalidateSkillInventoryCache } from "@/core/skills/discover";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("skill discovery and classification", () => {
  it("classifies fixture Skills and preserves source permissions", async () => {
    const codexHome = path.resolve("tests/fixtures/codex-home");
    const inventory = await discoverSkills({
      env: { CODEX_HOME: codexHome, USERPROFILE: path.resolve("tests/fixtures/user-profile"), LOCALAPPDATA: path.resolve("tests/fixtures/local-app-data") },
      homeDirectory: path.resolve("tests/fixtures/user-profile"),
    });

    const ready = inventory.skills.find((skill) => skill.name === "ready-skill");
    const explicit = inventory.skills.find((skill) => skill.name === "explicit-skill");
    const needsPeer = inventory.skills.find((skill) => skill.name === "needs-peer");
    const invalid = inventory.skills.find((skill) => skill.directoryPath.endsWith("bad-metadata"));

    expect(ready?.status).toBe("usable");
    expect(ready?.structureStatus).toBe("valid");
    expect(ready?.environmentStatus).toBe("ready");
    expect(ready?.fingerprint.complete).toBe(true);
    expect(ready?.fingerprint.fileCount).toBeGreaterThan(0);
    expect(ready?.sourceTracking.status).toBe("untracked");
    expect(explicit?.status).toBe("explicit-only");
    expect(explicit?.structureStatus).toBe("valid");
    expect(explicit?.environmentStatus).toBe("ready");
    expect(needsPeer?.status).toBe("missing-dependency");
    expect(needsPeer?.structureStatus).toBe("valid");
    expect(needsPeer?.environmentStatus).toBe("needs-setup");
    expect(invalid?.status).toBe("invalid-metadata");
    expect(invalid?.structureStatus).toBe("invalid");
    expect(invalid?.environmentStatus).toBe("blocked");
    const duplicates = inventory.skills.filter((skill) => skill.name === "duplicate-demo");
    expect(duplicates).toHaveLength(2);
    expect(duplicates.find((skill) => skill.source.kind === "personal")?.secondaryStatuses).toContain("duplicate");
    expect(duplicates.find((skill) => skill.source.kind === "system")?.status).toBe("duplicate");
  });

  it("keeps only the active version of each plugin", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-plugins-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const cacheRoot = path.join(codexHome, "plugins", "cache");

    async function addPluginSkill(channel: string, plugin: string, version: string, skillName: string) {
      const versionRoot = path.join(cacheRoot, channel, plugin, version);
      const skillRoot = path.join(versionRoot, "skills", skillName);
      await mkdir(path.join(versionRoot, ".codex-plugin"), { recursive: true });
      await mkdir(skillRoot, { recursive: true });
      await writeFile(path.join(versionRoot, ".codex-plugin", "plugin.json"), JSON.stringify({ version }));
      await writeFile(path.join(skillRoot, "SKILL.md"), `---\nname: ${skillName}\ndescription: Fixture plugin skill for ${version}.\n---\n\nRun the fixture.`);
      return versionRoot;
    }

    await mkdir(codexHome, { recursive: true });
    await writeFile(path.join(codexHome, "config.toml"), '[plugins."chrome@openai-bundled"]\nenabled = true\n');
    const older = await addPluginSkill("openai-bundled", "chrome", "1.0.0", "old-browser");
    const current = await addPluginSkill("openai-bundled", "chrome", "2.0.0", "current-browser");
    await utimes(older, new Date("2025-01-01"), new Date("2025-01-01"));
    await utimes(current, new Date("2026-01-01"), new Date("2026-01-01"));
    await addPluginSkill("chatgpt-global", "github", "0.1.5", "inactive-github");
    await addPluginSkill("openai-curated-remote", "github", "0.1.8", "active-github");
    await writeFile(path.join(cacheRoot, "openai-curated-remote", "github", ".codex-remote-plugin-install.json"), "{}");

    const inventory = await discoverSkills({
      env: { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") },
      homeDirectory: temporary,
      forceRefresh: true,
    });

    expect(inventory.skills.map((skill) => skill.name)).toEqual(expect.arrayContaining(["current-browser", "active-github"]));
    expect(inventory.skills.map((skill) => skill.name)).not.toEqual(expect.arrayContaining(["old-browser", "inactive-github"]));
    expect(inventory.skills.find((skill) => skill.name === "current-browser")?.plugin).toEqual({
      channel: "openai-bundled",
      name: "chrome",
      version: "2.0.0",
    });
  });

  it("serves a short-lived cache and invalidates it on demand", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-cache-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillRoot = path.join(codexHome, "skills", "cache-fixture");
    const options = {
      env: { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") },
      homeDirectory: temporary,
    };
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: cache-fixture\ndescription: Verifies inventory cache behavior.\n---\n\nRun the fixture.");

    const first = await discoverSkills({ ...options, forceRefresh: true });
    const cached = await discoverSkills(options);
    expect(first.cache.hit).toBe(false);
    expect(cached.cache.hit).toBe(true);
    expect(cached.scannedAt).toBe(first.scannedAt);

    invalidateSkillInventoryCache(options);
    const refreshed = await discoverSkills(options);
    expect(refreshed.cache.hit).toBe(false);
  });

  it("recommends related Skills from explicit signals without generic false positives", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-relations-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skills = [
      ["browser-a", "Automates browser testing and page inspection.", "browser, automation"],
      ["browser-b", "Reviews browser interfaces and interaction flows.", "browser, review"],
      ["release-note", "Writes product release summaries.", "release, documentation"],
    ];
    await Promise.all(skills.map(async ([name, description, tags]) => {
      const root = path.join(codexHome, "skills", name);
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\ntags: [${tags}]\n---\n\nRun the workflow.`);
    }));

    const inventory = await discoverSkills({
      env: { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") },
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const browser = inventory.skills.find((skill) => skill.name === "browser-a");
    expect(browser?.relationships.map((relationship) => relationship.name)).toContain("browser-b");
    expect(browser?.relationships.map((relationship) => relationship.name)).not.toContain("release-note");
    expect(browser?.relationships[0]?.reason).toContain("共同标签");
  });

  it("does not treat code examples or prose Skill references as hard dependencies", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-reference-regression-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const fixtures = [
      ["imagegen", "Generates images.", "Run image generation."],
      ["hatch-pet", "Builds an animated pet.", "Use $imagegen first.\n\n```powershell\n$source = 'art.png'\n$package = 'pet.zip'\n```"],
      ["shutaai-extract-pdf", "Extracts course PDFs.", "In PowerShell, download with `curl.exe --output $dest $assetUrl`.\n\n```powershell\n$dest = Join-Path $course 'lecture.pdf'\n```"],
    ];
    await Promise.all(fixtures.map(async ([name, description, instructions]) => {
      const root = path.join(codexHome, "skills", name);
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${instructions}`);
    }));

    const inventory = await discoverSkills({
      env: { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") },
      homeDirectory: temporary,
      forceRefresh: true,
    });
    const hatchPet = inventory.skills.find((skill) => skill.name === "hatch-pet");
    const extractor = inventory.skills.find((skill) => skill.name === "shutaai-extract-pdf");

    expect(hatchPet).toMatchObject({
      status: "usable",
      environmentStatus: "ready",
      dependencies: [],
      referencedSkills: ["imagegen"],
      missingDependencies: [],
    });
    expect(hatchPet?.relationships[0]).toMatchObject({
      name: "imagegen",
      reason: "Skill 说明中引用",
    });
    expect(extractor).toMatchObject({
      status: "usable",
      environmentStatus: "ready",
      dependencies: [],
      referencedSkills: [],
      missingDependencies: [],
    });
  });

  it("scans 500 direct Skill directories in under five seconds", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-perf-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillsRoot = path.join(codexHome, "skills");
    await mkdir(skillsRoot, { recursive: true });
    await Promise.all(Array.from({ length: 500 }, async (_, index) => {
      const directory = path.join(skillsRoot, `skill-${index}`);
      await mkdir(directory);
      await writeFile(path.join(directory, "SKILL.md"), `---\nname: skill-${index}\ndescription: Fixture skill number ${index} for scan performance.\n---\n\nDo the fixture task.`);
    }));

    const inventory = await discoverSkills({ env: { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") }, homeDirectory: temporary });
    expect(inventory.skills).toHaveLength(500);
    expect(inventory.durationMs).toBeLessThan(5_000);
  }, 15_000);
});

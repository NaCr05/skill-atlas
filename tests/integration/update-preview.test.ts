import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gitBlobSha } from "@/core/lifecycle/fingerprint";
import { confirmSkillUpdate } from "@/core/lifecycle/apply-update";
import { confirmSourceTracking, inspectSkillUpdate, updatePreviewPlans } from "@/core/lifecycle/inspect-update";
import { readSourceRegistry } from "@/core/lifecycle/source-registry";
import { persistLifecycleTransaction } from "@/core/lifecycle/transaction-store";
import { discoverSkills, invalidateSkillInventoryCache } from "@/core/skills/discover";

const temporaryDirectories: string[] = [];
const sourceUrl = "https://github.com/acme/skills/tree/main/skills/sample";

function blob(content: string) {
  return { content: Buffer.from(content).toString("base64"), encoding: "base64" };
}

function mockGithub(skillContent: string, scriptContent: string) {
  const skillBlobUrl = "https://api.github.com/repos/acme/skills/git/blobs/skill-v2";
  const scriptBlobUrl = "https://api.github.com/repos/acme/skills/git/blobs/script-v2";
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/git/trees/main")) {
      return Response.json({
        sha: "tree-main-v2",
        tree: [
          {
            path: "skills/sample/SKILL.md",
            mode: "100644",
            type: "blob",
            sha: gitBlobSha(Buffer.from(skillContent)),
            size: Buffer.byteLength(skillContent),
            url: skillBlobUrl,
          },
          {
            path: "skills/sample/scripts/run.ps1",
            mode: "100644",
            type: "blob",
            sha: gitBlobSha(Buffer.from(scriptContent)),
            size: Buffer.byteLength(scriptContent),
            url: scriptBlobUrl,
          },
        ],
      });
    }
    if (url === skillBlobUrl) return Response.json(blob(skillContent));
    if (url === scriptBlobUrl) return Response.json(blob(scriptContent));
    return new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;
  return fetcher;
}

beforeEach(() => {
  updatePreviewPlans.clear();
  invalidateSkillInventoryCache();
});

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("transactional Skill update", () => {
  it("compares every file, preserves the installed Skill, and records approved provenance", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-update-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillRoot = path.join(codexHome, "skills", "sample");
    const localSkill = "---\nname: sample\ndescription: Local version one.\n---\n\nUse the local workflow.";
    const upstreamSkill = "---\nname: sample\ndescription: Upstream version two.\n---\n\nUse the upstream workflow.";
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") };
    const fetcher = mockGithub(upstreamSkill, "Write-Output 'upstream'");

    await mkdir(path.join(skillRoot, "assets"), { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), localSkill);
    await writeFile(path.join(skillRoot, "assets", "local.txt"), "local-only");
    const inventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const skill = inventory.skills.find((entry) => entry.name === "sample");
    expect(skill).toBeDefined();

    const preview = await inspectSkillUpdate({ skillId: skill!.id, sourceUrl }, {
      env,
      homeDirectory: temporary,
      fetcher,
      skill,
      now: new Date("2026-08-03T00:00:00.000Z"),
    });

    expect(preview.previewOnly).toBe(false);
    expect(preview.updateAllowed).toBe(true);
    expect(preview.status).toBe("differences-found");
    expect(preview.summary).toMatchObject({ added: 1, modified: 1, removed: 1 });
    expect(preview.changes.map((change) => `${change.kind}:${change.path}`)).toEqual([
      "modified:SKILL.md",
      "added:scripts/run.ps1",
      "removed:assets/local.txt",
    ]);
    expect(preview.risks.map((risk) => risk.code)).toEqual(expect.arrayContaining([
      "transactional-update",
      "new-or-modified-scripts",
      "metadata-changed",
    ]));
    expect(await readFile(path.join(skillRoot, "SKILL.md"), "utf8")).toBe(localSkill);
    await expect(readFile(path.join(skillRoot, "scripts", "run.ps1"), "utf8")).rejects.toThrow();

    await confirmSourceTracking(preview.previewId, {
      env,
      homeDirectory: temporary,
      skill,
      now: new Date("2026-08-03T00:01:00.000Z"),
    });
    const registry = await readSourceRegistry({ env, homeDirectory: temporary });
    expect(registry.get("sample")?.sourceUrl).toBe(sourceUrl);

    const trackedInventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const trackedSkill = trackedInventory.skills.find((entry) => entry.name === "sample");
    expect(trackedSkill?.sourceTracking.status).toBe("tracked");

    await writeFile(path.join(skillRoot, "assets", "local.txt"), "changed-after-tracking");
    const changedInventory = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const changedSkill = changedInventory.skills.find((entry) => entry.name === "sample");
    const changedPreview = await inspectSkillUpdate({ skillId: changedSkill!.id }, {
      env,
      homeDirectory: temporary,
      fetcher,
      skill: changedSkill,
      now: new Date("2026-08-03T00:02:00.000Z"),
    });
    expect(changedPreview.status).toBe("local-changes");
    expect(changedPreview.localDiverged).toBe(true);
    expect(changedPreview.risks.some((risk) => risk.code === "local-divergence")).toBe(true);
  });

  it("downloads to staging, preserves the old version as a verified backup, and atomically installs the new version", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-update-apply-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillRoot = path.join(codexHome, "skills", "sample");
    const localSkill = "---\nname: sample\ndescription: Local version one.\n---\n\nLocal.";
    const upstreamSkill = "---\nname: sample\ndescription: Upstream version two.\n---\n\nUpstream.";
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), localSkill);
    const skill = (await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.find((entry) => entry.name === "sample")!;
    const preview = await inspectSkillUpdate({ skillId: skill.id, sourceUrl }, { env, homeDirectory: temporary, fetcher: mockGithub(upstreamSkill, "Write-Output 'safe'"), skill });

    const result = await confirmSkillUpdate(preview.previewId, {
      env,
      homeDirectory: temporary,
      fetcher: mockGithub(upstreamSkill, "Write-Output 'safe'"),
      idFactory: () => "11111111-1111-4111-8111-111111111111",
    });

    expect(await readFile(path.join(skillRoot, "SKILL.md"), "utf8")).toBe(upstreamSkill);
    expect(await readFile(path.join(skillRoot, "scripts", "run.ps1"), "utf8")).toContain("safe");
    expect(await readFile(path.join(result.backupDirectory, "SKILL.md"), "utf8")).toBe(localSkill);
    expect(result.installedFingerprint.value).not.toBe(result.previousFingerprint.value);
    expect((await readSourceRegistry({ env, homeDirectory: temporary })).get("sample")?.revision).toBe("tree-main-v2");
  });

  it("restores the reviewed original when failure is injected after replacement", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-update-rollback-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillRoot = path.join(codexHome, "skills", "sample");
    const localSkill = "---\nname: sample\ndescription: Original version.\n---\n\nOriginal.";
    const upstreamSkill = "---\nname: sample\ndescription: Replacement version.\n---\n\nReplacement.";
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), localSkill);
    const fetcher = mockGithub(upstreamSkill, "Write-Output 'replacement'");
    const skill = (await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true })).skills.find((entry) => entry.name === "sample")!;
    const preview = await inspectSkillUpdate({ skillId: skill.id, sourceUrl }, { env, homeDirectory: temporary, fetcher, skill });

    await expect(confirmSkillUpdate(preview.previewId, {
      env,
      homeDirectory: temporary,
      fetcher,
      idFactory: () => "22222222-2222-4222-8222-222222222222",
      transactionWriter: async (transaction) => {
        if (transaction.state === "committed") throw new Error("simulated final journal failure");
        await persistLifecycleTransaction(transaction, { env, homeDirectory: temporary });
      },
    })).rejects.toThrow();

    expect(await readFile(path.join(skillRoot, "SKILL.md"), "utf8")).toBe(localSkill);
    const transaction = JSON.parse(await readFile(path.join(codexHome, ".skill-atlas", "transactions", "22222222-2222-4222-8222-222222222222.json"), "utf8")) as { state: string };
    expect(transaction.state).toBe("rolled-back");
    expect((await readSourceRegistry({ env, homeDirectory: temporary })).has("sample")).toBe(false);
  });
});

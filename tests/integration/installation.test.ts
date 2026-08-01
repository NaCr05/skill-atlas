import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { confirmInstallation } from "@/core/installer/install-skill";
import { inspectGithubSkill, installationPlans } from "@/core/installer/inspect-source";

const temporaryDirectories: string[] = [];
const sourceUrl = "https://github.com/acme/skills/tree/main/skills/sample";

function blob(content: string) {
  return { content: Buffer.from(content).toString("base64"), encoding: "base64" };
}

function mockGithub(extraPath = "assets/note.txt") {
  const skill = `---\nname: sample\ndescription: Safe fixture for installation.\n---\n\nUse carefully.`;
  const files = new Map([
    ["https://api.github.com/repos/acme/skills/git/blobs/skill", blob(skill)],
    ["https://api.github.com/repos/acme/skills/git/blobs/script", blob("Write-Output 'fixture'")],
    ["https://api.github.com/repos/acme/skills/git/blobs/note", blob("supporting file")],
  ]);
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/git/trees/main")) {
      return Response.json({ tree: [
        { path: "skills/sample/SKILL.md", mode: "100644", type: "blob", size: Buffer.byteLength(skill), url: "https://api.github.com/repos/acme/skills/git/blobs/skill" },
        { path: "skills/sample/scripts/run.ps1", mode: "100644", type: "blob", size: Buffer.byteLength("Write-Output 'fixture'"), url: "https://api.github.com/repos/acme/skills/git/blobs/script" },
        { path: `skills/sample/${extraPath}`, mode: "100644", type: "blob", size: Buffer.byteLength("supporting file"), url: "https://api.github.com/repos/acme/skills/git/blobs/note" },
      ] });
    }
    const payload = files.get(url);
    return payload ? Response.json(payload) : new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;
  return fetcher;
}

beforeEach(() => installationPlans.clear());
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("confirmation-gated installation", () => {
  it("reviews then installs the complete directory without executing scripts", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-install-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary, LOCALAPPDATA: path.join(temporary, "local") };
    const fetcher = mockGithub();

    const review = await inspectGithubSkill({ sourceUrl }, { env, homeDirectory: temporary, fetcher });
    expect(review.installAllowed).toBe(true);
    expect(review.files.map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.ps1", "assets/note.txt"]);
    expect(review.risks.some((risk) => risk.title.includes("可执行脚本"))).toBe(true);

    const result = await confirmInstallation(review.planId, { env, homeDirectory: temporary, fetcher });
    expect(result.targetDirectory).toBe(path.join(codexHome, "skills", "sample"));
    expect(await readFile(path.join(result.targetDirectory, "assets", "note.txt"), "utf8")).toBe("supporting file");
    expect(await readFile(path.join(result.targetDirectory, "scripts", "run.ps1"), "utf8")).toContain("fixture");
  });

  it("blocks traversal before a confirmation plan can be used", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-traversal-"));
    temporaryDirectories.push(temporary);
    const env = { CODEX_HOME: path.join(temporary, ".codex"), USERPROFILE: temporary };
    await expect(inspectGithubSkill({ sourceUrl }, { env, homeDirectory: temporary, fetcher: mockGithub("../escape.txt") })).rejects.toThrow(/不安全|穿越/);
  });

  it("blocks existing targets and never overwrites them", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-overwrite-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const target = path.join(codexHome, "skills", "sample");
    await mkdir(target, { recursive: true });
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const review = await inspectGithubSkill({ sourceUrl }, { env, homeDirectory: temporary, fetcher: mockGithub() });
    expect(review.installAllowed).toBe(false);
    expect(review.risks.some((risk) => risk.title === "目标目录已存在")).toBe(true);
    await expect(confirmInstallation(review.planId, { env, homeDirectory: temporary, fetcher: mockGithub() })).rejects.toThrow(/阻断风险/);
  });
});

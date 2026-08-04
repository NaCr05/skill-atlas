import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { confirmInstallation } from "@/core/installer/install-skill";
import { inspectGithubSkill, installationPlans } from "@/core/installer/inspect-source";
import { gitBlobSha } from "@/core/lifecycle/fingerprint";

const temporaryDirectories: string[] = [];
const sourceUrl = "https://github.com/acme/skills/tree/main/skills/sample";

function blob(content: string) {
  return { content: Buffer.from(content).toString("base64"), encoding: "base64" };
}

function mockGithub(extraPath = "assets/note.txt") {
  const skill = `---\nname: sample\ndescription: Safe fixture for installation.\n---\n\nUse carefully.`;
  const script = "Write-Output 'fixture'";
  const note = "supporting file";
  const files = new Map([
    ["https://api.github.com/repos/acme/skills/git/blobs/skill", blob(skill)],
    ["https://api.github.com/repos/acme/skills/git/blobs/script", blob(script)],
    ["https://api.github.com/repos/acme/skills/git/blobs/note", blob(note)],
  ]);
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === "https://api.github.com/repos/acme/skills") {
      return Response.json({
        owner: { login: "acme", type: "Organization" },
        license: { spdx_id: "MIT" },
        archived: false,
        stargazers_count: 420,
        open_issues_count: 7,
        pushed_at: "2026-08-01T00:00:00.000Z",
      });
    }
    if (url.includes("/commits?")) {
      return Response.json([{
        author: { login: "maintainer" },
        commit: { author: { name: "Maintainer", date: "2026-08-01T00:00:00.000Z" }, committer: { date: "2026-08-01T01:00:00.000Z" }, message: "Release sample v2\n\nDetails" },
      }]);
    }
    if (url.includes("/git/trees/main")) {
      return Response.json({ sha: "tree-main-v1", tree: [
        { path: "skills/sample/SKILL.md", mode: "100644", type: "blob", sha: gitBlobSha(Buffer.from(skill)), size: Buffer.byteLength(skill), url: "https://api.github.com/repos/acme/skills/git/blobs/skill" },
        { path: "skills/sample/scripts/run.ps1", mode: "100644", type: "blob", sha: gitBlobSha(Buffer.from(script)), size: Buffer.byteLength(script), url: "https://api.github.com/repos/acme/skills/git/blobs/script" },
        { path: `skills/sample/${extraPath}`, mode: "100644", type: "blob", sha: gitBlobSha(Buffer.from(note)), size: Buffer.byteLength(note), url: "https://api.github.com/repos/acme/skills/git/blobs/note" },
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
    expect(review.revision).toBe("tree-main-v1");
    expect(review.fingerprint.fileCount).toBe(3);
    expect(review.files.map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.ps1", "assets/note.txt"]);
    expect(review.sourceTrust).toMatchObject({
      repositoryOwner: "acme",
      ownerType: "Organization",
      licenseSpdx: "MIT",
      stars: 420,
      openIssues: 7,
      latestCommitAuthor: "maintainer",
      activity: "active",
      lock: { repository: "acme/skills", ref: "main", revision: "tree-main-v1" },
    });
    expect(review.sourceTrust.lock.fingerprint).toBe(review.fingerprint.value);
    expect(review.sourceTrust.latestCommitMessage).toBe("Release sample v2");
    expect(review.risks.some((risk) => risk.title.includes("可执行脚本"))).toBe(true);

    const result = await confirmInstallation(review.planId, { env, homeDirectory: temporary, fetcher });
    expect(result.targetDirectory).toBe(path.join(codexHome, "skills", "sample"));
    expect(await readFile(path.join(result.targetDirectory, "assets", "note.txt"), "utf8")).toBe("supporting file");
    expect(await readFile(path.join(result.targetDirectory, "scripts", "run.ps1"), "utf8")).toContain("fixture");
    expect(result.sourceTracking).toBe("recorded");
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

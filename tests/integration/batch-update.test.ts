import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gitBlobSha } from "@/core/lifecycle/fingerprint";
import { recordTrackedSource } from "@/core/lifecycle/source-registry";
import { inspectAllTrackedUpdates, markBatchUpdateApplied, readBatchUpdateOverview } from "@/core/lifecycle/update-batch";
import { discoverSkills, invalidateSkillInventoryCache } from "@/core/skills/discover";

const temporaryDirectories: string[] = [];

async function createSkill(root: string, name: string, description: string) {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\nUse safely.`);
  return directory;
}

function githubFetcher(upstream: string) {
  const blobUrl = "https://api.github.com/repos/acme/skills/git/blobs/alpha";
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/repos/broken/skills/git/trees/")) return new Response("failure", { status: 503 });
    if (url.includes("/repos/acme/skills/git/trees/main")) return Response.json({
      sha: "tree-alpha-v2",
      tree: [{ path: "skills/alpha/SKILL.md", mode: "100644", type: "blob", sha: gitBlobSha(Buffer.from(upstream)), size: Buffer.byteLength(upstream), url: blobUrl }],
    });
    if (url === blobUrl) return Response.json({ content: Buffer.from(upstream).toString("base64"), encoding: "base64" });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

beforeEach(() => invalidateSkillInventoryCache());
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("batch upstream update checks", () => {
  it("checks all tracked manageable Skills, retains failures, and caches the overview", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-batch-update-"));
    temporaryDirectories.push(temporary);
    const codexHome = path.join(temporary, ".codex");
    const skillsRoot = path.join(codexHome, "skills");
    await createSkill(skillsRoot, "alpha", "Local alpha version.");
    await createSkill(skillsRoot, "broken", "Local broken version.");
    const env = { CODEX_HOME: codexHome, USERPROFILE: temporary };
    const initial = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    for (const skill of initial.skills.filter((entry) => ["alpha", "broken"].includes(entry.name))) {
      const owner = skill.name === "alpha" ? "acme" : "broken";
      await recordTrackedSource({
        skillDirectory: skill.name,
        sourceUrl: `https://github.com/${owner}/skills/tree/main/skills/${skill.name}`,
        repository: `${owner}/skills`,
        ref: "main",
        sourceDirectory: `skills/${skill.name}`,
        revision: "tree-v1",
        upstreamFingerprint: skill.fingerprint.value,
        localFingerprint: skill.fingerprint.value,
        trackedAt: "2026-08-04T00:00:00.000Z",
      }, { env, homeDirectory: temporary });
    }
    const tracked = await discoverSkills({ env, homeDirectory: temporary, forceRefresh: true });
    const upstream = "---\nname: alpha\ndescription: Upstream alpha version.\n---\n\nUse safely.";

    const result = await inspectAllTrackedUpdates({
      env,
      homeDirectory: temporary,
      skills: tracked.skills,
      fetcher: githubFetcher(upstream),
      now: new Date("2026-08-04T01:00:00.000Z"),
    });

    expect(result).toMatchObject({ trackedCount: 2, updateCount: 1, failedCount: 1 });
    expect(result.records.find((record) => record.skillName === "alpha")).toMatchObject({ status: "update-available", revision: "tree-alpha-v2" });
    expect(result.records.find((record) => record.skillName === "broken")).toMatchObject({ status: "failed", errorCode: "UPSTREAM_CHECK_FAILED" });
    expect(await readBatchUpdateOverview({ env, homeDirectory: temporary })).toEqual(result);

    const updated = await markBatchUpdateApplied(
      result.records.find((record) => record.skillName === "alpha")!.skillId,
      "tree-alpha-v2",
      { env, homeDirectory: temporary, now: new Date("2026-08-04T01:05:00.000Z") },
    );
    expect(updated).toMatchObject({ updateCount: 0, failedCount: 1 });
    expect(updated.records.find((record) => record.skillName === "alpha")).toMatchObject({ status: "up-to-date", previewId: undefined });
  });
});

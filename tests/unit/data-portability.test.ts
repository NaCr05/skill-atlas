import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createPortableServerData, inspectPortableImport } from "@/core/data-portability";

const temporaryDirectories: string[] = [];
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("local data portability", () => {
  it("exports model configuration and local records without API keys", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-export-"));
    temporaryDirectories.push(temporary);
    const secret = "must-never-appear-in-export";
    const data = await createPortableServerData({ env: { CODEX_HOME: path.join(temporary, ".codex"), USERPROFILE: temporary, OPENAI_API_KEY: secret, OPENAI_MODEL: "gpt-test", AI_PROVIDER: "openai" }, homeDirectory: temporary });
    expect(data.ai).toMatchObject({ selection: "openai", models: { openai: "gpt-test" }, secretsExcluded: true });
    expect(JSON.stringify(data)).not.toContain(secret);
  });

  it("creates a bounded, merge-only review before import", () => {
    const server = { operations: [], sourceRegistry: [], sourcePolicy: { version: 1, trustedOwners: ["openai"], trustedRepositories: ["openai/skills"], trustMode: "advisory", licenseMode: "advisory", allowedLicenses: ["MIT"], warnArchived: true }, ai: { selection: "auto", models: { openai: "", deepseek: "" }, secretsExcluded: true } };
    expect(inspectPortableImport(server)).toMatchObject({ strategy: "merge", apiKeysExcluded: true, counts: { operations: 0, sources: 0, trustedOwners: 1, trustedRepositories: 1 } });
  });
});

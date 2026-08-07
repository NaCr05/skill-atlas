import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const documentationFiles = ["README.md", "README.zh-CN.md", "docs/quick-start.md"];

describe("repeatable startup documentation", () => {
  it.each(documentationFiles)("keeps %s safe for first and later launches", async (relativePath) => {
    const content = await readFile(path.join(projectRoot, relativePath), "utf8");

    expect(content).toContain('if not exist "%USERPROFILE%\\skill-atlas\\.git" git clone');
    expect(content).toContain('$skillAtlasRepo = Join-Path $HOME "skill-atlas"');
    expect(content).toContain("git switch main");
    expect(content).toContain("git pull --ff-only origin main");
    expect(content).toContain("npm.cmd ci");
    expect(content).toContain("Browser opened:");
    expect(content).not.toMatch(/\[http:\/\/127\.0\.0\.1:3000\]/);
  });
});

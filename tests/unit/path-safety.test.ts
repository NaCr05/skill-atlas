import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseGithubSkillUrl, validateRelativePath } from "@/core/installer/inspect-source";
import { isPathInside, resolveCodexEnvironment } from "@/core/skills/paths";

describe("path safety", () => {
  it("resolves an explicit absolute CODEX_HOME", () => {
    const root = path.resolve("C:/fixture/codex");
    const result = resolveCodexEnvironment({ CODEX_HOME: root }, "C:/fallback");
    expect(result.codexHome).toBe(root);
    expect(result.detectedFrom).toBe("CODEX_HOME");
  });

  it("rejects traversal and non-GitHub sources", () => {
    expect(() => validateRelativePath("../escape.txt")).toThrow(/不安全|穿越/);
    expect(() => parseGithubSkillUrl("https://example.com/acme/repo")).toThrow(/github.com/);
  });

  it("uses segment-aware containment checks", () => {
    const root = path.resolve("C:/skills");
    expect(isPathInside(root, path.join(root, "demo"))).toBe(true);
    expect(isPathInside(root, path.resolve("C:/skills-escape/demo"))).toBe(false);
  });
});

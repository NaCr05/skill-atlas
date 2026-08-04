import { describe, expect, it } from "vitest";

import { parseSkillDocument } from "@/core/skills/parse";

describe("parseSkillDocument", () => {
  it("reads Skill and agents metadata without treating the body as authority", () => {
    const parsed = parseSkillDocument(
      `---\nname: design-review\ndescription: Reviews interface decisions.\nauthor: Acme\ntags: [ui, review]\ndependencies:\n  skills: [frontend-design]\nrelated_skills: [web-design-guidelines]\n---\nUse $codebase-design first.`,
      "folder",
      `interface:\n  display_name: Design Review\n  default_prompt: "$design-review\\n\\nReview this UI."\npolicy:\n  allow_implicit_invocation: false\ndependencies:\n  skills:\n    - name: ui-ux-pro-max`,
    );

    expect(parsed.name).toBe("design-review");
    expect(parsed.displayName).toBe("Design Review");
    expect(parsed.allowImplicitInvocation).toBe(false);
    expect(parsed.dependencies).toEqual(["frontend-design", "ui-ux-pro-max"]);
    expect(parsed.referencedSkills).toEqual(["web-design-guidelines", "codebase-design"]);
    expect(parsed.tags).toEqual(["ui", "review"]);
    expect(parsed.metadataValid).toBe(true);
  });

  it("ignores shell variables inside fenced code while preserving prose Skill references", () => {
    const parsed = parseSkillDocument(
      `---\nname: hatch-pet\ndescription: Builds an animated pet.\n---\nUse $imagegen before packaging.\n\n\`\`\`powershell\n$dest = Join-Path $source "pet"\nWrite-Output $package\n\`\`\`\n\n~~~sh\njq '$at | .[$id]' file.json\n~~~`,
      "hatch-pet",
    );

    expect(parsed.dependencies).toEqual([]);
    expect(parsed.referencedSkills).toEqual(["imagegen"]);
  });

  it("keeps malformed documents visible with fallback metadata", () => {
    const parsed = parseSkillDocument("# Missing metadata", "fallback-name");
    expect(parsed.name).toBe("fallback-name");
    expect(parsed.metadataValid).toBe(false);
    expect(parsed.issues).toContain("缺少 YAML frontmatter");
  });

  it("does not expose broken encoding as a normal Skill description", () => {
    const parsed = parseSkillDocument(
      `---\nname: broken-copy\ndescription: Plan a large effort â€” one decision at a time.\n---\nInstructions.`,
      "broken-copy",
    );

    expect(parsed.metadataValid).toBe(false);
    expect(parsed.description).toContain("异常编码字符");
    expect(parsed.description).not.toContain("â€");
    expect(parsed.issues).toEqual(expect.arrayContaining([expect.stringContaining("UTF-8")]));
  });
});

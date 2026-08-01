import { describe, expect, it } from "vitest";

import { parseSkillDocument } from "@/core/skills/parse";

describe("parseSkillDocument", () => {
  it("reads Skill and agents metadata without treating the body as authority", () => {
    const parsed = parseSkillDocument(
      `---\nname: design-review\ndescription: Reviews interface decisions.\nauthor: Acme\ntags: [ui, review]\n---\nUse $codebase-design first.`,
      "folder",
      `interface:\n  display_name: Design Review\n  default_prompt: "$design-review\\n\\nReview this UI."\npolicy:\n  allow_implicit_invocation: false`,
    );

    expect(parsed.name).toBe("design-review");
    expect(parsed.displayName).toBe("Design Review");
    expect(parsed.allowImplicitInvocation).toBe(false);
    expect(parsed.dependencies).toContain("codebase-design");
    expect(parsed.tags).toEqual(["ui", "review"]);
    expect(parsed.metadataValid).toBe(true);
  });

  it("keeps malformed documents visible with fallback metadata", () => {
    const parsed = parseSkillDocument("# Missing metadata", "fallback-name");
    expect(parsed.name).toBe("fallback-name");
    expect(parsed.metadataValid).toBe(false);
    expect(parsed.issues).toContain("缺少 YAML frontmatter");
  });
});

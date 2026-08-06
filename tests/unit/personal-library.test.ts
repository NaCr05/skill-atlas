import { describe, expect, it } from "vitest";

import {
  createWorkflowPrompt,
  emptyPersonalLibrary,
  markPromptRecipeUsed,
  normalizePersonalLibrary,
  recordSkillFeedback,
  savePromptRecipe,
  saveSkillWorkflow,
  skillFeedbackScore,
  taskWithRequirements,
} from "@/core/personal-library";

describe("personal Prompt library", () => {
  it("saves and reuses a bounded Prompt recipe", () => {
    const created = savePromptRecipe(emptyPersonalLibrary(), {
      name: "论文清洗配方",
      skillId: "pandas-id",
      skillName: "jupyter-notebook",
      task: "清洗实验数据",
      requirements: "使用中文并保留原始列",
      language: "zh",
    }, new Date("2026-08-01T00:00:00.000Z"));
    expect(created.recipes[0]).toMatchObject({ name: "论文清洗配方", skillName: "jupyter-notebook", useCount: 0 });

    const used = markPromptRecipeUsed(created, created.recipes[0].id, new Date("2026-08-02T00:00:00.000Z"));
    expect(used.recipes[0]).toMatchObject({ useCount: 1, lastUsedAt: "2026-08-02T00:00:00.000Z" });
    expect(taskWithRequirements(used.recipes[0].task, used.recipes[0].requirements, "zh")).toContain("自定义要求：");
  });

  it("keeps workflow order in the deterministic combined Prompt", () => {
    const library = saveSkillWorkflow(emptyPersonalLibrary(), {
      name: "网站交付链路",
      skillNames: ["define-goal", "frontend-design", "frontend-design-review", "build-engineering-harness"],
      task: "从零搭建网站",
      requirements: "先审查再实施",
      language: "zh",
    }, new Date("2026-08-01T00:00:00.000Z"));
    const prompt = createWorkflowPrompt(library.workflows[0], library.workflows[0].skillNames.map((name) => ({ name, displayName: name, description: `${name} stage` })));
    expect(prompt.indexOf("1. $define-goal")).toBeLessThan(prompt.indexOf("2. $frontend-design"));
    expect(prompt.indexOf("2. $frontend-design")).toBeLessThan(prompt.indexOf("3. $frontend-design-review"));
    expect(prompt).toContain("没有自动执行任何 Skill");
    expect(prompt).toContain("涉及安装、删除、发布或外部写入时仍需单独确认");
  });

  it("replaces feedback for the same copy instead of double counting it", () => {
    const copyAt = "2026-08-03T00:00:00.000Z";
    const helpful = recordSkillFeedback(emptyPersonalLibrary(), "skill-a", "helpful", copyAt, new Date(copyAt));
    const corrected = recordSkillFeedback(helpful, "skill-a", "wrong-skill", copyAt, new Date("2026-08-03T00:01:00.000Z"));
    expect(corrected.feedback["skill-a"]).toMatchObject({ helpful: 0, wrongSkill: 1, lastOutcome: "wrong-skill" });
    expect(skillFeedbackScore(corrected.feedback["skill-a"])).toBeLessThan(0);
  });

  it("drops malformed recipes and workflows during import", () => {
    expect(normalizePersonalLibrary({
      recipes: [{ id: "bad", name: "Bad", skillId: "x" }],
      workflows: [{ id: "bad", name: "Bad", skillNames: ["only-one"] }],
      feedback: { "skill-a": { helpful: -4, wrongSkill: Number.NaN } },
    })).toEqual({
      recipes: [],
      workflows: [],
      feedback: { "skill-a": { helpful: 0, notSolved: 0, wrongSkill: 0, lastOutcome: undefined, lastFeedbackAt: undefined, lastCopyAt: undefined } },
    });
  });
});

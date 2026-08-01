import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { confirmInstallation } from "@/core/installer/install-skill";
import { inspectGithubSkill, installationPlans } from "@/core/installer/inspect-source";

const liveIt = process.env.LIVE_GITHUB_TEST === "1" ? it : it.skip;

describe("live GitHub installation", () => {
  liveIt("reviews and installs OpenAI's define-goal Skill into an isolated Codex home", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-live-"));
    const codexHome = path.join(temporary, ".codex");
    const env = {
      CODEX_HOME: codexHome,
      USERPROFILE: temporary,
      LOCALAPPDATA: path.join(temporary, "local"),
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    };
    installationPlans.clear();
    try {
      const review = await inspectGithubSkill(
        {
          sourceUrl:
            "https://github.com/openai/skills/tree/main/skills/.curated/define-goal",
          skillName: "define-goal",
        },
        { env, homeDirectory: temporary },
      );
      expect(review.installAllowed).toBe(true);
      expect(review.files.some((file) => file.path === "SKILL.md")).toBe(true);
      const result = await confirmInstallation(review.planId, {
        env,
        homeDirectory: temporary,
      });
      expect(result.targetDirectory).toBe(path.join(codexHome, "skills", "define-goal"));
      expect(await readFile(path.join(result.targetDirectory, "SKILL.md"), "utf8")).toContain("name: define-goal");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 60_000);
});

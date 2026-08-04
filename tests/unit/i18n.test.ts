import { describe, expect, it } from "vitest";

import {
  localizeGeneratedText,
  localizeMarketplaceNotice,
  normalizeLanguage,
  statusLabel,
} from "@/core/i18n";
import {
  marketplaceDescriptionLocalizationKind,
  skillDescriptionLocalizationKind,
  translatedMarketplaceDescription,
  translatedSkillDescription,
  translatedUseCases,
} from "@/core/skill-translations";

describe("i18n helpers", () => {
  it("uses Chinese by default and accepts only the supported English locale", () => {
    expect(normalizeLanguage()).toBe("zh");
    expect(normalizeLanguage("fr")).toBe("zh");
    expect(normalizeLanguage("en")).toBe("en");
  });

  it("localizes status and dashboard-generated messages", () => {
    expect(statusLabel("usable", "en")).toBe("Automatic invocation");
    expect(statusLabel("missing-dependency", "zh")).toBe("Skill 依赖缺失");
    expect(localizeGeneratedText("缺少必需 Skill：codebase-design", "en")).toBe(
      "Required Skills missing: codebase-design",
    );
  });

  it("localizes known marketplace fallback notices", () => {
    expect(
      localizeMarketplaceNotice(
        "skills.sh 官方 API 需要 Vercel OIDC Token；本地核心功能不受影响，可直接打开排行榜网页。",
        "en",
      ),
    ).toContain("requires a Vercel OIDC token");
  });

  it("keeps Skill names while replacing English descriptions in Chinese mode", () => {
    const known = translatedSkillDescription({
      name: "frontend-design",
      description: "Creates distinctive interfaces.",
    });
    expect(known).toContain("界面");
    expect(known).not.toContain("Creates distinctive");

    const unknown = translatedSkillDescription({
      name: "acme-specialist",
      description: "Reviews a proprietary workflow.",
    });
    expect(unknown).toContain("acme-specialist");
    expect(unknown).toContain("审查工作流程");
    expect(unknown).not.toContain("尚未收录");
    expect(unknown).not.toContain("proprietary workflow");
    expect(translatedUseCases({ name: "frontend-design", description: "Creates distinctive interfaces." }).length).toBeGreaterThan(0);
  });

  it("translates mostly-English descriptions that contain a few Chinese brand characters", () => {
    const translated = translatedSkillDescription({
      name: "shutaai-extract-pdf",
      description: "Extract, rename, and verify original lecture PDFs from Shuta AI (薯塔AI) course folders.",
    });

    expect(translated).toContain("提取、重命名并验证");
    expect(translated).not.toContain("Extract, rename");
    expect(translatedUseCases({
      name: "shutaai-extract-pdf",
      description: "Extract PDFs from 薯塔AI course folders.",
    })).toEqual(expect.arrayContaining([expect.stringContaining("课程文件夹")]));
  });

  it("uses a Chinese-safe marketplace fallback when no verified translation exists", () => {
    expect(translatedMarketplaceDescription("new-market-skill", "New market capability."))
      .toContain("来自市场");
  });

  it("provides an accurate Chinese description for Wayfinder", () => {
    const translated = translatedSkillDescription({
      name: "wayfinder",
      description: "Plan a huge chunk of work as a shared map of decision tickets on your issue tracker.",
    });

    expect(translated).toContain("问题跟踪器");
    expect(translated).toContain("共享决策任务地图");
    expect(translated).not.toContain("尚未收录");
  });

  it("does not mistake a mostly-English description with a Chinese brand name for original Chinese copy", () => {
    const skill = {
      name: "brand-pdf-helper",
      description: "Extract and verify PDF files from 品牌课程 folders for later reuse.",
    };

    expect(skillDescriptionLocalizationKind(skill)).toBe("automatic");
    expect(translatedSkillDescription(skill)).toContain("提取");
    expect(translatedSkillDescription(skill)).not.toContain("Extract and verify");
    expect(marketplaceDescriptionLocalizationKind(skill.name, skill.description)).toBe("automatic");
  });

  it("preserves genuinely Chinese source descriptions without a generated-copy badge", () => {
    expect(skillDescriptionLocalizationKind({
      name: "native-chinese-skill",
      description: "用于整理中文项目文档，并生成清晰的交接说明。",
    })).toBe("source");
  });
});

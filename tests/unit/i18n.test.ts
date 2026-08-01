import { describe, expect, it } from "vitest";

import {
  localizeGeneratedText,
  localizeMarketplaceNotice,
  normalizeLanguage,
  statusLabel,
} from "@/core/i18n";
import {
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
    expect(localizeGeneratedText("缺少依赖：codebase-design", "en")).toBe(
      "Missing dependencies: codebase-design",
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
    expect(unknown).not.toContain("proprietary workflow");
    expect(translatedUseCases({ name: "frontend-design", description: "Creates distinctive interfaces." }).length).toBeGreaterThan(0);
  });

  it("uses a Chinese-safe marketplace fallback when no verified translation exists", () => {
    expect(translatedMarketplaceDescription("new-market-skill", "New market capability."))
      .toContain("来自市场");
  });
});

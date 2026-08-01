import {
  fetchJson,
  numberValue,
  record,
  textValue,
  type MarketplaceResponse,
  type MarketplaceSkill,
} from "./adapter";

function normalize(value: unknown, index: number): MarketplaceSkill {
  const skill = record(value);
  const id = textValue(skill.id, `skills-sh-${index}`);
  const slug = textValue(skill.slug, id.split("/").at(-1) || `skill-${index + 1}`);
  return {
    id,
    name: textValue(skill.name, slug),
    description: `来自 ${textValue(skill.source, "skills.sh")} 的热门 Skill`,
    author: textValue(skill.source).split("/")[0] || undefined,
    sourceLabel: "skills.sh 排行榜",
    sourceUrl: textValue(skill.installUrl) || undefined,
    pageUrl: textValue(skill.url, `https://skills.sh/${id}`),
    installs: numberValue(skill.installs),
    duplicate: skill.isDuplicate === true,
  };
}

export async function loadSkillsShLeaderboard(
  view: "all-time" | "trending" | "hot" = "trending",
  limit = 20,
  options?: { token?: string; fetcher?: typeof fetch },
): Promise<MarketplaceResponse> {
  const browseUrl = view === "all-time" ? "https://skills.sh/" : `https://skills.sh/${view}`;
  const token = options?.token?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!token) {
    return {
      provider: "skills.sh",
      available: false,
      results: [],
      notice:
        "skills.sh 官方 API 需要 Vercel OIDC Token；本地核心功能不受影响，可直接打开排行榜网页。",
      browseUrl,
    };
  }

  const url = new URL("https://skills.sh/api/v1/skills");
  url.searchParams.set("view", view);
  url.searchParams.set("per_page", String(Math.min(Math.max(limit, 1), 100)));
  try {
    const { response, payload } = await fetchJson(
      url,
      { Authorization: `Bearer ${token}` },
      options?.fetcher,
    );
    if (!response.ok) {
      return {
        provider: "skills.sh",
        available: false,
        results: [],
        notice: `skills.sh API 暂不可用（HTTP ${response.status}），可继续使用网页排行榜。`,
        browseUrl,
      };
    }
    const data = record(payload).data;
    return {
      provider: "skills.sh",
      available: true,
      results: (Array.isArray(data) ? data : []).map(normalize),
      browseUrl,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: "skills.sh",
      available: false,
      results: [],
      notice: `skills.sh 连接失败：${error instanceof Error ? error.message : "未知错误"}`,
      browseUrl,
    };
  }
}

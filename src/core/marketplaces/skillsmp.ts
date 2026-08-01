import {
  fetchJson,
  numberValue,
  record,
  textValue,
  type MarketplaceResponse,
  type MarketplaceSkill,
} from "./adapter";

function resultArray(payload: unknown): unknown[] {
  const root = record(payload);
  if (Array.isArray(root.data)) return root.data;
  const data = record(root.data);
  if (Array.isArray(data.skills)) return data.skills;
  if (Array.isArray(root.skills)) return root.skills;
  if (Array.isArray(root.results)) return root.results;
  return [];
}

function normalizeSkill(value: unknown, index: number): MarketplaceSkill {
  const skill = record(value);
  const repository = record(skill.repository);
  const authorRecord = record(skill.author);
  const name = textValue(skill.name, textValue(skill.slug, `Skill ${index + 1}`));
  const pageUrl = textValue(
    skill.url,
    textValue(
      skill.skillUrl,
      textValue(skill.skill_url, `https://skillsmp.com/search?q=${encodeURIComponent(name)}`),
    ),
  );
  return {
    id: textValue(skill.id, `skillsmp-${index}-${name}`),
    name,
    description: textValue(
      skill.description,
      textValue(skill.summary, "SkillsMP 未提供简介。"),
    ),
    author: textValue(
      skill.author,
      textValue(authorRecord.name, textValue(repository.owner)),
    ) || undefined,
    sourceLabel: "SkillsMP",
    sourceUrl:
      textValue(
        skill.source_url,
        textValue(
          skill.githubUrl,
          textValue(
            skill.github_url,
            textValue(skill.repository_url, textValue(repository.url)),
          ),
        ),
      ) || undefined,
    pageUrl,
    stars: numberValue(skill.stars) ?? numberValue(repository.stars),
  };
}

export async function searchSkillsMp(
  query: string,
  limit = 20,
  options?: { apiKey?: string; fetcher?: typeof fetch },
): Promise<MarketplaceResponse> {
  const cleanQuery = query.trim();
  const browseUrl = cleanQuery
    ? `https://skillsmp.com/search?q=${encodeURIComponent(cleanQuery)}`
    : "https://skillsmp.com/";
  if (!cleanQuery) {
    return {
      provider: "skillsmp",
      available: true,
      results: [],
      notice: "输入至少一个搜索词。",
      browseUrl,
    };
  }

  const url = new URL("https://skillsmp.com/api/v1/skills/search");
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));
  url.searchParams.set("sortBy", "stars");
  const apiKey = options?.apiKey?.trim() || process.env.SKILLSMP_API_KEY?.trim();
  const headers: HeadersInit = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  try {
    const { response, payload } = await fetchJson(url, headers, options?.fetcher);
    if (!response.ok) {
      return {
        provider: "skillsmp",
        available: false,
        results: [],
        notice: `SkillsMP 暂不可用（HTTP ${response.status}）。你仍可打开市场网页。`,
        browseUrl,
      };
    }
    return {
      provider: "skillsmp",
      available: true,
      results: resultArray(payload).map(normalizeSkill),
      notice: apiKey
        ? "已使用本机环境变量中的 SkillsMP API Key。"
        : "正在使用 SkillsMP 匿名额度（每日 50 次）。",
      browseUrl,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: "skillsmp",
      available: false,
      results: [],
      notice: `SkillsMP 连接失败：${error instanceof Error ? error.message : "未知错误"}`,
      browseUrl,
    };
  }
}

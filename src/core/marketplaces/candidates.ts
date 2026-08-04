import type { MarketplaceResponse, MarketplaceSkill } from "./adapter";

const MAX_MARKET_CANDIDATES = 12;

export function marketTaskTerms(task: string): string[] {
  const normalized = task.toLocaleLowerCase();
  const terms: string[] = normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
  if (/(网站|网页|前端|界面|设计)/u.test(normalized)) terms.push("web", "website", "frontend", "design", "ui", "ux");
  if (/(论文|文献|学术|latex)/u.test(normalized)) terms.push("paper", "research", "latex", "academic");
  if (/(数据|分析|表格|可视化)/u.test(normalized)) terms.push("data", "analytics", "spreadsheet", "chart");
  if (/(测试|质量|审查|代码)/u.test(normalized)) terms.push("test", "review", "code", "quality");
  return [...new Set(terms)];
}

/**
 * Produces a bounded, deterministic list of candidates that are not already
 * installed. skills.sh currently exposes a leaderboard rather than task
 * search, so its entries are kept only when they match a task term.
 */
export function selectMarketCandidates(
  responses: MarketplaceResponse[],
  installedSkillNames: Iterable<string>,
  task: string,
): MarketplaceSkill[] {
  const installed = new Set(
    [...installedSkillNames].map((name) => name.trim().toLocaleLowerCase()).filter(Boolean),
  );
  const unique = new Map<string, MarketplaceSkill>();
  const seenNames = new Set<string>();
  const terms = marketTaskTerms(task);

  for (const response of responses) {
    for (const candidate of response.results) {
      const normalizedName = candidate.name.trim().toLocaleLowerCase();
      if (!normalizedName || installed.has(normalizedName) || seenNames.has(normalizedName) || candidate.duplicate) continue;

      if (response.provider === "skills.sh" && terms.length > 0) {
        const searchable = `${candidate.name} ${candidate.description}`.toLocaleLowerCase();
        if (!terms.some((term) => searchable.includes(term))) continue;
      }

      const key = candidate.sourceUrl?.trim().toLocaleLowerCase() || normalizedName;
      if (!unique.has(key)) {
        unique.set(key, { ...candidate, id: `${response.provider}:${candidate.id}` });
        seenNames.add(normalizedName);
      }
    }
  }

  return [...unique.values()].slice(0, MAX_MARKET_CANDIDATES);
}

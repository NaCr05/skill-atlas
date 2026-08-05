import type { Language } from "@/core/i18n";
import { translatedSkillDescription, translatedTags, translatedUseCases } from "@/core/skill-translations";

import { recommendSkills } from "./recommend";
import type { SkillSummary } from "./types";

export type CatalogHealthBucket = "ready" | "review" | "setup";
export type CatalogResultGroupId = "recommended" | "exact" | "recent" | "needs-setup";

export interface CatalogGroupedSkill {
  skill: SkillSummary;
  reason: string;
}

export interface CatalogResultGroup {
  id: CatalogResultGroupId;
  items: CatalogGroupedSkill[];
}

export function catalogHealthBucket(skill: SkillSummary): CatalogHealthBucket {
  if (
    skill.environmentStatus === "needs-setup"
    || skill.environmentStatus === "blocked"
    || skill.status === "missing-dependency"
    || skill.status === "external-unavailable"
    || skill.missingDependencies.length > 0
  ) return "setup";

  const trackedSourceNeedsReview = skill.sourceTracking.status === "tracked"
    && (skill.sourceTracking.policyStatus === "blocked"
      || skill.sourceTracking.policyStatus === "unlisted"
      || skill.sourceTracking.sourceTrust?.archived === true);
  if (
    skill.structureStatus === "invalid"
    || skill.environmentStatus === "unverified"
    || skill.status === "invalid-metadata"
    || skill.status === "duplicate"
    || skill.status === "unknown"
    || skill.secondaryStatuses.includes("duplicate")
    || trackedSourceNeedsReview
  ) return "review";

  return "ready";
}

function searchableText(skill: SkillSummary): string {
  return [
    skill.name,
    skill.displayName,
    skill.description,
    translatedSkillDescription(skill),
    ...skill.tags,
    ...translatedTags(skill.tags),
    ...skill.useCases,
    ...translatedUseCases(skill),
  ].join(" ").toLocaleLowerCase();
}

export function catalogTextMatches(skill: SkillSummary, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || searchableText(skill).includes(needle);
}

export function catalogResultGroups(
  skills: SkillSummary[],
  query: string,
  language: Language,
  recentSkillIds: string[] = [],
): CatalogResultGroup[] {
  const cleanQuery = query.trim();
  const exact = cleanQuery ? skills.filter((skill) => catalogTextMatches(skill, cleanQuery)).slice(0, 5) : [];
  const exactIds = new Set(exact.map((skill) => skill.id));
  const recommendations = cleanQuery ? recommendSkills(skills, cleanQuery, language, 8) : [];
  const setup = recommendations
    .filter(({ skill }) => catalogHealthBucket(skill) === "setup" && !exactIds.has(skill.id))
    .slice(0, 4);
  const setupIds = new Set(setup.map(({ skill }) => skill.id));
  const recommended = recommendations
    .filter(({ skill }) => catalogHealthBucket(skill) !== "setup" && !exactIds.has(skill.id))
    .slice(0, 5);
  const includedIds = new Set([...exactIds, ...setupIds, ...recommended.map(({ skill }) => skill.id)]);
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const recent = cleanQuery ? [] : recentSkillIds
    .flatMap((id) => {
      const skill = byId.get(id);
      return skill && !includedIds.has(id) ? [skill] : [];
    })
    .slice(0, 5);

  return [
    {
      id: "recommended",
      items: recommended.map(({ skill, reasons }) => ({
        skill,
        reason: reasons.join(" · ") || (language === "zh" ? "任务意图匹配" : "Task intent match"),
      })),
    },
    {
      id: "exact",
      items: exact.map((skill) => ({ skill, reason: language === "zh" ? "名称或说明直接匹配" : "Direct name or description match" })),
    },
    {
      id: "recent",
      items: recent.map((skill) => ({ skill, reason: language === "zh" ? "最近复制过调用提示词" : "Prompt copied recently" })),
    },
    {
      id: "needs-setup",
      items: setup.map(({ skill, reasons }) => ({
        skill,
        reason: reasons.join(" · ") || (language === "zh" ? "匹配，但需要先完成配置" : "Matches, but setup is required first"),
      })),
    },
  ].filter((group) => group.items.length > 0) as CatalogResultGroup[];
}

export function catalogQuerySkillIds(skills: SkillSummary[], query: string, language: Language): Set<string> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return new Set(skills.map((skill) => skill.id));
  const normalizedNameQuery = cleanQuery.replace(/^\$/, "").toLocaleLowerCase();
  const exactNameMatches = skills.filter((skill) => (
    skill.name.toLocaleLowerCase() === normalizedNameQuery
    || skill.displayName.toLocaleLowerCase() === normalizedNameQuery
  ));
  if (exactNameMatches.length) return new Set(exactNameMatches.map((skill) => skill.id));
  return new Set([
    ...skills.filter((skill) => catalogTextMatches(skill, cleanQuery)).map((skill) => skill.id),
    ...recommendSkills(skills, cleanQuery, language, skills.length).map(({ skill }) => skill.id),
  ]);
}

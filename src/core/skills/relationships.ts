import type { SkillRecord, SkillRelationship } from "./types";

const STOPWORDS = new Set([
  "about", "add", "after", "agent", "also", "another", "any", "api", "app", "asks",
  "before", "build", "codex", "comment", "connector", "control", "create", "current",
  "existing", "from", "guide", "into", "local", "more", "needs", "new", "only",
  "output", "plugin", "present", "purpose", "review", "that", "their", "this", "tool",
  "tools", "user", "using", "want", "wants", "when", "with", "work", "workflow",
]);

function normalizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokenize(text: string): Set<string> {
  const raw = text.toLocaleLowerCase().match(/[a-z][a-z0-9]{2,}/g) || [];
  return new Set(raw.map(normalizeToken).filter((token) => !STOPWORDS.has(token)));
}

function nameTokens(skill: SkillRecord): Set<string> {
  return tokenize(`${skill.name.replaceAll("-", " ")} ${skill.displayName}`);
}

function purposeTokens(skill: SkillRecord): Set<string> {
  return tokenize(`${skill.name.replaceAll("-", " ")} ${skill.displayName} ${skill.description} ${skill.tags.join(" ")}`);
}

function intersection(left: Iterable<string>, right: Set<string>): string[] {
  return [...left].filter((value) => right.has(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function inferSkillRelationships(skills: SkillRecord[]): Map<string, SkillRelationship[]> {
  const names = new Map(skills.map((skill) => [skill.id, nameTokens(skill)]));
  const purposes = new Map(skills.map((skill) => [skill.id, purposeTokens(skill)]));
  const nameFrequency = new Map<string, number>();
  const purposeFrequency = new Map<string, number>();

  for (const set of names.values()) {
    for (const token of set) nameFrequency.set(token, (nameFrequency.get(token) || 0) + 1);
  }
  for (const set of purposes.values()) {
    for (const token of set) purposeFrequency.set(token, (purposeFrequency.get(token) || 0) + 1);
  }

  const maxNameFrequency = Math.max(6, Math.ceil(skills.length * 0.15));
  const maxPurposeFrequency = Math.max(5, Math.ceil(skills.length * 0.1));
  const result = new Map<string, SkillRelationship[]>();

  for (const skill of skills) {
    const dependencies = new Set(skill.dependencies.map((value) => value.toLocaleLowerCase()));
    const references = new Set(skill.referencedSkills.map((value) => value.toLocaleLowerCase()));
    const skillTags = new Set(skill.tags.map((value) => value.toLocaleLowerCase()));
    const skillTools = new Set(skill.requiredTools.map((value) => value.toLocaleLowerCase()));
    const ownNames = names.get(skill.id) || new Set<string>();
    const ownPurposes = purposes.get(skill.id) || new Set<string>();

    const ranked = skills
      .filter((candidate) => candidate.id !== skill.id && candidate.name.toLocaleLowerCase() !== skill.name.toLocaleLowerCase())
      .map((candidate) => {
        const candidateNames = names.get(candidate.id) || new Set<string>();
        const candidatePurposes = purposes.get(candidate.id) || new Set<string>();
        const isDependency = dependencies.has(candidate.name.toLocaleLowerCase());
        const isReference = references.has(candidate.name.toLocaleLowerCase());
        const sharedTags = intersection(candidate.tags.map((value) => value.toLocaleLowerCase()), skillTags);
        const sharedTools = intersection(candidate.requiredTools.map((value) => value.toLocaleLowerCase()), skillTools);
        const sharedNameThemes = intersection(ownNames, candidateNames)
          .filter((token) => (nameFrequency.get(token) || 0) <= maxNameFrequency);
        const crossNameThemes = unique([
          ...intersection(ownNames, candidatePurposes),
          ...intersection(candidateNames, ownPurposes),
        ]).filter((token) =>
          !sharedNameThemes.includes(token) &&
          (purposeFrequency.get(token) || 0) <= maxPurposeFrequency,
        );
        const sharedPurpose = intersection(ownPurposes, candidatePurposes)
          .filter((token) => (purposeFrequency.get(token) || 0) <= maxPurposeFrequency);

        const hasCrossPurpose = (crossNameThemes.length >= 2 && sharedPurpose.length >= 2)
          || (crossNameThemes.length >= 1 && sharedPurpose.length >= 3);
        const score = (isDependency ? 1_000 : isReference ? 900 : 0)
          + sharedTags.length * 100
          + sharedTools.length * 80
          + sharedNameThemes.length * 60
          + (hasCrossPurpose ? crossNameThemes.length * 30 + sharedPurpose.length * 4 : 0);

        let reason = "";
        if (isDependency) reason = "声明为必需 Skill 依赖";
        else if (isReference) reason = "Skill 说明中引用";
        else if (sharedTags.length) reason = `共同标签：${sharedTags.slice(0, 3).join("、")}`;
        else if (sharedTools.length) reason = `共同工具：${sharedTools.slice(0, 3).join("、")}`;
        else if (sharedNameThemes.length) reason = `共同主题：${sharedNameThemes.slice(0, 3).join("、")}`;
        else if (hasCrossPurpose) reason = `用途交集：${crossNameThemes.slice(0, 3).join("、")}`;
        return { candidate, score, reason };
      })
      .filter((entry) => Boolean(entry.reason) && entry.score > 0)
      .sort((a, b) => b.score - a.score || a.candidate.displayName.localeCompare(b.candidate.displayName, "zh-CN"))
      .slice(0, 5)
      .map(({ candidate, reason }) => ({ id: candidate.id, name: candidate.displayName, reason }));
    result.set(skill.id, ranked);
  }
  return result;
}

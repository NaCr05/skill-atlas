"use client";

import { Check, CircleAlert } from "lucide-react";

import type { CatalogResultGroup, CatalogResultGroupId } from "@/core/skills/catalog";
import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";

const GROUP_LABELS: Record<CatalogResultGroupId, { zh: string; en: string }> = {
  recommended: { zh: "为这项任务推荐", en: "Recommended for this task" },
  exact: { zh: "直接匹配", en: "Direct matches" },
  recent: { zh: "最近使用", en: "Recently used" },
  "needs-setup": { zh: "匹配，但需要配置", en: "Matches that need setup" },
};

export function CatalogResultGroups({
  groups,
  activeSkillId,
  selectedIds,
  onOpen,
  onToggle,
}: {
  groups: CatalogResultGroup[];
  activeSkillId?: string;
  selectedIds: string[];
  onOpen: (skill: SkillSummary) => void;
  onToggle: (skillId: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="catalog-result-groups" id="catalog-command-results" role="listbox" aria-label={t("技能匹配结果", "Skill match results")}>
      {groups.map((group) => (
        <section className="catalog-result-group" key={group.id} aria-labelledby={`catalog-group-${group.id}`}>
          <h3 id={`catalog-group-${group.id}`}>{t(GROUP_LABELS[group.id].zh, GROUP_LABELS[group.id].en)}</h3>
          <div>
            {group.items.map(({ skill, reason }) => {
              const selected = selectedIds.includes(skill.id);
              const needsSetup = group.id === "needs-setup";
              return (
                <article key={skill.id} data-active={activeSkillId === skill.id} data-selected={selected}>
                  <button
                    id={`catalog-option-${skill.id}`}
                    className="catalog-result-open"
                    type="button"
                    role="option"
                    aria-selected={activeSkillId === skill.id}
                    onClick={() => onOpen(skill)}
                  >
                    <span><strong>{skill.displayName}</strong><code>${skill.name}</code></span>
                    <small>{needsSetup && <CircleAlert size={13} aria-hidden="true" />}{reason}</small>
                  </button>
                  <button
                    className="catalog-result-toggle"
                    type="button"
                    data-selected={selected}
                    aria-label={selected ? t(`从组合中移除 ${skill.displayName}`, `Remove ${skill.displayName} from flow`) : t(`把 ${skill.displayName} 加入组合`, `Add ${skill.displayName} to flow`)}
                    aria-pressed={selected}
                    onClick={() => onToggle(skill.id)}
                  >
                    {selected && <Check size={13} aria-hidden="true" />}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

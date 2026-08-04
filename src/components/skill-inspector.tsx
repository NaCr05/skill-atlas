"use client";

import { ArrowUpRight, Copy, FolderOpen, Link2, PauseCircle, Pin, Save, Sparkles, Star, StickyNote, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { environmentStatusLabel, localizeGeneratedText, permissionLabel, sourceKindLabel } from "@/core/i18n";
import {
  skillDescriptionLocalizationKind,
  translatedSkillDescription,
  translatedTags,
  translatedUseCases,
} from "@/core/skill-translations";
import type { SkillSummary } from "@/core/skills/types";
import { useLanguage } from "./language-provider";
import { StatusBadge } from "./status-badge";
import { TranslationBadge } from "./translation-badge";

export function SkillInspector({
  skill,
  onPrompt,
  favorite,
  pinned,
  note,
  onToggleFavorite,
  onTogglePinned,
  onSaveNote,
  onRemove,
  onDisable,
}: {
  skill: SkillSummary;
  onPrompt: (skill: SkillSummary) => void;
  favorite: boolean;
  pinned: boolean;
  note: string;
  onToggleFavorite: (skillId: string) => void;
  onTogglePinned: (skillId: string) => void;
  onSaveNote: (skillId: string, note: string) => void;
  onRemove?: (skill: SkillSummary) => void;
  onDisable?: (skill: SkillSummary) => void;
}) {
  const { language, t } = useLanguage();
  const [noteDraft, setNoteDraft] = useState(note);
  const descriptionKind = skillDescriptionLocalizationKind(skill);

  return (
    <aside className="skill-inspector" aria-label={`${skill.displayName} ${t("摘要", "summary")}`}>
      <div className="inspector-topline">
        <span className="source-code">{sourceKindLabel(skill.source.kind, language)}{skill.plugin ? ` · ${skill.plugin.name}@${skill.plugin.version}` : ""} / {permissionLabel(skill.source.permission, language)}</span>
        <StatusBadge status={skill.status} />
      </div>

      <div className="inspector-heading">
        <h2>{skill.displayName}</h2>
        <code>${skill.name}</code>
      </div>
      <div className="inspector-personal-actions" aria-label={t("个人整理", "Personal organization")}>
        <button type="button" data-active={favorite} onClick={() => onToggleFavorite(skill.id)} aria-pressed={favorite}>
          <Star size={14} aria-hidden="true" /> {favorite ? t("已收藏", "Favorited") : t("收藏", "Favorite")}
        </button>
        <button type="button" data-active={pinned} onClick={() => onTogglePinned(skill.id)} aria-pressed={pinned}>
          <Pin size={14} aria-hidden="true" /> {pinned ? t("已置顶", "Pinned") : t("置顶", "Pin")}
        </button>
      </div>
      <p className="inspector-description">
        {language === "zh" ? translatedSkillDescription(skill) : skill.description}
      </p>
      {descriptionKind !== "source" && <TranslationBadge kind={descriptionKind} />}

      <dl className="inspector-facts">
        <div><dt><FolderOpen size={14} aria-hidden="true" /> {t("配套文件", "Files")}</dt><dd>{skill.resources.length}</dd></div>
        <div><dt><Link2 size={14} aria-hidden="true" /> {t("关联技能", "Related")}</dt><dd>{skill.relationships.length}</dd></div>
        <div><dt>{t("环境", "Environment")}</dt><dd>{environmentStatusLabel(skill.environmentStatus, language)}</dd></div>
        {skill.missingDependencies.length > 0 && <div><dt>{t("缺少必需 Skill", "Required Skills missing")}</dt><dd>{skill.missingDependencies.join(", ")}</dd></div>}
      </dl>

      <section className="inspector-section">
        <h3><Sparkles size={15} aria-hidden="true" /> {t("适合什么时候使用", "When to use it")}</h3>
        {(language === "zh" ? translatedUseCases(skill) : skill.useCases).length ? (
          <ul>{(language === "zh" ? translatedUseCases(skill) : skill.useCases).slice(0, 3).map((item) => <li key={item}>{localizeGeneratedText(item, language)}</li>)}</ul>
        ) : (
          <p>{t("打开完整详情查看调用规则和来源信息。", "Open the full details to review invocation rules and provenance.")}</p>
        )}
      </section>

      {skill.tags.length > 0 && (
        <div className="inspector-tags" aria-label={t("标签", "Tags")}>
          {(language === "zh" ? translatedTags(skill.tags) : skill.tags).slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}

      <section className="personal-note">
        <label htmlFor={`skill-note-${skill.id}`}><StickyNote size={14} aria-hidden="true" /> {t("个人备注", "Personal note")}</label>
        <textarea
          id={`skill-note-${skill.id}`}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value.slice(0, 4_000))}
          placeholder={t("记录适用项目、调用习惯或容易忘记的事项…", "Record suitable projects, invocation habits, or details worth remembering…")}
          rows={3}
        />
        <div>
          <small>{noteDraft.length} / 4000 · {t("仅保存在本机", "local only")}</small>
          <button type="button" onClick={() => onSaveNote(skill.id, noteDraft)} disabled={noteDraft.trim() === note}>
            <Save size={13} aria-hidden="true" /> {noteDraft.trim() === note ? t("已保存", "Saved") : t("保存备注", "Save note")}
          </button>
        </div>
      </section>

      <div className="inspector-actions">
        <button className="button button-primary button-wide" onClick={() => onPrompt(skill)}>
          <Copy size={16} aria-hidden="true" /> {t("复制调用提示词", "Copy invocation Prompt")}
        </button>
        <Link className="button button-quiet button-wide" href={`/skills/${skill.id}`}>
          {t("详情", "Details")} <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
        {onDisable && skill.source.kind === "personal" && skill.source.permission === "manage" && (
          <button className="button button-quiet button-wide" type="button" onClick={() => onDisable?.(skill)}>
            <PauseCircle size={15} aria-hidden="true" /> {t("停用 Skill", "Disable Skill")}
          </button>
        )}
        {onRemove && skill.source.kind === "personal" && skill.source.permission === "manage" && (
          <button className="button button-danger-quiet button-wide" type="button" onClick={() => onRemove(skill)}>
            <Trash2 size={15} aria-hidden="true" /> {t("移到回收站", "Move to trash")}
          </button>
        )}
      </div>
    </aside>
  );
}

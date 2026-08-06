"use client";

import { BookmarkPlus, Check, X } from "lucide-react";
import { FormEvent, useState } from "react";

import type { Language } from "@/core/i18n";
import type { PromptRecipeInput } from "@/core/personal-library";
import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";

function defaultName(skill: SkillSummary, task: string, language: Language): string {
  const summary = task.trim().replace(/\s+/g, " ").slice(0, 28);
  return summary ? `${skill.displayName} · ${summary}` : language === "zh" ? `${skill.displayName} 常用配方` : `${skill.displayName} recipe`;
}

export function RecipeSavePanel({
  skill,
  task,
  requirements,
  onSave,
}: {
  skill: SkillSummary;
  task: string;
  requirements: string;
  onSave: (input: PromptRecipeInput) => void;
}) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  function begin() {
    setName(defaultName(skill, task, language));
    setSaved(false);
    setOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ name, skillId: skill.id, skillName: skill.name, task, requirements, language });
    setSaved(true);
    window.setTimeout(() => setOpen(false), 700);
  }

  if (!open) return (
    <button className="button button-quiet recipe-save-trigger" type="button" onClick={begin}>
      <BookmarkPlus size={14} />{t("保存为 Prompt 配方", "Save as Prompt recipe")}
    </button>
  );

  return (
    <form className="recipe-save-panel" onSubmit={submit}>
      <label htmlFor={`recipe-name-${skill.id}`}>{t("配方名称", "Recipe name")}</label>
      <div>
        <input id={`recipe-name-${skill.id}`} value={name} maxLength={100} autoFocus onChange={(event) => setName(event.target.value)} />
        <button className="button button-primary" type="submit" disabled={!name.trim()}>{saved ? <Check size={14} /> : <BookmarkPlus size={14} />}{saved ? t("已保存", "Saved") : t("保存", "Save")}</button>
        <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label={t("取消保存配方", "Cancel recipe save")}><X size={15} /></button>
      </div>
      <small>{t("任务和自定义要求会保存在本机，可在“配方与工作流”中直接复用。", "The task and custom requirements stay on this device and can be reused from Recipes & flows.")}</small>
    </form>
  );
}

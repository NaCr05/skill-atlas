"use client";

import { Save, StickyNote } from "lucide-react";
import { useState } from "react";

import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";

export function CatalogPersonalNote({ skill, note, onSave }: { skill: SkillSummary; note: string; onSave: (skillId: string, note: string) => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(note);

  return (
    <details className="catalog-personal-note">
      <summary><StickyNote size={14} /> {t("个人备注", "Personal note")} · {skill.displayName}</summary>
      <div>
        <textarea
          aria-label={t("个人备注", "Personal note")}
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 4_000))}
          placeholder={t("记录适用项目、调用习惯或容易忘记的事项…", "Record suitable projects, invocation habits, or details worth remembering…")}
          rows={3}
        />
        <span>{draft.length} / 4000 · {t("仅保存在本机", "local only")}</span>
        <button type="button" onClick={() => onSave(skill.id, draft)} disabled={draft.trim() === note}><Save size={13} /> {draft.trim() === note ? t("已保存", "Saved") : t("保存备注", "Save note")}</button>
      </div>
    </details>
  );
}

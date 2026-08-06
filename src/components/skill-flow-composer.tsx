"use client";

import { ArrowDown, ArrowUp, Check, Copy, Save, Sparkles, Workflow, X } from "lucide-react";
import { useMemo, useState } from "react";

import { createWorkflowPrompt, type SkillWorkflowInput } from "@/core/personal-library";
import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";

export function SkillFlowComposer({
  skills,
  selectedIds,
  task,
  aiWorking,
  onSelectedIdsChange,
  onComposeWithAi,
  onSave,
}: {
  skills: SkillSummary[];
  selectedIds: string[];
  task: string;
  aiWorking: boolean;
  onSelectedIdsChange: (ids: string[]) => void;
  onComposeWithAi: () => void;
  onSave: (input: SkillWorkflowInput) => void;
}) {
  const { language, t } = useLanguage();
  const [requirements, setRequirements] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const byId = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const selected = selectedIds.flatMap((id) => {
    const skill = byId.get(id);
    return skill ? [skill] : [];
  });
  const name = workflowName.trim() || (language === "zh" ? `${selected[0]?.displayName || "Skill"} 工作流` : `${selected[0]?.displayName || "Skill"} workflow`);
  const prompt = createWorkflowPrompt({ name, task, requirements, language }, selected);

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onSelectedIdsChange(next);
  }

  function save() {
    onSave({ name, skillNames: selected.map((skill) => skill.name), task, requirements, language });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_500);
  }

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <article className="skill-flow-composer" aria-labelledby="skill-flow-composer-title">
      <header>
        <div><span className="eyebrow">{t("有序工作流", "ORDERED WORKFLOW")}</span><strong id="skill-flow-composer-title">{t(`已选择 ${selected.length} 个 Skill`, `${selected.length} Skills selected`)}</strong></div>
        <small>{t("只生成组合 Prompt，不会自动执行", "Generates a combined Prompt; never auto-runs")}</small>
      </header>
      <ol className="skill-flow-order">
        {selected.map((skill, index) => (
          <li key={skill.id}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <span><strong>{skill.displayName}</strong><code>${skill.name}</code></span>
            <div>
              <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t(`上移 ${skill.displayName}`, `Move ${skill.displayName} up`)}><ArrowUp size={13} /></button>
              <button type="button" disabled={index === selected.length - 1} onClick={() => move(index, 1)} aria-label={t(`下移 ${skill.displayName}`, `Move ${skill.displayName} down`)}><ArrowDown size={13} /></button>
              <button type="button" onClick={() => onSelectedIdsChange(selectedIds.filter((id) => id !== skill.id))} aria-label={t(`移除 ${skill.displayName}`, `Remove ${skill.displayName}`)}><X size={13} /></button>
            </div>
          </li>
        ))}
      </ol>
      <div className="skill-flow-actions">
        <button className="button button-primary" type="button" onClick={() => setPreviewOpen((current) => !current)}><Workflow size={14} />{previewOpen ? t("收起 Prompt", "Hide Prompt") : t("生成组合 Prompt", "Generate combined Prompt")}</button>
        <button className="button button-quiet" type="button" onClick={() => setSaveOpen((current) => !current)}><Save size={14} />{t("保存工作流", "Save workflow")}</button>
        <button className="button button-ai" type="button" aria-label={t("智能组合 Skill", "Compose Skills with AI")} disabled={aiWorking} onClick={onComposeWithAi}><Sparkles size={14} />{aiWorking ? t("AI 编排中…", "AI composing…") : t("AI 辅助编排", "AI-assisted composition")}</button>
      </div>
      {(saveOpen || previewOpen) && (
        <div className="skill-flow-options">
          <label>{t("工作流名称", "Workflow name")}<input value={workflowName} maxLength={100} placeholder={name} onChange={(event) => setWorkflowName(event.target.value)} /></label>
          <label>{t("自定义要求（可选）", "Custom requirements (optional)")}<textarea value={requirements} maxLength={4_000} rows={2} onChange={(event) => setRequirements(event.target.value)} /></label>
          {saveOpen && <button className="button button-quiet" type="button" onClick={save}>{saved ? <Check size={14} /> : <Save size={14} />}{saved ? t("已保存到本机", "Saved locally") : t("确认保存", "Save locally")}</button>}
        </div>
      )}
      {previewOpen && (
        <div className="skill-flow-preview">
          <pre>{prompt}</pre>
          <button className="button button-primary" type="button" onClick={() => void copy()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t("已复制", "Copied") : t("复制组合 Prompt", "Copy combined Prompt")}</button>
        </div>
      )}
    </article>
  );
}

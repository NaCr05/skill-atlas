"use client";

import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { SkillWorkflow, SkillWorkflowInput } from "@/core/personal-library";
import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";

export function WorkflowLibraryEditor({
  skills,
  workflow,
  onCancel,
  onSave,
}: {
  skills: SkillSummary[];
  workflow?: SkillWorkflow;
  onCancel: () => void;
  onSave: (input: SkillWorkflowInput) => void;
}) {
  const { language, t } = useLanguage();
  const [name, setName] = useState(workflow?.name || "");
  const [task, setTask] = useState(workflow?.task || "");
  const [requirements, setRequirements] = useState(workflow?.requirements || "");
  const [skillNames, setSkillNames] = useState(workflow?.skillNames || []);
  const [candidate, setCandidate] = useState("");
  const available = skills.filter((skill) => !skillNames.includes(skill.name));

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= skillNames.length) return;
    const next = [...skillNames];
    [next[index], next[target]] = [next[target], next[index]];
    setSkillNames(next);
  }

  return <div className="workflow-library-editor">
    <header><div><span className="eyebrow">{workflow ? t("编辑工作流", "EDIT WORKFLOW") : t("新工作流", "NEW WORKFLOW")}</span><h3>{t("排列 2–8 个已安装 Skill", "Order 2–8 installed Skills")}</h3></div><button className="icon-button" type="button" onClick={onCancel} aria-label={t("关闭工作流编辑器", "Close workflow editor")}><X size={16} /></button></header>
    <div className="workflow-editor-fields"><label>{t("名称", "Name")}<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label><label>{t("总任务", "Overall task")}<textarea value={task} maxLength={4_000} rows={2} onChange={(event) => setTask(event.target.value)} /></label><label>{t("自定义要求（可选）", "Custom requirements (optional)")}<textarea value={requirements} maxLength={4_000} rows={2} onChange={(event) => setRequirements(event.target.value)} /></label></div>
    <div className="workflow-skill-picker"><select value={candidate} onChange={(event) => setCandidate(event.target.value)}><option value="">{t("选择一个 Skill…", "Choose a Skill…")}</option>{available.map((skill) => <option key={skill.id} value={skill.name}>{skill.displayName} · ${skill.name}</option>)}</select><button className="button button-quiet" type="button" disabled={!candidate || skillNames.length >= 8} onClick={() => { setSkillNames((current) => [...current, candidate]); setCandidate(""); }}><Plus size={14} />{t("加入", "Add")}</button></div>
    <ol className="workflow-editor-order">{skillNames.map((skillName, index) => <li key={skillName}><b>{index + 1}</b><code>${skillName}</code><div><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t(`上移 ${skillName}`, `Move ${skillName} up`)}><ArrowUp size={13} /></button><button type="button" disabled={index === skillNames.length - 1} onClick={() => move(index, 1)} aria-label={t(`下移 ${skillName}`, `Move ${skillName} down`)}><ArrowDown size={13} /></button><button type="button" onClick={() => setSkillNames((current) => current.filter((name) => name !== skillName))} aria-label={t(`移除 ${skillName}`, `Remove ${skillName}`)}><Trash2 size={13} /></button></div></li>)}</ol>
    <footer><small><RotateCcw size={13} />{t("保存只更新本机配方库，不会调用 AI 或执行 Skill。", "Saving only updates the local library; it never calls AI or executes a Skill.")}</small><div><button className="button button-quiet" type="button" onClick={onCancel}>{t("取消", "Cancel")}</button><button className="button button-primary" type="button" disabled={!name.trim() || skillNames.length < 2} onClick={() => onSave({ id: workflow?.id, name, task, requirements, skillNames, language })}><Save size={14} />{t("保存工作流", "Save workflow")}</button></div></footer>
  </div>;
}

"use client";

import { BookMarked, Check, Copy, Pencil, Plus, ShieldCheck, Trash2, Workflow } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { recordPromptCopy } from "@/core/local-workspace";
import {
  createWorkflowPrompt,
  taskWithRequirements,
  type PromptFeedbackOutcome,
  type SkillWorkflow,
} from "@/core/personal-library";
import { createInvocationPrompt } from "@/core/skills/prompt";
import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";
import { PromptFeedback } from "./prompt-feedback";
import { useLocalWorkspace } from "./use-local-workspace";
import { WorkflowLibraryEditor } from "./workflow-library-editor";

interface FeedbackTarget { recipeId: string; skillId: string; copiedAt: string }

export function PersonalLibraryClient({ skills }: { skills: SkillSummary[] }) {
  const { t } = useLanguage();
  const {
    workspace,
    deletePromptRecipe,
    markPromptRecipeUsed,
    saveSkillWorkflow,
    deleteSkillWorkflow,
    markSkillWorkflowUsed,
    recordSkillFeedback,
  } = useLocalWorkspace();
  const [copiedId, setCopiedId] = useState("");
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SkillWorkflow>();
  const byId = useMemo(() => new Map(skills.map((skill) => [skill.id, skill])), [skills]);
  const byName = useMemo(() => new Map(skills.map((skill) => [skill.name, skill])), [skills]);
  const { recipes, workflows, feedback } = workspace.personalLibrary;

  async function copyRecipe(recipeId: string) {
    const recipe = recipes.find((item) => item.id === recipeId);
    if (!recipe) return;
    const skill = byId.get(recipe.skillId) || byName.get(recipe.skillName);
    if (!skill) return;
    const prompt = createInvocationPrompt(skill, taskWithRequirements(recipe.task, recipe.requirements, recipe.language), recipe.language).prompt;
    await navigator.clipboard.writeText(prompt);
    const copiedAt = new Date().toISOString();
    recordPromptCopy({ skillId: skill.id, skillName: skill.name, displayName: skill.displayName, language: recipe.language, copiedAt });
    markPromptRecipeUsed(recipe.id);
    setCopiedId(recipe.id);
    setFeedbackTarget({ recipeId: recipe.id, skillId: skill.id, copiedAt });
    window.setTimeout(() => setCopiedId((current) => current === recipe.id ? "" : current), 1_500);
  }

  async function copyWorkflow(workflowId: string) {
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) return;
    const workflowSkills = workflow.skillNames.flatMap((name) => {
      const skill = byName.get(name);
      return skill ? [skill] : [];
    });
    if (workflowSkills.length !== workflow.skillNames.length) return;
    await navigator.clipboard.writeText(createWorkflowPrompt(workflow, workflowSkills));
    markSkillWorkflowUsed(workflow.id);
    setCopiedId(workflow.id);
    window.setTimeout(() => setCopiedId((current) => current === workflow.id ? "" : current), 1_500);
  }

  function confirmDelete(kind: "recipe" | "workflow", id: string, name: string) {
    if (!window.confirm(t(`从本机删除“${name}”？这不会删除任何 Skill。`, `Delete “${name}” from this device? No Skill will be removed.`))) return;
    if (kind === "recipe") deletePromptRecipe(id);
    else deleteSkillWorkflow(id);
  }

  function editWorkflow(workflow?: SkillWorkflow) {
    setEditing(workflow);
    setEditorOpen(true);
  }

  const helpfulCount = Object.values(feedback).reduce((sum, item) => sum + item.helpful, 0);
  return (
    <div className="personal-library-client">
      <section className="library-summary" aria-label={t("个人复用库摘要", "Personal reuse library summary")}>
        <article><BookMarked size={18} /><span>{t("Prompt 配方", "Prompt recipes")}</span><strong>{recipes.length}</strong></article>
        <article><Workflow size={18} /><span>{t("有序工作流", "Ordered workflows")}</span><strong>{workflows.length}</strong></article>
        <article><Check size={18} /><span>{t("有帮助反馈", "Helpful outcomes")}</span><strong>{helpfulCount}</strong></article>
        <p><ShieldCheck size={15} />{t("全部内容只保存在当前浏览器；工作流只生成 Prompt，不会自动执行 Codex。", "Everything stays in this browser. Workflows only generate Prompts and never execute Codex.")}</p>
      </section>

      <section className="library-section" aria-labelledby="recipe-library-title">
        <header><div><span className="eyebrow">PROMPT RECIPES</span><h2 id="recipe-library-title">{t("Prompt 配方库", "Prompt recipe library")}</h2><p>{t("把常用的 Skill、任务和约束保存成可直接复制的配方。", "Save a Skill, task, and constraints as a reusable one-click Prompt.")}</p></div><Link className="button button-primary" href="/"><Plus size={15} />{t("从 Builder 新建", "Create from Builder")}</Link></header>
        {recipes.length ? <div className="recipe-library-grid">{recipes.map((recipe) => {
          const skill = byId.get(recipe.skillId) || byName.get(recipe.skillName);
          const feedbackValue = feedbackTarget?.recipeId === recipe.id
            ? feedback[feedbackTarget.skillId]?.lastOutcome
            : undefined;
          return <article className="recipe-card" key={recipe.id} data-missing={!skill}>
            <header><span><BookMarked size={15} />{t("配方", "RECIPE")}</span><small>{recipe.useCount ? t(`已使用 ${recipe.useCount} 次`, `Used ${recipe.useCount} times`) : t("尚未使用", "Not used yet")}</small></header>
            <h3>{recipe.name}</h3>
            <code>${recipe.skillName}</code>
            <p>{recipe.task || t("未填写具体任务", "No task supplied")}</p>
            {recipe.requirements && <small className="recipe-requirements">{t("要求：", "Requirements: ")}{recipe.requirements}</small>}
            {!skill && <p className="inline-error">{t("当前未找到这个 Skill，无法生成 Prompt。", "This Skill is not currently installed, so a Prompt cannot be generated.")}</p>}
            <footer>
              <button className="button button-primary" type="button" disabled={!skill} onClick={() => void copyRecipe(recipe.id)}>{copiedId === recipe.id ? <Check size={14} /> : <Copy size={14} />}{copiedId === recipe.id ? t("已复制", "Copied") : t("直接复制 Prompt", "Copy Prompt")}</button>
              {skill && <Link className="button button-quiet" href={`/?skill=${encodeURIComponent(skill.name)}&recipe=${encodeURIComponent(recipe.id)}`}><Pencil size={14} />{t("在 Builder 中调整", "Adjust in Builder")}</Link>}
              <button className="icon-button" type="button" onClick={() => confirmDelete("recipe", recipe.id, recipe.name)} aria-label={t(`删除配方 ${recipe.name}`, `Delete recipe ${recipe.name}`)}><Trash2 size={14} /></button>
            </footer>
            {feedbackTarget?.recipeId === recipe.id && <PromptFeedback value={feedbackValue} onChange={(outcome: PromptFeedbackOutcome) => recordSkillFeedback(feedbackTarget.skillId, outcome, feedbackTarget.copiedAt)} />}
          </article>;
        })}</div> : <div className="library-empty"><BookMarked size={28} /><h3>{t("还没有 Prompt 配方", "No Prompt recipes yet")}</h3><p>{t("在技能目录中选择一个 Skill，填写任务和要求，再点击“保存为 Prompt 配方”。", "Choose a Skill in the catalog, add a task and requirements, then select “Save as Prompt recipe”.")}</p><Link className="button button-primary" href="/">{t("前往技能目录", "Open Skill catalog")}</Link></div>}
      </section>

      <section className="library-section" aria-labelledby="workflow-library-title">
        <header><div><span className="eyebrow">ORDERED FLOWS</span><h2 id="workflow-library-title">{t("多 Skill 工作流", "Multi-Skill workflows")}</h2><p>{t("保存有序步骤，先审查组合 Prompt，再自行前往 Codex 使用。", "Save ordered steps, review the combined Prompt, then use it in Codex yourself.")}</p></div><button className="button button-primary" type="button" onClick={() => editWorkflow()}><Plus size={15} />{t("新建工作流", "New workflow")}</button></header>
        {editorOpen && <WorkflowLibraryEditor skills={skills} workflow={editing} onCancel={() => { setEditorOpen(false); setEditing(undefined); }} onSave={(input) => { saveSkillWorkflow(input); setEditorOpen(false); setEditing(undefined); }} />}
        {workflows.length ? <div className="workflow-library-list">{workflows.map((workflow) => {
          const missing = workflow.skillNames.filter((name) => !byName.has(name));
          return <article className="workflow-card" key={workflow.id} data-missing={missing.length > 0}>
            <header><div><span><Workflow size={15} />{t("工作流", "WORKFLOW")}</span><h3>{workflow.name}</h3></div><small>{workflow.useCount ? t(`已使用 ${workflow.useCount} 次`, `Used ${workflow.useCount} times`) : t("尚未使用", "Not used yet")}</small></header>
            <ol>{workflow.skillNames.map((name, index) => <li key={name} data-missing={!byName.has(name)}><b>{String(index + 1).padStart(2, "0")}</b><code>${name}</code>{index < workflow.skillNames.length - 1 && <span>→</span>}</li>)}</ol>
            <p>{workflow.task || t("使用前补充具体任务。", "Add a concrete task before use.")}</p>
            {missing.length > 0 && <p className="inline-error">{t(`缺少：${missing.join("、")}`, `Missing: ${missing.join(", ")}`)}</p>}
            <footer>
              <button className="button button-primary" type="button" disabled={missing.length > 0} onClick={() => void copyWorkflow(workflow.id)}>{copiedId === workflow.id ? <Check size={14} /> : <Copy size={14} />}{copiedId === workflow.id ? t("已复制", "Copied") : t("复制组合 Prompt", "Copy combined Prompt")}</button>
              <button className="button button-quiet" type="button" onClick={() => editWorkflow(workflow)}><Pencil size={14} />{t("编辑顺序", "Edit order")}</button>
              <button className="icon-button" type="button" onClick={() => confirmDelete("workflow", workflow.id, workflow.name)} aria-label={t(`删除工作流 ${workflow.name}`, `Delete workflow ${workflow.name}`)}><Trash2 size={14} /></button>
            </footer>
          </article>;
        })}</div> : <div className="library-empty"><Workflow size={28} /><h3>{t("还没有保存工作流", "No saved workflows yet")}</h3><p>{t("可以在这里新建，也可以在“按任务找 Skill”中把推荐结果按顺序保存。", "Create one here, or save ordered recommendations from Find a Skill.")}</p></div>}
      </section>
    </div>
  );
}

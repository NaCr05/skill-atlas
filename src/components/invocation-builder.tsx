"use client";

import { ArrowUpRight, Check, CircleAlert, Copy, Pin, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { statusLabel } from "@/core/i18n";
import { recordPromptCopy, type LocalWorkspaceState } from "@/core/local-workspace";
import { taskWithRequirements, type PromptFeedbackOutcome, type PromptRecipe, type PromptRecipeInput } from "@/core/personal-library";
import { translatedSkillDescription } from "@/core/skill-translations";
import { catalogHealthBucket } from "@/core/skills/catalog";
import { createInvocationPrompt, type PromptResult } from "@/core/skills/prompt";
import type { SkillSummary } from "@/core/skills/types";

import { useLanguage } from "./language-provider";
import { CapabilityImprint } from "./capability-imprint";
import { PromptFeedback } from "./prompt-feedback";
import { ProvenanceLabel } from "./provenance-label";
import { RecipeSavePanel } from "./recipe-save-panel";
import { StatusBadge } from "./status-badge";

export function InvocationBuilder({
  skill,
  initialTask = "",
  journeyStartedAt,
  favorite,
  pinned,
  onToggleFavorite,
  onTogglePinned,
  workspace,
  onSaveRecipe,
  onFeedback,
  initialRecipe,
}: {
  skill: SkillSummary;
  initialTask?: string;
  journeyStartedAt?: number;
  favorite: boolean;
  pinned: boolean;
  onToggleFavorite: (skillId: string) => void;
  onTogglePinned: (skillId: string) => void;
  workspace: LocalWorkspaceState;
  onSaveRecipe: (input: PromptRecipeInput) => void;
  onFeedback: (skillId: string, outcome: PromptFeedbackOutcome, copyAt: string) => void;
  initialRecipe?: PromptRecipe;
}) {
  const { language, t } = useLanguage();
  const [task, setTask] = useState(initialRecipe?.task || initialTask);
  const [requirements, setRequirements] = useState(initialRecipe?.requirements || "");
  const [result, setResult] = useState<PromptResult | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAt, setCopiedAt] = useState("");
  const [error, setError] = useState("");
  const bucket = catalogHealthBucket(skill);
  const copyAllowed = bucket === "ready";
  const effectiveTask = useMemo(() => taskWithRequirements(task, requirements, language), [language, requirements, task]);
  const promptResult = useMemo(
    () => result || createInvocationPrompt(skill, effectiveTask, language),
    [effectiveTask, language, result, skill],
  );
  const currentFeedback = workspace.personalLibrary.feedback[skill.id];
  const feedbackValue = currentFeedback?.lastCopyAt === copiedAt ? currentFeedback.lastOutcome : undefined;

  async function enhanceWithAi() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ skillId: skill.id, task: effectiveTask, enhanceWithAi: true, language }),
      });
      const payload = (await response.json()) as PromptResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("AI 增强失败", "AI enhancement failed"));
      setResult(payload);
    } catch (enhanceError) {
      setError(enhanceError instanceof Error ? enhanceError.message : t("AI 增强失败，已保留本地提示词。", "AI enhancement failed. The local Prompt was kept."));
    } finally {
      setWorking(false);
    }
  }

  async function copyPrompt() {
    if (!copyAllowed) return;
    setError("");
    try {
      await navigator.clipboard.writeText(promptResult.prompt);
      const copyTimestamp = new Date().toISOString();
      recordPromptCopy({
        skillId: skill.id,
        skillName: skill.name,
        displayName: skill.displayName,
        language,
        journeyStartedAt,
        copiedAt: copyTimestamp,
      });
      setCopiedAt(copyTimestamp);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(t("复制失败，请检查浏览器的剪贴板权限。", "Copy failed. Check the browser's clipboard permission."));
    }
  }

  return (
    <aside className="invocation-builder" aria-labelledby={`invocation-builder-${skill.id}`}>
      <div className="invocation-builder-scroll">
      <header className="invocation-builder-header">
        <div>
          <span className="eyebrow">{t("调用 Builder", "INVOCATION BUILDER")}</span>
          <h2 id={`invocation-builder-${skill.id}`}>{skill.displayName}</h2>
          <code>${skill.name}</code>
        </div>
        <StatusBadge status={skill.status} />
      </header>

      <div className="invocation-builder-personal" aria-label={t("个人整理", "Personal organization")}>
        <button type="button" data-active={favorite} aria-pressed={favorite} onClick={() => onToggleFavorite(skill.id)}><Star size={14} /> {favorite ? t("已收藏", "Favorited") : t("收藏", "Favorite")}</button>
        <button type="button" data-active={pinned} aria-pressed={pinned} onClick={() => onTogglePinned(skill.id)}><Pin size={14} /> {pinned ? t("已置顶", "Pinned") : t("置顶", "Pin")}</button>
      </div>

      <CapabilityImprint skill={skill} workspace={workspace} task={task} />

      <p className="invocation-builder-purpose">{language === "zh" ? translatedSkillDescription(skill) : skill.description}</p>

      {bucket !== "ready" && (
        <div className="invocation-builder-blocker" role="status" data-bucket={bucket}>
          <CircleAlert size={16} aria-hidden="true" />
          <div>
            <strong>{bucket === "setup" ? t("需要先完成配置", "Setup is required first") : t("需要先审查这个入口", "Review this entry first")}</strong>
            <p>{skill.environmentReasons[0] || skill.issues[0] || statusLabel(skill.status, language)}</p>
          </div>
        </div>
      )}

      <label className="invocation-task-field" htmlFor={`invocation-task-${skill.id}`}>
        <span>{t("这次想让它做什么？", "What should it do this time?")}</span>
        <textarea
          id={`invocation-task-${skill.id}`}
          value={task}
          onChange={(event) => {
            setTask(event.target.value.slice(0, 4_000));
            setResult(null);
            setError("");
          }}
          placeholder={t("补充目标、输入材料和期望输出…", "Add the goal, inputs, and expected output…")}
          rows={3}
        />
      </label>

      <label className="invocation-task-field invocation-requirements-field" htmlFor={`invocation-requirements-${skill.id}`}>
        <span>{t("自定义要求（可选）", "Custom requirements (optional)")}</span>
        <textarea
          id={`invocation-requirements-${skill.id}`}
          value={requirements}
          onChange={(event) => {
            setRequirements(event.target.value.slice(0, 4_000));
            setResult(null);
            setError("");
          }}
          placeholder={t("例如：使用中文、先给方案、不要修改配置…", "For example: use English, propose a plan first, do not change configuration…")}
          rows={2}
        />
      </label>

      <section className="invocation-prompt-preview" aria-label={t("提示词预览", "Prompt preview")}>
        <header>
          <span>{t("实时本地提示词", "Live local Prompt")}</span>
          <ProvenanceLabel kind={promptResult.source === "ai-enhanced" ? "ai" : "dashboard"} />
        </header>
        <pre>{promptResult.prompt}</pre>
      </section>

      {promptResult.notice && <p className="inline-notice">{promptResult.notice}</p>}
      {error && <p className="inline-error">{error}</p>}

      <div className="invocation-builder-secondary-actions">
        <button className="button button-ai" type="button" disabled={working || !copyAllowed} onClick={() => void enhanceWithAi()}>
          <Sparkles size={15} /> {working ? t("AI 增强中…", "Enhancing…") : t("使用 AI 增强", "Enhance with AI")}
        </button>
        <Link className="button button-quiet" href={`/skills/${skill.id}`}>{t("完整详情", "Full details")} <ArrowUpRight size={14} /></Link>
      </div>

      </div>
      <RecipeSavePanel skill={skill} task={task} requirements={requirements} onSave={onSaveRecipe} />

      <footer className="invocation-builder-copy">
        <button className="button button-primary button-wide" type="button" disabled={!copyAllowed} onClick={() => void copyPrompt()}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? t("已复制，可前往 Codex", "Copied — continue in Codex") : copyAllowed ? t("复制调用 Prompt", "Copy invocation Prompt") : t("解决问题后才可复制", "Resolve issues before copying")}
        </button>
        {copiedAt && <PromptFeedback value={feedbackValue} onChange={(outcome) => onFeedback(skill.id, outcome, copiedAt)} />}
      </footer>
    </aside>
  );
}

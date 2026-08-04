"use client";

import { Check, Copy, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { recordPromptCopy } from "@/core/local-workspace";
import { createInvocationPrompt, type PromptResult } from "@/core/skills/prompt";
import type { SkillSummary } from "@/core/skills/types";
import { AccessibleDialog } from "./accessible-dialog";
import { useLanguage } from "./language-provider";
import { ProvenanceLabel } from "./provenance-label";

export function PromptDialog({
  skill,
  onClose,
  journeyStartedAt,
}: {
  skill: SkillSummary;
  onClose: () => void;
  journeyStartedAt?: number;
}) {
  const { language, t } = useLanguage();
  const [task, setTask] = useState("");
  const [enhance, setEnhance] = useState(false);
  const [result, setResult] = useState<PromptResult | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const openedAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const prompt = useMemo(
    () => result?.prompt || createInvocationPrompt(skill, task, language).prompt,
    [language, result, skill, task],
  );

  async function generate() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ skillId: skill.id, task, enhanceWithAi: enhance, language }),
      });
      const payload = (await response.json()) as PromptResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("提示词生成失败", "Prompt generation failed"));
      setResult(payload);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : t("提示词生成失败", "Prompt generation failed"));
    } finally {
      setWorking(false);
    }
  }

  async function copyPrompt() {
    setError("");
    try {
      await navigator.clipboard.writeText(prompt);
      recordPromptCopy({
        skillId: skill.id,
        skillName: skill.name,
        displayName: skill.displayName,
        language,
        journeyStartedAt: journeyStartedAt ?? openedAt.current ?? Date.now(),
      });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(t("复制失败，请检查浏览器的剪贴板权限。", "Copy failed. Check the browser's clipboard permission."));
    }
  }

  return (
    <AccessibleDialog
      className="prompt-dialog"
      labelledBy="prompt-title"
      onClose={onClose}
      initialFocusSelector="#task-context"
      busy={working}
    >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("调用提示词生成器", "INVOCATION BUILDER")}</span>
            <h2 id="prompt-title">{t("调用", "Invoke")} {skill.displayName}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={20} />
          </button>
        </div>
        <label className="field-label" htmlFor="task-context">
          {t("这次想让它做什么？", "What should it do this time?")} <span>{t("可选", "Optional")}</span>
        </label>
        <textarea
          id="task-context"
          value={task}
          onChange={(event) => {
            setTask(event.target.value);
            setResult(null);
          }}
          placeholder={t("例如：检查这个 React 页面在移动端的可访问性，并按优先级给出修改建议。", "For example: Review this React page for mobile accessibility and prioritize the recommended changes.")}
          rows={4}
        />
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={enhance}
            onChange={(event) => setEnhance(event.target.checked)}
          />
          <span>
            <strong>{t("使用 AI 个性化增强", "Use AI personalization")}</strong>
            <small>{t("可选；未配置或请求失败时会保留本地模板", "Optional; keeps the local template when unconfigured or a request fails")}</small>
          </span>
          <Sparkles size={18} aria-hidden="true" />
        </label>
        <div className="prompt-preview">
          <div>
            <span>{t("可复制提示词", "Copy-ready Prompt")}</span>
            <ProvenanceLabel kind={result?.source === "ai-enhanced" ? "ai" : "dashboard"} />
          </div>
          <pre>{prompt}</pre>
        </div>
        {result?.notice && <p className="inline-notice">{result.notice}</p>}
        {error && <p className="inline-error">{error}</p>}
        <div className="dialog-actions">
          <button className="button button-quiet" onClick={generate} disabled={working}>
            {working ? t("生成中…", "Generating…") : enhance ? t("生成增强版", "Generate enhanced version") : t("刷新模板", "Refresh template")}
          </button>
          <button className="button button-primary" onClick={copyPrompt}>
            {copied ? <Check size={17} /> : <Copy size={17} />}
            {copied ? t("已复制，可前往 Codex", "Copied — continue in Codex") : t("复制调用提示词", "Copy invocation Prompt")}
          </button>
        </div>
    </AccessibleDialog>
  );
}

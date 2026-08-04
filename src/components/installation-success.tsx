"use client";

import { AlertTriangle, ArrowRight, Check, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { InstallationResult } from "@/core/installer/types";
import type { IssueOverview } from "@/core/issues/issue-planner";
import { createInvocationPrompt } from "@/core/skills/prompt";
import { useLanguage } from "./language-provider";

export interface DependencyRepairContext {
  issueId: string;
  consumer: string;
  dependency: string;
}

type RepairCheck =
  | { status: "checking" }
  | { status: "resolved" }
  | { status: "remaining"; dependencies: string[] }
  | { status: "failed"; message: string };

export function InstallationSuccess({
  result,
  description,
  repairContext,
}: {
  result: InstallationResult;
  description: string;
  repairContext?: DependencyRepairContext;
}) {
  const { language, t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [repairCheck, setRepairCheck] = useState<RepairCheck | null>(repairContext ? { status: "checking" } : null);
  const prompt = useMemo(() => createInvocationPrompt({
    name: result.skillName,
    description,
    defaultPrompt: undefined,
  }, undefined, language).prompt, [description, language, result.skillName]);

  useEffect(() => {
    if (!repairContext) return;
    const context = repairContext;
    const controller = new AbortController();
    let active = true;
    async function verifyRepair() {
      try {
        const response = await fetch("/api/issues?force=1", {
          cache: "no-store",
          headers: { "X-Skill-Atlas-Language": language },
          signal: controller.signal,
        });
        const payload = await response.json() as IssueOverview & { error?: string };
        if (!response.ok) throw new Error(payload.error || (language === "zh" ? "自动重新扫描失败" : "Automatic rescan failed"));
        const issue = payload.issues.find((entry) => entry.id === context.issueId)
          || payload.issues.find((entry) => entry.kind === "missing-dependency" && entry.affectedSkills.some((skill) => skill.name === context.consumer));
        if (!active) return;
        if (!issue) setRepairCheck({ status: "resolved" });
        else setRepairCheck({ status: "remaining", dependencies: issue.missingDependencies || [] });
      } catch (cause) {
        if (active && !controller.signal.aborted) setRepairCheck({ status: "failed", message: cause instanceof Error ? cause.message : String(cause) });
      }
    }
    void verifyRepair();
    return () => { active = false; controller.abort(); };
  }, [language, repairContext]);

  async function copyPrompt() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopyError(t("复制失败，请检查浏览器的剪贴板权限。", "Copy failed. Check the browser's clipboard permission."));
    }
  }

  return (
    <div className="success-toast installation-success" role="status" aria-live="polite">
      <CheckCircle2 size={22} aria-hidden="true" />
      <div className="success-toast-copy">
        <strong>{result.skillName} {t("已完成验证安装", "was verified and installed")}</strong>
        <span>{result.fileCount} {t("个文件已写入", "files written to")} {result.targetDirectory}</span>
        {copyError && <small role="alert">{copyError}</small>}
        {repairCheck?.status === "checking" && <span className="dependency-repair-status" data-status="checking"><RefreshCw size={13} className="is-spinning" />{t(`正在重新扫描 ${repairContext?.consumer || "Skill"} 的依赖…`, `Rescanning dependencies for ${repairContext?.consumer || "the Skill"}…`)}</span>}
        {repairCheck?.status === "resolved" && <span className="dependency-repair-status" data-status="resolved"><CheckCircle2 size={13} />{t(`问题已解决：${repairContext?.dependency || "依赖"} 已可用。`, `Issue resolved: ${repairContext?.dependency || "the dependency"} is now available.`)}</span>}
        {repairCheck?.status === "remaining" && <span className="dependency-repair-status" data-status="remaining"><AlertTriangle size={13} />{t(`已重新扫描，但仍缺少：${repairCheck.dependencies.join("、") || "未知依赖"}。`, `Rescan complete, but still missing: ${repairCheck.dependencies.join(", ") || "unknown dependencies"}.`)}</span>}
        {repairCheck?.status === "failed" && <span className="dependency-repair-status" data-status="failed"><AlertTriangle size={13} />{t(`安装已完成，但自动复查失败：${repairCheck.message}`, `Installation succeeded, but automatic verification failed: ${repairCheck.message}`)}</span>}
      </div>
      <div className="success-toast-actions">
        <Link className="button button-quiet" href={`/skills?skill=${encodeURIComponent(result.skillName)}#inventory`}>
          {t("查看已安装 Skill", "View installed Skill")} <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <button className="button button-primary" type="button" onClick={() => void copyPrompt()}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? t("调用 Prompt 已复制", "Invocation Prompt copied") : t("复制调用 Prompt", "Copy invocation Prompt")}
        </button>
      </div>
    </div>
  );
}

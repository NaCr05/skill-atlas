"use client";

import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RotateCcw, X } from "lucide-react";
import Link from "next/link";

import type { OperationRecord, OperationStageCode, OperationStageStatus } from "@/core/operations/operation-log";
import { AccessibleDialog } from "./accessible-dialog";
import { useLanguage } from "./language-provider";

const stageLabels: Record<OperationStageCode, [string, string]> = {
  preflight: ["预检", "Preflight"],
  download: ["下载与暂存", "Download & stage"],
  backup: ["备份", "Backup"],
  replace: ["原子替换", "Atomic replace"],
  verify: ["指纹验证", "Verify"],
  rollback: ["失败回滚", "Rollback"],
  complete: ["完成", "Complete"],
};

const statusLabels: Record<OperationStageStatus, [string, string]> = {
  pending: ["等待", "Pending"],
  running: ["进行中", "Running"],
  succeeded: ["已完成", "Succeeded"],
  failed: ["失败", "Failed"],
  skipped: ["已跳过", "Skipped"],
};

function duration(start?: string, end?: string): string {
  if (!start) return "—";
  const elapsed = Date.parse(end || new Date().toISOString()) - Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "—";
  return elapsed < 1_000 ? `${elapsed} ms` : `${(elapsed / 1_000).toFixed(1)} s`;
}

function StageIcon({ status }: { status: OperationStageStatus }) {
  if (status === "succeeded") return <CheckCircle2 size={17} />;
  if (status === "failed") return <AlertTriangle size={17} />;
  if (status === "running") return <LoaderCircle className="is-spinning" size={17} />;
  return <Clock3 size={17} />;
}

function localizedStageDetail(code: OperationStageCode, status: OperationStageStatus, detail: string | undefined, language: "zh" | "en"): string | undefined {
  if (language === "en" || !detail) return detail;
  const copy: Record<OperationStageCode, string> = {
    preflight: status === "failed" ? "审查单或当前文件状态未通过预检。" : "审查单、路径与当前文件状态已经核对。",
    download: status === "failed" ? "下载或暂存指纹验证未完成。" : "文件已下载到隔离暂存目录并完成验证。",
    backup: status === "failed" ? "旧版本备份或隔离移动未完成。" : "旧版本或待清理内容已移入私有目录并验证。",
    replace: status === "failed" ? "原子替换或数据合并未完成。" : "目标内容已经通过受控替换或合并写入。",
    verify: status === "failed" ? "最终指纹或审计证据验证失败。" : "最终指纹、来源或审计证据已经验证。",
    rollback: status === "failed" ? "自动回滚失败，请打开恢复中心。" : "系统已恢复操作前的已验证状态。",
    complete: "操作已经记录最终结果。",
  };
  return copy[code];
}

export function OperationDetailDrawer({ record, onClose }: { record: OperationRecord; onClose: () => void }) {
  const { language, t } = useLanguage();
  const stages = record.stages || [];
  return <AccessibleDialog className="operation-detail-drawer" labelledBy="operation-detail-title" onClose={onClose} initialFocusSelector="[data-dialog-close]">
    <header>
      <div><span className="eyebrow">{t("可审计执行链", "AUDITABLE EXECUTION")}</span><h2 id="operation-detail-title">{t("操作详情", "Operation details")}</h2></div>
      <button data-dialog-close type="button" className="icon-button" onClick={onClose} aria-label={t("关闭", "Close")}><X size={19} /></button>
    </header>
    <section className="operation-detail-summary" data-status={record.status}>
      <div><span>{t("状态", "Status")}</span><strong>{record.status}</strong></div>
      <div><span>{t("目标", "Target")}</span><code>{record.target}</code></div>
      <div><span>{t("耗时", "Duration")}</span><strong>{duration(record.startedAt, record.finishedAt)}</strong></div>
      <div><span>{t("操作 ID", "Operation ID")}</span><code>{record.id}</code></div>
    </section>
    <section className="operation-stage-list" aria-label={t("执行阶段", "Execution stages")}>
      {stages.length ? stages.map((stage) => <article key={stage.code} data-status={stage.status}>
        <span className="operation-stage-icon"><StageIcon status={stage.status} /></span>
        <div><div><strong>{stageLabels[stage.code][language === "zh" ? 0 : 1]}</strong><b>{statusLabels[stage.status][language === "zh" ? 0 : 1]}</b></div>{localizedStageDetail(stage.code, stage.status, stage.detail, language) && <p>{localizedStageDetail(stage.code, stage.status, stage.detail, language)}</p>}<small>{duration(stage.startedAt, stage.finishedAt)}</small></div>
      </article>) : <p className="operations-empty">{t("这条旧记录没有阶段明细；新操作会自动记录。", "This legacy record has no phase details; new operations record them automatically.")}</p>}
    </section>
    {(record.errorCode || record.detail) && <section className="operation-detail-evidence"><strong>{record.errorCode || t("执行摘要", "Execution summary")}</strong><p>{record.detail}</p></section>}
    <footer>{record.recoveryHref && <Link className="button button-quiet" href={record.recoveryHref}><RotateCcw size={15} />{t("打开恢复入口", "Open recovery")}</Link>}<button className="button button-primary" type="button" onClick={onClose}>{t("完成", "Done")}</button></footer>
  </AccessibleDialog>;
}

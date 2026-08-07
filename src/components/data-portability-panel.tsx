"use client";

import { Download, FileJson, ShieldCheck, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { normalizeDiscoveryHistory, readDiscoveryHistory, writeDiscoveryHistory } from "@/core/discovery-history";
import type { ServerImportReview } from "@/core/data-portability";
import { mergeLocalWorkspaces, normalizeLocalWorkspace, readLocalWorkspace, writeLocalWorkspace } from "@/core/local-workspace";
import { AccessibleDialog } from "./accessible-dialog";
import { useLanguage } from "./language-provider";

interface ImportFile {
  format: "skill-atlas-backup";
  version: 1;
  server: unknown;
  browser?: { workspace?: unknown; discoveryHistory?: unknown };
}

export function DataPortabilityPanel() {
  const { language, t } = useLanguage();
  const picker = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<ServerImportReview>();
  const [file, setFile] = useState<ImportFile>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string }>();
  const headers = { "Content-Type": "application/json", "X-Skill-Atlas-Language": language };

  async function exportData() {
    setBusy(true); setMessage(undefined);
    try {
      const response = await fetch("/api/data/export", { cache: "no-store", headers: { "X-Skill-Atlas-Language": language } });
      const payload = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("导出失败。", "Export failed."));
      const complete = { ...payload, browser: { workspace: readLocalWorkspace(), discoveryHistory: readDiscoveryHistory() } };
      const blob = new Blob([`${JSON.stringify(complete, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `skill-atlas-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      URL.revokeObjectURL(url);
      setMessage({ kind: "success", text: t("备份文件已生成；其中不包含任何 API Key。", "Backup generated. It contains no API keys.") });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }

  async function choose(selected?: File) {
    if (!selected) return;
    setBusy(true); setMessage(undefined);
    try {
      if (selected.size > 5 * 1024 * 1024) throw new Error(t("导入文件不能超过 5 MB。", "Import files must be 5 MB or smaller."));
      const parsed = JSON.parse(await selected.text()) as ImportFile;
      if (parsed.format !== "skill-atlas-backup" || parsed.version !== 1) throw new Error(t("这不是受支持的 Skill Atlas 备份。", "This is not a supported Skill Atlas backup."));
      const response = await fetch("/api/data/import/inspect", { method: "POST", headers, body: JSON.stringify({ server: parsed.server }) });
      const payload = await response.json() as ServerImportReview & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("无法审查导入文件。", "Could not review the import file."));
      setFile(parsed); setReview(payload);
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); if (picker.current) picker.current.value = ""; }
  }

  async function confirm() {
    if (!review || !file) return;
    setBusy(true);
    try {
      const response = await fetch("/api/data/import/confirm", { method: "POST", headers, body: JSON.stringify({ planId: review.planId }) });
      const payload = await response.json() as { backupDirectory?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || t("导入失败。", "Import failed."));
      if (file.browser?.workspace) {
        const current = readLocalWorkspace(); const imported = normalizeLocalWorkspace(file.browser.workspace);
        writeLocalWorkspace(mergeLocalWorkspaces(current, imported));
      }
      if (file.browser?.discoveryHistory) writeDiscoveryHistory(normalizeDiscoveryHistory(file.browser.discoveryHistory));
      setReview(undefined); setFile(undefined);
      setMessage({ kind: "success", text: t(`导入完成；导入前快照保存在 ${payload.backupDirectory}`, `Import complete. The pre-import snapshot is at ${payload.backupDirectory}`) });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }

  return <section className="data-portability-panel">
    <header><div><span className="eyebrow">{t("迁移与备份", "MIGRATION & BACKUP")}</span><h2><FileJson size={20} /> {t("本地数据导入导出", "Local data import & export")}</h2><p>{t("备份收藏、置顶、个人备注、Prompt 配方、工作流、反馈汇总、搜索历史、操作记录、来源注册表和非敏感配置。API Key 永远不会导出。", "Back up favorites, pins, notes, Prompt recipes, workflows, feedback summaries, search history, operations, source registry, and non-secret configuration. API keys are never exported.")}</p></div></header>
    <div className="data-portability-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => void exportData()}><Download size={16} />{t("导出 JSON 备份", "Export JSON backup")}</button><button className="button button-quiet" type="button" disabled={busy} onClick={() => picker.current?.click()}><Upload size={16} />{t("选择备份并导入", "Choose backup to import")}</button><input ref={picker} hidden type="file" accept="application/json,.json" onChange={(event) => void choose(event.target.files?.[0])} /></div>
    <p className="privacy-note"><ShieldCheck size={15} />{t("导入采用合并策略；执行前会在私有目录保存当前服务端数据快照。", "Imports merge rather than replace. A private server-data snapshot is saved before changes are applied.")}</p>
    {message && <p className={message.kind === "error" ? "inline-error" : "inline-notice"}>{message.text}</p>}
    {review && <AccessibleDialog className="review-dialog data-import-dialog" labelledBy="data-import-title" onClose={() => !busy && setReview(undefined)} closeDisabled={busy} initialFocusSelector="[data-dialog-close]" busy={busy}><header><div><span className="eyebrow">{t("导入预检", "IMPORT PREFLIGHT")}</span><h2 id="data-import-title">{t("确认合并本地数据", "Confirm local-data merge")}</h2></div><button data-dialog-close className="icon-button" type="button" onClick={() => setReview(undefined)} disabled={busy} aria-label={t("关闭", "Close")}><X size={18} /></button></header><div className="import-counts"><div><strong>{review.counts.operations}</strong><span>{t("条操作记录", "operations")}</span></div><div><strong>{review.counts.sources}</strong><span>{t("个来源记录", "sources")}</span></div><div><strong>{review.counts.trustedOwners + review.counts.trustedRepositories}</strong><span>{t("条信任规则", "trust rules")}</span></div></div><p>{t("已有记录不会被批量删除；同一来源键采用导入值，API Key 不参与导入。", "Existing records are not bulk-deleted. Imported values win for matching source keys; API keys are excluded.")}</p><footer><button className="button button-quiet" type="button" onClick={() => setReview(undefined)} disabled={busy}>{t("取消", "Cancel")}</button><button className="button button-primary" type="button" onClick={() => void confirm()} disabled={busy}><Upload size={15} />{busy ? t("正在导入…", "Importing…") : t("确认导入", "Confirm import")}</button></footer></AccessibleDialog>}
  </section>;
}

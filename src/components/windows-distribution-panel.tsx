"use client";

import { ArrowUpRight, Download, MonitorUp, RefreshCw } from "lucide-react";
import { useState } from "react";

import type { AppUpdateStatus } from "@/core/releases/update-check";
import { useLanguage } from "./language-provider";

export function WindowsDistributionPanel() {
  const { language, t } = useLanguage();
  const [status, setStatus] = useState<AppUpdateStatus>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    setChecking(true); setError("");
    try {
      const response = await fetch("/api/app-update", { method: "POST", headers: { "X-Skill-Atlas-Language": language } });
      const payload = await response.json() as AppUpdateStatus & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("检查失败。", "Update check failed."));
      setStatus(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setChecking(false); }
  }
  return <section className="windows-distribution-panel"><header><div><span className="eyebrow">{t("WINDOWS 分发", "WINDOWS DISTRIBUTION")}</span><h2><MonitorUp size={20} /> {t("桌面安装与应用升级", "Desktop install & app updates")}</h2><p>{t("正式 Release 提供无需 Node.js 和命令行的安装程序，并创建开始菜单与可选桌面快捷方式。检查更新只在你点击时联网。", "Release builds provide an installer that needs neither Node.js nor a command line, with Start-menu and optional desktop shortcuts. Network update checks run only when you click.")}</p></div></header><div className="distribution-actions"><a className="button button-primary" href="https://github.com/NaCr05/skill-atlas/releases/latest" target="_blank" rel="noreferrer"><Download size={16} />{t("下载 Windows 安装包", "Download Windows installer")}</a><button className="button button-quiet" type="button" disabled={checking} onClick={() => void check()}><RefreshCw size={15} className={checking ? "is-spinning" : undefined} />{checking ? t("正在检查…", "Checking…") : t("手动检查更新", "Check for updates")}</button></div>{status && <div className="app-update-result" data-update={status.updateAvailable}><div><span>{t("当前版本", "Current")}</span><strong>v{status.currentVersion}</strong></div><div><span>{t("最新版本", "Latest")}</span><strong>v{status.latestVersion}</strong></div><p>{status.updateAvailable ? t("发现新版本。下载安装包后可覆盖升级，个人 Skills 和 .skill-atlas 数据不会存放在应用目录中。", "A new version is available. Run its installer to upgrade; personal Skills and .skill-atlas data are stored outside the app directory.") : t("当前已经是最新正式版本。", "You are on the latest release.")}</p>{status.updateAvailable && status.releaseUrl && <a href={status.releaseUrl} target="_blank" rel="noreferrer">{t("查看发布说明", "View release notes")} <ArrowUpRight size={14} /></a>}</div>}{error && <p className="inline-error">{error}</p>}</section>;
}

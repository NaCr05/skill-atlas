"use client";

import { Clock3, Filter, GitCompareArrows, Pin, RotateCcw, Star, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import type { LocalWorkspaceState } from "@/core/local-workspace";

import { useLanguage } from "./language-provider";

export type CatalogStatusFilter = "all" | "ready" | "review" | "setup" | "updates" | "source:locked" | "source:unlocked" | "source:trusted" | "source:unlisted" | "source:archived";
export type CatalogCollectionFilter = "all" | "pinned" | "favorites" | "recent";

export function CatalogFilterRail({
  status,
  source,
  collection,
  workspace,
  updateCount,
  resultCount,
  totalCount,
  hasFilters,
  onStatusChange,
  onSourceChange,
  onCollectionChange,
  onReset,
}: {
  status: CatalogStatusFilter;
  source: string;
  collection: CatalogCollectionFilter;
  workspace: LocalWorkspaceState;
  updateCount: number;
  resultCount: number;
  totalCount: number;
  hasFilters: boolean;
  onStatusChange: (status: CatalogStatusFilter) => void;
  onSourceChange: (source: string) => void;
  onCollectionChange: (collection: CatalogCollectionFilter) => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  function handleEscape(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <aside className="catalog-filter-rail" data-open={open} aria-label={t("目录筛选", "Catalog filters")} onKeyDown={handleEscape}>
      <button ref={toggleRef} className="catalog-filter-toggle" type="button" aria-expanded={open} aria-controls="catalog-filter-panel" onClick={() => setOpen((current) => !current)}>
        <Filter size={15} /> {t("筛选目录", "Filter catalog")} <span>{resultCount}</span>
      </button>
      <div id="catalog-filter-panel" className="catalog-filter-panel">
        <header><strong>{t("目录筛选", "Catalog filters")}</strong><button type="button" aria-label={t("关闭筛选", "Close filters")} onClick={() => setOpen(false)}><X size={16} /></button></header>

        <fieldset>
          <legend>{t("我的整理", "My library")}</legend>
          <button type="button" data-active={collection === "all"} onClick={() => onCollectionChange("all")}>{t("全部 Skill", "All Skills")} <b>{totalCount}</b></button>
          <button type="button" data-active={collection === "pinned"} onClick={() => onCollectionChange("pinned")}><Pin size={13} /> {t("置顶", "Pinned")} <b>{workspace.pinned.length}</b></button>
          <button type="button" data-active={collection === "favorites"} onClick={() => onCollectionChange("favorites")}><Star size={13} /> {t("收藏", "Favorites")} <b>{workspace.favorites.length}</b></button>
          <button type="button" data-active={collection === "recent"} onClick={() => onCollectionChange("recent")}><Clock3 size={13} /> {t("最近复制", "Recently copied")} <b>{workspace.recentCopies.length}</b></button>
        </fieldset>

        <label>
          <span>{t("健康状态", "Health")}</span>
          <select value={status} onChange={(event) => onStatusChange(event.target.value as CatalogStatusFilter)}>
            <option value="all">{t("全部状态", "All statuses")}</option>
            <option value="ready">{t("已就绪", "Ready")}</option>
            <option value="review">{t("需要审查", "Needs review")}</option>
            <option value="setup">{t("需要配置", "Needs setup")}</option>
            <option value="updates">{t(`有更新 (${updateCount})`, `Updates available (${updateCount})`)}</option>
            <option value="source:locked">{t("来源已锁定", "Source locked")}</option>
            <option value="source:unlocked">{t("来源未锁定", "Source unlocked")}</option>
            <option value="source:trusted">{t("来源在信任名单", "Trusted source")}</option>
            <option value="source:unlisted">{t("来源未列入信任名单", "Unlisted source")}</option>
            <option value="source:archived">{t("上游仓库已归档", "Archived upstream")}</option>
          </select>
        </label>

        <label>
          <span>{t("来源", "Source")}</span>
          <select value={source} onChange={(event) => onSourceChange(event.target.value)}>
            <option value="all">{t("全部来源", "All sources")}</option>
            <option value="personal">{t("个人", "Personal")}</option>
            <option value="system">{t("系统", "System")}</option>
            <option value="plugin">{t("插件", "Plugin")}</option>
            <option value="compatibility">{t("兼容目录", "Compatibility")}</option>
          </select>
        </label>

        <Link className="catalog-batch-link" href="/operations"><GitCompareArrows size={14} /> {t("批量检查与更新", "Batch checks & updates")}</Link>
        {hasFilters && <button className="catalog-filter-reset" type="button" onClick={onReset}><RotateCcw size={14} /> {t("清除全部筛选", "Clear all filters")}</button>}
        <output>{t("显示", "Showing")} <strong>{resultCount}</strong> / {totalCount}</output>
      </div>
    </aside>
  );
}

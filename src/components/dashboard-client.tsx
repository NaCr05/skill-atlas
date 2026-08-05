"use client";

import { Clock3, GitCompareArrows, LayoutGrid, List, Pin, RefreshCw, RotateCcw, SlidersHorizontal, Star, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { localeFor, localizeGeneratedText, sourceLabel } from "@/core/i18n";
import type { SkillRemovalResult, SkillRestoreResult } from "@/core/lifecycle/types";
import type { BatchUpdateOverview, BatchUpdateRecord } from "@/core/lifecycle/update-batch";
import { catalogHealthBucket, catalogQuerySkillIds } from "@/core/skills/catalog";
import type { SkillInventorySummary, SkillSummary } from "@/core/skills/types";
import { useLanguage } from "./language-provider";
import { PromptDialog } from "./prompt-dialog";
import { SkillCard } from "./skill-card";
import { SkillInspector } from "./skill-inspector";
import { SkillDisableDialog } from "./skill-disable-dialog";
import { SkillRemovalDialog } from "./skill-removal-dialog";
import { StatusBadge } from "./status-badge";
import { TaskRecommender } from "./task-recommender";
import { useLocalWorkspace } from "./use-local-workspace";

type ViewMode = "cards" | "compact";
type StatusFilter = "all" | "ready" | "review" | "setup" | "updates" | "source:locked" | "source:unlocked" | "source:trusted" | "source:unlisted" | "source:archived";
type CollectionFilter = "all" | "pinned" | "favorites" | "recent";

export function DashboardClient({
  inventory: initialInventory,
  initialFocusedSkillName = "",
}: {
  inventory: SkillInventorySummary;
  initialFocusedSkillName?: string;
}) {
  const { language, t } = useLanguage();
  const router = useRouter();
  const initialFocusedSkill = initialInventory.skills.find((skill) => skill.name === initialFocusedSkillName);
  const [inventory, setInventory] = useState(initialInventory);
  const [query, setQuery] = useState(initialFocusedSkill?.name || "");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [source, setSource] = useState("all");
  const [collection, setCollection] = useState<CollectionFilter>("all");
  const [view, setView] = useState<ViewMode>("compact");
  const [selectedId, setSelectedId] = useState(
    initialFocusedSkill?.id ?? initialInventory.skills.find((skill) => skill.environmentStatus === "ready")?.id ?? initialInventory.skills[0]?.id ?? "",
  );
  const [promptSkill, setPromptSkill] = useState<SkillSummary | null>(null);
  const [promptJourneyStartedAt, setPromptJourneyStartedAt] = useState<number>();
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState("");
  const [removalSkill, setRemovalSkill] = useState<SkillSummary | null>(null);
  const [disableSkill, setDisableSkill] = useState<SkillSummary | null>(null);
  const [updateRecords, setUpdateRecords] = useState<BatchUpdateRecord[]>([]);
  const [lastRemoval, setLastRemoval] = useState<SkillRemovalResult | null>(null);
  const [undoingRemoval, setUndoingRemoval] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const journeyStarts = useRef(new Map<string, number>());
  const { workspace, toggleFavorite, togglePinned, saveNote, clearWorkspace } = useLocalWorkspace();

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/updates/batch", { cache: "no-store", headers: { "X-Skill-Atlas-Language": language } })
      .then(async (response) => response.ok ? await response.json() as BatchUpdateOverview : undefined)
      .then((payload) => { if (active && payload) setUpdateRecords(payload.records); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [language]);

  const filtered = useMemo(() => {
    const querySkillIds = catalogQuerySkillIds(inventory.skills, query, language);
    const recentRank = new Map(workspace.recentCopies.map((item, index) => [item.skillId, index]));
    return inventory.skills.filter((skill) => {
      const matchesQuery = querySkillIds.has(skill.id);
      const hasUpdate = updateRecords.some((record) => record.skillId === skill.id && ["update-available", "local-changes"].includes(record.status));
      const matchesStatus = status === "all"
        || (status === "updates" && hasUpdate)
        || ((status === "ready" || status === "review" || status === "setup") && catalogHealthBucket(skill) === status)
        || (status === "source:locked" && skill.sourceTracking.status === "tracked")
        || (status === "source:unlocked" && skill.source.kind === "personal" && skill.sourceTracking.status === "untracked")
        || (status === "source:trusted" && skill.sourceTracking.status === "tracked" && skill.sourceTracking.policyStatus === "trusted")
        || (status === "source:unlisted" && skill.sourceTracking.status === "tracked" && skill.sourceTracking.policyStatus === "unlisted")
        || (status === "source:archived" && skill.sourceTracking.status === "tracked" && skill.sourceTracking.sourceTrust?.archived === true);
      const matchesSource = source === "all" || skill.source.kind === source;
      const matchesCollection = collection === "all"
        || (collection === "pinned" && workspace.pinned.includes(skill.id))
        || (collection === "favorites" && workspace.favorites.includes(skill.id))
        || (collection === "recent" && recentRank.has(skill.id));
      return matchesQuery && matchesStatus && matchesSource && matchesCollection;
    }).sort((left, right) => {
      if (collection === "recent") return (recentRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (recentRank.get(right.id) ?? Number.MAX_SAFE_INTEGER);
      const pinDifference = Number(workspace.pinned.includes(right.id)) - Number(workspace.pinned.includes(left.id));
      return pinDifference || left.displayName.localeCompare(right.displayName, language === "zh" ? "zh-CN" : "en-US");
    });
  }, [collection, inventory.skills, language, query, source, status, updateRecords, workspace.favorites, workspace.pinned, workspace.recentCopies]);

  const selectedSkill = filtered.find((skill) => skill.id === selectedId) ?? filtered[0] ?? null;
  const hasFilters = Boolean(query) || status !== "all" || source !== "all" || collection !== "all";

  function selectSkill(skill: SkillSummary) {
    setSelectedId(skill.id);
    journeyStarts.current.set(skill.id, Date.now());
  }

  function selectRecommendation(skill: SkillSummary) {
    setStatus("all");
    setSource("all");
    setCollection("all");
    selectSkill(skill);
    window.setTimeout(() => document.querySelector(".inventory-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function openPrompt(skill: SkillSummary) {
    const startedAt = journeyStarts.current.get(skill.id) ?? Date.now();
    journeyStarts.current.set(skill.id, startedAt);
    setPromptJourneyStartedAt(startedAt);
    setPromptSkill(skill);
  }

  function resetFilters() {
    setQuery("");
    setStatus("all");
    setSource("all");
    setCollection("all");
    searchRef.current?.focus();
  }

  async function rescan(): Promise<SkillInventorySummary | undefined> {
    setRescanning(true);
    setRescanError("");
    try {
      const response = await fetch("/api/skills", { method: "POST", headers: { "X-Skill-Atlas-Language": language } });
      const payload = (await response.json()) as SkillInventorySummary & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("重新扫描失败", "Rescan failed"));
      setInventory(payload);
      return payload;
    } catch (error) {
      setRescanError(error instanceof Error ? error.message : t("重新扫描失败", "Rescan failed"));
    } finally {
      setRescanning(false);
    }
  }

  async function removed(result: SkillRemovalResult) {
    setRemovalSkill(null);
    setLastRemoval(result);
    await rescan();
  }

  async function disabled() {
    setDisableSkill(null);
    await rescan();
    router.push("/trash");
  }

  async function restored() {
    setLastRemoval(null);
    await rescan();
  }

  async function undoRemoval() {
    if (!lastRemoval) return;
    setUndoingRemoval(true);
    setRescanError("");
    try {
      const response = await fetch("/api/lifecycle/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Skill-Atlas-Language": language },
        body: JSON.stringify({ trashId: lastRemoval.trashId }),
      });
      const payload = (await response.json()) as SkillRestoreResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("恢复失败", "Restore failed"));
      await restored();
    } catch (error) {
      setRescanError(error instanceof Error ? error.message : t("恢复失败", "Restore failed"));
    } finally {
      setUndoingRemoval(false);
    }
  }

  const environmentReady = inventory.skills.filter((skill) => catalogHealthBucket(skill) === "ready").length;
  const attention = inventory.skills.length - environmentReady;
  const scannedAt = new Date(inventory.scannedAt).toLocaleTimeString(localeFor(language), { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <>
      <div className="scan-status" role="status" aria-live="polite">
        <div className="scan-summary">
          <strong>{inventory.skills.length} Skills</strong>
          <span>{environmentReady} {t("已就绪", "ready")}</span>
          <span data-alert={attention > 0}>{attention} {t("待处理", "need attention")}</span>
          <small>{t("扫描于", "Scanned at")} {scannedAt} · {inventory.durationMs.toLocaleString(localeFor(language))} ms · {inventory.cache.hit ? t("缓存", "cache") : t("磁盘", "disk")}</small>
        </div>
        <div className="scan-actions">
          <button className="button button-quiet" type="button" onClick={() => void rescan()} disabled={rescanning}>
            <RefreshCw size={15} aria-hidden="true" className={rescanning ? "is-spinning" : undefined} />
            {rescanning ? t("正在扫描…", "Scanning…") : t("重新扫描", "Rescan")}
          </button>
        </div>
      </div>
      {rescanError && <p className="inline-error standalone">{rescanError}</p>}
      {lastRemoval && (
        <div className="removal-success" role="status">
          <div><Trash2 size={17} /><span><strong>{lastRemoval.skillName}</strong> {t("已移到可恢复的 Skill 回收站。", "was moved to the recoverable Skill trash.")}</span></div>
          <div>
            <button className="button button-quiet" type="button" onClick={() => void undoRemoval()} disabled={undoingRemoval}>
              <Undo2 size={14} /> {undoingRemoval ? t("正在恢复…", "Restoring…") : t("撤销", "Undo")}
            </button>
            <Link className="button button-quiet" href="/trash">{t("查看回收站", "Open trash")}</Link>
          </div>
        </div>
      )}

      <TaskRecommender
        skills={inventory.skills}
        workspace={workspace}
        query={query}
        onQueryChange={setQuery}
        searchInputRef={searchRef}
        onSelect={selectRecommendation}
        onClear={clearWorkspace}
      />

      <section className="workbench-controls" aria-label={t("查找和筛选技能", "Find and filter Skills")}>
        <div className="view-switcher" aria-label={t("切换列表样式", "Change list view")}>
          <button type="button" data-active={view === "compact"} onClick={() => setView("compact")} aria-label={t("紧凑视图", "Compact view")}>
            <List size={18} aria-hidden="true" /> <span>{t("紧凑", "Compact")}</span>
          </button>
          <button type="button" data-active={view === "cards"} onClick={() => setView("cards")} aria-label={t("卡片视图", "Card view")}>
            <LayoutGrid size={17} aria-hidden="true" /> <span>{t("卡片", "Cards")}</span>
          </button>
        </div>

        <div className="personal-filter-row" aria-label={t("个人整理筛选", "Personal organization filters")}>
          <span>{t("我的整理", "My library")}</span>
          <button type="button" data-active={collection === "all"} onClick={() => setCollection("all")}>{t("全部", "All")}</button>
          <button type="button" data-active={collection === "pinned"} onClick={() => setCollection("pinned")}><Pin size={13} aria-hidden="true" /> {t("置顶", "Pinned")} <b>{workspace.pinned.length}</b></button>
          <button type="button" data-active={collection === "favorites"} onClick={() => setCollection("favorites")}><Star size={13} aria-hidden="true" /> {t("收藏", "Favorites")} <b>{workspace.favorites.length}</b></button>
          <button type="button" data-active={collection === "recent"} onClick={() => setCollection("recent")}><Clock3 size={13} aria-hidden="true" /> {t("最近复制", "Recently copied")} <b>{workspace.recentCopies.length}</b></button>
          <small>{t("置顶技能会优先显示", "Pinned Skills are shown first")}</small>
        </div>

        <div className="filter-row">
          <span className="filter-label"><SlidersHorizontal size={15} aria-hidden="true" /> {t("筛选", "Filters")}</span>
          <label className="select-box">
            <span className="sr-only">{t("状态", "Status")}</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter) }>
              <option value="all">{t("全部状态", "All statuses")}</option>
              <option value="ready">{t("已就绪", "Ready")}</option>
              <option value="review">{t("需要审查", "Needs review")}</option>
              <option value="setup">{t("需要配置", "Needs setup")}</option>
              <option value="updates">{t(`有更新 (${updateRecords.filter((record) => ["update-available", "local-changes"].includes(record.status)).length})`, `Updates available (${updateRecords.filter((record) => ["update-available", "local-changes"].includes(record.status)).length})`)}</option>
              <option value="source:locked">{t("来源已锁定", "Source locked")}</option>
              <option value="source:unlocked">{t("来源未锁定", "Source unlocked")}</option>
              <option value="source:trusted">{t("来源在信任名单", "Trusted source")}</option>
              <option value="source:unlisted">{t("来源未列入信任名单", "Unlisted source")}</option>
              <option value="source:archived">{t("上游仓库已归档", "Archived upstream")}</option>
            </select>
          </label>
          <Link className="button button-quiet" href="/operations"><GitCompareArrows size={14} /> {t("批量检查", "Batch check")}</Link>
          <label className="select-box">
            <span className="sr-only">{t("来源", "Source")}</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="all">{t("全部来源", "All sources")}</option>
              <option value="personal">{t("个人", "Personal")}</option>
              <option value="system">{t("系统", "System")}</option>
              <option value="plugin">{t("插件", "Plugin")}</option>
              <option value="compatibility">{t("兼容目录", "Compatibility")}</option>
            </select>
          </label>
          {hasFilters && (
            <button type="button" className="reset-filters" onClick={resetFilters}>
              <RotateCcw size={14} aria-hidden="true" /> {t("清除", "Clear")}
            </button>
          )}
          <output className="result-count">{t("显示", "Showing")} {filtered.length} / {inventory.skills.length}</output>
        </div>
      </section>

      {filtered.length ? (
        <section className="inventory-workspace" data-view={view} aria-label={t("技能工作区", "Skill workspace")}>
          <div className="inventory-results">
            {view === "cards" ? (
              <div className="skill-grid" aria-label={t("技能卡片列表", "Skill card list")}>
                {filtered.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    selected={selectedSkill?.id === skill.id}
                    favorite={workspace.favorites.includes(skill.id)}
                    pinned={workspace.pinned.includes(skill.id)}
                    onSelect={selectSkill}
                  />
                ))}
              </div>
            ) : (
              <div className="compact-skill-list" aria-label={t("技能紧凑列表", "Compact Skill list")}>
                <div className="compact-list-heading" aria-hidden="true">
                  <span>{t("技能名称", "Skill")}</span><span>{t("状态", "Status")}</span><span>{t("来源", "Source")}</span><span>{t("文件", "Files")}</span>
                </div>
                {filtered.map((skill) => (
                  <button
                    type="button"
                    className="compact-skill-row"
                    key={skill.id}
                    data-selected={selectedSkill?.id === skill.id}
                    aria-pressed={selectedSkill?.id === skill.id}
                    onClick={() => selectSkill(skill)}
                  >
                    <span className="compact-skill-name"><strong>{skill.displayName}{workspace.pinned.includes(skill.id) && <Pin size={12} aria-label={t("已置顶", "Pinned")} />}{workspace.favorites.includes(skill.id) && <Star size={12} aria-label={t("已收藏", "Favorited")} />}</strong><code>${skill.name}</code></span>
                    <span className="compact-skill-status">
                      <StatusBadge status={skill.status} />
                      {skill.missingDependencies.length > 0 && (
                        <small title={skill.missingDependencies.join(", ")}>
                          {t("缺少", "Missing")}: {skill.missingDependencies.join(", ")}
                        </small>
                      )}
                    </span>
                    <span>{sourceLabel(skill.source, language)}</span>
                    <span>{skill.resources.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedSkill && (
            <SkillInspector
              key={selectedSkill.id}
              skill={selectedSkill}
              onPrompt={openPrompt}
              favorite={workspace.favorites.includes(selectedSkill.id)}
              pinned={workspace.pinned.includes(selectedSkill.id)}
              note={workspace.notes[selectedSkill.id] || ""}
              onToggleFavorite={toggleFavorite}
              onTogglePinned={togglePinned}
              onSaveNote={saveNote}
              onRemove={setRemovalSkill}
              onDisable={setDisableSkill}
            />
          )}
        </section>
      ) : (
        <section className="empty-state">
          <span>0</span>
          <h2>{t("当前筛选没有结果", "No results for these filters")}</h2>
          <p>{t("换一个关键词，或清除状态和来源筛选。", "Try another keyword or clear the status and source filters.")}</p>
          <button className="button button-quiet" type="button" onClick={resetFilters}>{t("清除筛选", "Clear filters")}</button>
        </section>
      )}

      {promptSkill && <PromptDialog skill={promptSkill} journeyStartedAt={promptJourneyStartedAt} onClose={() => setPromptSkill(null)} />}
      {removalSkill && <SkillRemovalDialog skillId={removalSkill.id} onClose={() => setRemovalSkill(null)} onRemoved={removed} />}
      {disableSkill && <SkillDisableDialog skillId={disableSkill.id} onClose={() => setDisableSkill(null)} onDisabled={disabled} />}
      {inventory.warnings.length > 0 && (
        <details className="scan-warnings">
          <summary>{t(`${inventory.warnings.length} 条扫描提示`, `${inventory.warnings.length} scan notices`)}</summary>
          <ul>{inventory.warnings.map((warning) => <li key={warning}>{localizeGeneratedText(warning, language)}</li>)}</ul>
        </details>
      )}
    </>
  );
}

"use client";

import { LayoutGrid, List, Pin, RefreshCw, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { localeFor, localizeGeneratedText, sourceLabel } from "@/core/i18n";
import type { BatchUpdateOverview, BatchUpdateRecord } from "@/core/lifecycle/update-batch";
import { catalogHealthBucket, catalogQuerySkillIds } from "@/core/skills/catalog";
import { paginateCatalog } from "@/core/skills/pagination";
import type { SkillInventorySummary, SkillSummary } from "@/core/skills/types";
import { CatalogFilterRail, type CatalogCollectionFilter, type CatalogStatusFilter } from "./catalog-filter-rail";
import { CatalogPersonalNote } from "./catalog-personal-note";
import { CatalogPagination } from "./catalog-pagination";
import { InvocationBuilder } from "./invocation-builder";
import { useLanguage } from "./language-provider";
import { SkillCard } from "./skill-card";
import { StatusBadge } from "./status-badge";
import { TaskRecommender } from "./task-recommender";
import { ResponsiveBuilderShell } from "./responsive-builder-shell";
import { useLocalWorkspace } from "./use-local-workspace";

type ViewMode = "cards" | "compact";

export function DashboardClient({
  inventory: initialInventory,
  initialFocusedSkillName = "",
  initialRecipeId = "",
}: {
  inventory: SkillInventorySummary;
  initialFocusedSkillName?: string;
  initialRecipeId?: string;
}) {
  const { language, t } = useLanguage();
  const initialFocusedSkill = initialInventory.skills.find((skill) => skill.name === initialFocusedSkillName);
  const [inventory, setInventory] = useState(initialInventory);
  const [query, setQuery] = useState(initialFocusedSkill?.name || "");
  const [status, setStatus] = useState<CatalogStatusFilter>("all");
  const [source, setSource] = useState("all");
  const [collection, setCollection] = useState<CatalogCollectionFilter>("all");
  const [view, setView] = useState<ViewMode>("compact");
  const [selectedId, setSelectedId] = useState(initialFocusedSkill?.id ?? "");
  const [page, setPage] = useState(1);
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState("");
  const [updateRecords, setUpdateRecords] = useState<BatchUpdateRecord[]>([]);
  const [selectedJourneyStartedAt, setSelectedJourneyStartedAt] = useState(() => Date.now());
  const [builderOpen, setBuilderOpen] = useState(Boolean(initialFocusedSkill));
  const searchRef = useRef<HTMLInputElement>(null);
  const {
    workspace,
    toggleFavorite,
    togglePinned,
    saveNote,
    clearWorkspace,
    savePromptRecipe,
    saveSkillWorkflow,
    recordSkillFeedback,
  } = useLocalWorkspace();

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
    const querySkillIds = catalogQuerySkillIds(inventory.skills, query, language, workspace.personalLibrary.feedback);
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
  }, [collection, inventory.skills, language, query, source, status, updateRecords, workspace.favorites, workspace.personalLibrary.feedback, workspace.pinned, workspace.recentCopies]);

  const catalogPage = useMemo(() => paginateCatalog(filtered, page), [filtered, page]);
  const selectedSkill = selectedId ? inventory.skills.find((skill) => skill.id === selectedId) ?? null : null;
  const selectedRecipe = initialRecipeId ? workspace.personalLibrary.recipes.find((recipe) => recipe.id === initialRecipeId) : undefined;
  const hasFilters = Boolean(query) || status !== "all" || source !== "all" || collection !== "all";

  function selectSkill(skill: SkillSummary) {
    setSelectedId(skill.id);
    setSelectedJourneyStartedAt(Date.now());
    setBuilderOpen(true);
  }

  function selectRecommendation(skill: SkillSummary) {
    setStatus("all");
    setSource("all");
    setCollection("all");
    setPage(1);
    selectSkill(skill);
    window.setTimeout(() => document.querySelector(".catalog-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function resetFilters() {
    setQuery("");
    setStatus("all");
    setSource("all");
    setCollection("all");
    setPage(1);
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
      setPage(1);
      return payload;
    } catch (error) {
      setRescanError(error instanceof Error ? error.message : t("重新扫描失败", "Rescan failed"));
    } finally {
      setRescanning(false);
    }
  }

  const environmentReady = inventory.skills.filter((skill) => catalogHealthBucket(skill) === "ready").length;
  const attention = inventory.skills.length - environmentReady;
  const updateCount = updateRecords.filter((record) => ["update-available", "local-changes"].includes(record.status)).length;
  const scannedAt = new Date(inventory.scannedAt).toLocaleTimeString(localeFor(language), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const builderTask = selectedSkill && query.trim() && ![selectedSkill.name, selectedSkill.displayName, `$${selectedSkill.name}`]
    .some((name) => name.toLocaleLowerCase() === query.trim().toLocaleLowerCase())
    ? query.trim()
    : "";

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
      <TaskRecommender
        skills={inventory.skills}
        workspace={workspace}
        query={query}
        onQueryChange={(nextQuery) => {
          setQuery(nextQuery);
          setPage(1);
        }}
        searchInputRef={searchRef}
        onSelect={selectRecommendation}
        onClear={clearWorkspace}
        onSaveWorkflow={saveSkillWorkflow}
      />

      <section className="catalog-workspace" data-view={view} data-builder={selectedSkill ? "open" : "closed"} aria-label={t("技能目录工作区", "Skill catalog workspace")}>
        <CatalogFilterRail
          status={status}
          source={source}
          collection={collection}
          workspace={workspace}
          updateCount={updateCount}
          resultCount={filtered.length}
          totalCount={inventory.skills.length}
          hasFilters={hasFilters}
          onStatusChange={(nextStatus) => { setStatus(nextStatus); setPage(1); }}
          onSourceChange={(nextSource) => { setSource(nextSource); setPage(1); }}
          onCollectionChange={(nextCollection) => { setCollection(nextCollection); setPage(1); }}
          onReset={resetFilters}
        />

        <div className="catalog-results-column">
          <header className="catalog-list-toolbar">
            <div><strong>{t("本地 Skill", "Local Skills")}</strong><span>{t(`显示 ${filtered.length} / ${inventory.skills.length}`, `Showing ${filtered.length} / ${inventory.skills.length}`)}</span></div>
            <div className="view-switcher" aria-label={t("切换列表样式", "Change list view")}>
              <button type="button" data-active={view === "compact"} onClick={() => { setView("compact"); setPage(1); }} aria-label={t("紧凑视图", "Compact view")}>
                <List size={18} aria-hidden="true" /> <span>{t("紧凑", "Compact")}</span>
              </button>
              <button type="button" data-active={view === "cards"} onClick={() => { setView("cards"); setPage(1); }} aria-label={t("卡片视图", "Card view")}>
                <LayoutGrid size={17} aria-hidden="true" /> <span>{t("卡片", "Cards")}</span>
              </button>
            </div>
          </header>

          {filtered.length ? (
            <div className="inventory-results">
            {view === "cards" ? (
              <div className="skill-grid" aria-label={t("技能卡片列表", "Skill card list")}>
                {catalogPage.items.map((skill) => (
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
                {catalogPage.items.map((skill) => (
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
            <CatalogPagination
              page={catalogPage}
              onPageChange={(nextPage) => {
                setPage(nextPage);
                setSelectedId("");
                setBuilderOpen(false);
                window.setTimeout(() => document.querySelector(".catalog-results-column")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
              }}
            />
            </div>
          ) : (
            <section className="empty-state">
              <span>0</span>
              <h2>{t("当前筛选没有结果", "No results for these filters")}</h2>
              <p>{t("换一个关键词，或清除状态和来源筛选。", "Try another keyword or clear the status and source filters.")}</p>
              <button className="button button-quiet" type="button" onClick={resetFilters}>{t("清除筛选", "Clear filters")}</button>
            </section>
          )}

          {selectedSkill && <CatalogPersonalNote key={selectedSkill.id} skill={selectedSkill} note={workspace.notes[selectedSkill.id] || ""} onSave={saveNote} />}
        </div>

        {selectedSkill && (
          <ResponsiveBuilderShell
            labelledBy={`invocation-builder-${selectedSkill.id}`}
            open={builderOpen}
            onOpen={() => setBuilderOpen(true)}
            onClose={() => setBuilderOpen(false)}
          >
            <InvocationBuilder
              key={`${selectedSkill.id}:${selectedRecipe?.id || "fresh"}`}
              skill={selectedSkill}
              initialTask={builderTask}
              journeyStartedAt={selectedJourneyStartedAt}
              favorite={workspace.favorites.includes(selectedSkill.id)}
              pinned={workspace.pinned.includes(selectedSkill.id)}
              onToggleFavorite={toggleFavorite}
              onTogglePinned={togglePinned}
              workspace={workspace}
              onSaveRecipe={savePromptRecipe}
              onFeedback={recordSkillFeedback}
              initialRecipe={selectedRecipe}
            />
          </ResponsiveBuilderShell>
        )}
      </section>
      {inventory.warnings.length > 0 && (
        <details className="scan-warnings">
          <summary>{t(`${inventory.warnings.length} 条扫描提示`, `${inventory.warnings.length} scan notices`)}</summary>
          <ul>{inventory.warnings.map((warning) => <li key={warning}>{localizeGeneratedText(warning, language)}</li>)}</ul>
        </details>
      )}
    </>
  );
}

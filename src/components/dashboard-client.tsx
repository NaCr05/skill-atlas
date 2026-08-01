"use client";

import { AlertTriangle, Clock3, Gauge, Layers3, LayoutGrid, List, Pin, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { environmentStatusLabel, localeFor, localizeGeneratedText, sourceLabel, statusLabel, structureStatusLabel } from "@/core/i18n";
import { recordZeroResultSearch } from "@/core/local-workspace";
import { translatedSkillDescription, translatedTags, translatedUseCases } from "@/core/skill-translations";
import type { SkillEnvironmentStatus, SkillInventory, SkillRecord, SkillStatus, SkillStructureStatus } from "@/core/skills/types";
import { useLanguage } from "./language-provider";
import { PromptDialog } from "./prompt-dialog";
import { SkillCard } from "./skill-card";
import { SkillInspector } from "./skill-inspector";
import { StatusBadge } from "./status-badge";
import { TaskRecommender } from "./task-recommender";
import { useLocalWorkspace } from "./use-local-workspace";

type ViewMode = "cards" | "compact";
type StatusFilter = "all" | SkillStatus | `structure:${SkillStructureStatus}` | `environment:${SkillEnvironmentStatus}`;
type CollectionFilter = "all" | "pinned" | "favorites" | "recent";

export function DashboardClient({ inventory: initialInventory }: { inventory: SkillInventory }) {
  const { language, t } = useLanguage();
  const [inventory, setInventory] = useState(initialInventory);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [source, setSource] = useState("all");
  const [collection, setCollection] = useState<CollectionFilter>("all");
  const [view, setView] = useState<ViewMode>("compact");
  const [selectedId, setSelectedId] = useState(
    initialInventory.skills.find((skill) => skill.environmentStatus === "ready")?.id ?? initialInventory.skills[0]?.id ?? "",
  );
  const [promptSkill, setPromptSkill] = useState<SkillRecord | null>(null);
  const [promptJourneyStartedAt, setPromptJourneyStartedAt] = useState<number>();
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState("");
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const recentRank = new Map(workspace.recentCopies.map((item, index) => [item.skillId, index]));
    return inventory.skills.filter((skill) => {
      const matchesQuery =
        !needle ||
        `${skill.name} ${skill.displayName} ${skill.description} ${translatedSkillDescription(skill)} ${skill.tags.join(" ")} ${translatedTags(skill.tags).join(" ")} ${skill.useCases.join(" ")} ${translatedUseCases(skill).join(" ")}`
          .toLocaleLowerCase()
          .includes(needle);
      const matchesStatus = status === "all"
        || (status.startsWith("structure:") && skill.structureStatus === status.slice("structure:".length))
        || (status.startsWith("environment:") && skill.environmentStatus === status.slice("environment:".length))
        || skill.status === status
        || skill.secondaryStatuses.includes(status as SkillStatus);
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
  }, [collection, inventory.skills, language, query, source, status, workspace.favorites, workspace.pinned, workspace.recentCopies]);

  const selectedSkill = filtered.find((skill) => skill.id === selectedId) ?? filtered[0] ?? null;
  const hasFilters = Boolean(query) || status !== "all" || source !== "all" || collection !== "all";

  function selectSkill(skill: SkillRecord) {
    setSelectedId(skill.id);
    journeyStarts.current.set(skill.id, Date.now());
  }

  function selectRecommendation(skill: SkillRecord) {
    setQuery("");
    setStatus("all");
    setSource("all");
    setCollection("all");
    selectSkill(skill);
    window.setTimeout(() => document.querySelector(".inventory-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function openPrompt(skill: SkillRecord) {
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

  async function rescan() {
    setRescanning(true);
    setRescanError("");
    try {
      const response = await fetch("/api/skills", { method: "POST" });
      const payload = (await response.json()) as SkillInventory & { error?: string };
      if (!response.ok) throw new Error(payload.error || t("重新扫描失败", "Rescan failed"));
      setInventory(payload);
    } catch (error) {
      setRescanError(error instanceof Error ? error.message : t("重新扫描失败", "Rescan failed"));
    } finally {
      setRescanning(false);
    }
  }

  const structureValid = inventory.skills.filter((skill) => skill.structureStatus === "valid").length;
  const environmentReady = inventory.skills.filter((skill) => skill.environmentStatus === "ready").length;
  const attention = inventory.skills.filter((skill) => skill.environmentStatus !== "ready").length;
  const scannedAt = new Date(inventory.scannedAt).toLocaleTimeString(localeFor(language), { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <>
      <h2 className="sr-only" id="skill-status-overview">{t("能力状态概览", "Skill status overview")}</h2>
      <section className="workbench-stats" aria-labelledby="skill-status-overview">
        <article>
          <span><Layers3 size={17} aria-hidden="true" /> {t("已发现", "Discovered")}</span>
          <strong>{inventory.skills.length}</strong>
          <small>{t("当前生效入口", "Active entries only")}</small>
        </article>
        <article>
          <span><ShieldCheck size={17} aria-hidden="true" /> {t("结构有效", "Structure valid")}</span>
          <strong>{structureValid}</strong>
          <small>{t("元数据与目录可解析", "Metadata and directory parsed")}</small>
        </article>
        <article>
          <span><Gauge size={17} aria-hidden="true" /> {t("基础环境就绪", "Base environment ready")}</span>
          <strong>{environmentReady}</strong>
          <small>{t("无缺失依赖或外部工具声明", "No missing dependencies or declared external tools")}</small>
        </article>
        <article data-alert={attention > 0}>
          <span><AlertTriangle size={17} aria-hidden="true" /> {t("需要确认", "Needs review")}</span>
          <strong>{attention}</strong>
          <small>{t("配置、工具或元数据待处理", "Setup, tools, or metadata need review")}</small>
        </article>
      </section>

      <div className="scan-status" role="status" aria-live="polite">
        <div>
          <span>{t("上次扫描", "Last scan")} {scannedAt}</span>
          <small>{inventory.durationMs.toLocaleString(localeFor(language))} ms · {inventory.cache.hit ? t("来自缓存", "from cache") : t("磁盘扫描", "disk scan")}</small>
        </div>
        <button className="button button-quiet" type="button" onClick={() => void rescan()} disabled={rescanning}>
          <RefreshCw size={15} aria-hidden="true" className={rescanning ? "is-spinning" : undefined} />
          {rescanning ? t("正在扫描…", "Scanning…") : t("重新扫描", "Rescan")}
        </button>
      </div>
      {rescanError && <p className="inline-error standalone">{rescanError}</p>}

      <TaskRecommender skills={inventory.skills} workspace={workspace} onSelect={selectRecommendation} onClear={clearWorkspace} />

      <section className="workbench-controls" aria-label={t("查找和筛选技能", "Find and filter Skills")}>
        <label className="command-search">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">{t("搜索技能", "Search Skills")}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim() && filtered.length === 0) recordZeroResultSearch(query, "inventory");
            }}
            placeholder={t("搜索名称、功能或标签…", "Search by name, capability, or tag…")}
          />
          <kbd>Ctrl K</kbd>
        </label>

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
              <option value="structure:valid">{structureStatusLabel("valid", language)}</option>
              <option value="environment:ready">{environmentStatusLabel("ready", language)}</option>
              <option value="environment:unverified">{environmentStatusLabel("unverified", language)}</option>
              <option value="environment:needs-setup">{environmentStatusLabel("needs-setup", language)}</option>
              <option value="usable">{statusLabel("usable", language)}</option>
              <option value="explicit-only">{statusLabel("explicit-only", language)}</option>
              <option value="conditional">{statusLabel("conditional", language)}</option>
              <option value="missing-dependency">{statusLabel("missing-dependency", language)}</option>
              <option value="invalid-metadata">{statusLabel("invalid-metadata", language)}</option>
              <option value="duplicate">{statusLabel("duplicate", language)}</option>
            </select>
          </label>
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
                    <StatusBadge status={skill.status} />
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
      {inventory.warnings.length > 0 && (
        <details className="scan-warnings">
          <summary>{t(`${inventory.warnings.length} 条扫描提示`, `${inventory.warnings.length} scan notices`)}</summary>
          <ul>{inventory.warnings.map((warning) => <li key={warning}>{localizeGeneratedText(warning, language)}</li>)}</ul>
        </details>
      )}
    </>
  );
}

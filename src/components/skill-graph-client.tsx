"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Check,
  Copy,
  Focus,
  GitBranch,
  Layers3,
  Link2,
  LocateFixed,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Network,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { sourceKindLabel, type Language } from "@/core/i18n";
import { translatedSkillDescription } from "@/core/skill-translations";
import {
  buildSkillGraph,
  categorizeSkill,
  constellationLayout,
  globalClusterLayout,
  graphDistances,
  type SkillGraphCategory,
  type SkillGraphRelation,
} from "@/core/skills/graph";
import type { SkillInventorySummary, SkillSourceKind, SkillSummary } from "@/core/skills/types";
import { useLanguage } from "./language-provider";
import { PromptDialog } from "./prompt-dialog";
import { SkillInspector } from "./skill-inspector";
import { useLocalWorkspace } from "./use-local-workspace";
import styles from "./skill-graph.module.css";

const LEGACY_FOCUS_LAYOUT_KEY = "skill-atlas:knowledge-graph-layout:v1";
const ATLAS_CORE_ID = "__skill-atlas-core__";
const LAYOUT_STORAGE_KEYS = {
  global: "skill-atlas:knowledge-graph-layout:global:v3",
  focus: "skill-atlas:knowledge-graph-layout:focus:v1",
} as const;

type GraphMode = "global" | "focus";
type GraphDepth = 1 | 2;
type GraphStatusFilter = "all" | "ready" | "attention";
type GraphSourceFilter = "all" | SkillSourceKind;
type GraphRelationFilter = "all" | SkillGraphRelation;

interface SkillNodeData extends Record<string, unknown> {
  skill: SkillSummary;
  distance: number;
  language: Language;
  mode: GraphMode;
  category: SkillGraphCategory;
  categoryLabel: string;
  categoryColor: string;
  categoryCount: number;
  showCategoryLabel: boolean;
  muted: boolean;
}

interface AtlasCoreNodeData extends Record<string, unknown> {
  language: Language;
  total: number;
  ready: number;
}

type SkillFlowNode = Node<SkillNodeData, "skill">;
type AtlasCoreNode = Node<AtlasCoreNodeData, "atlas-core">;
type GraphFlowNode = SkillFlowNode | AtlasCoreNode;
type SkillFlowEdge = Edge<{ relation: SkillGraphRelation | "cluster"; reason: string }>;
type StoredPositions = Record<string, { x: number; y: number }>;

const CATEGORY_PRESENTATION: Record<SkillGraphCategory, { zh: string; en: string; color: string }> = {
  design: { zh: "前端与设计", en: "Frontend & design", color: "#8ba2ff" },
  engineering: { zh: "工程与架构", en: "Engineering & architecture", color: "#58c7d2" },
  documents: { zh: "文档与论文", en: "Documents & papers", color: "#bd9cff" },
  research: { zh: "搜索与研究", en: "Search & research", color: "#f0b35d" },
  data: { zh: "数据与分析", en: "Data & analytics", color: "#5ed5ae" },
  productivity: { zh: "项目与生产力", en: "Projects & productivity", color: "#ff9f80" },
  media: { zh: "多媒体与创作", en: "Media & creation", color: "#e486c2" },
  system: { zh: "系统与工具", en: "System & tools", color: "#8190aa" },
};

function readStoredPositions(mode: GraphMode): StoredPositions {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEYS[mode])
      ?? (mode === "focus" ? window.localStorage.getItem(LEGACY_FOCUS_LAYOUT_KEY) : null)
      ?? "{}";
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).flatMap(([id, value]) => {
      if (!value || typeof value !== "object") return [];
      const position = value as Record<string, unknown>;
      if (typeof position.x !== "number" || typeof position.y !== "number") return [];
      return [[id, { x: position.x, y: position.y }]];
    }));
  } catch {
    return {};
  }
}

function nodeStatusColor(skill: SkillSummary): string {
  if (skill.structureStatus !== "valid" || skill.environmentStatus === "blocked") return "#ff8581";
  if (skill.environmentStatus !== "ready") return "#f0b35d";
  return "#5ed5ae";
}

function SkillNodeCard({ data, selected }: NodeProps<SkillFlowNode>) {
  const { skill, distance, language, mode } = data;
  const description = language === "zh" ? translatedSkillDescription(skill) : skill.description;
  return (
    <div className={styles.nodeShell} data-mode={mode} data-muted={data.muted}>
      {data.showCategoryLabel && (
        <div className={styles.categoryLabel} style={{ color: data.categoryColor }}>
          <span>{data.categoryLabel}</span>
          <small>{data.categoryCount} Skills</small>
        </div>
      )}
      <article
        className={styles.skillNode}
        data-selected={selected}
        data-distance={distance}
        data-mode={mode}
        style={{ "--category-color": data.categoryColor } as CSSProperties}
      >
        <Handle className={styles.handle} type="target" position={Position.Left} />
        <div className={styles.nodeTopline}>
          <span>{mode === "global" ? data.categoryLabel : sourceKindLabel(skill.source.kind, language)}</span>
          <i style={{ backgroundColor: nodeStatusColor(skill) }} aria-hidden="true" />
        </div>
        <strong>{skill.displayName}</strong>
        <code>${skill.name}</code>
        {mode === "focus" && <p>{description}</p>}
        <div className={styles.nodeFooter}>
          <span>{skill.relationships.length + skill.dependencies.length} {language === "zh" ? "项关系" : "relations"}</span>
          {distance === 0 && <b>{language === "zh" ? "当前焦点" : "Focused"}</b>}
        </div>
        <Handle className={styles.handle} type="source" position={Position.Right} />
      </article>
    </div>
  );
}

function AtlasCoreNodeCard({ data }: NodeProps<AtlasCoreNode>) {
  return (
    <div className={styles.atlasCore} data-testid="skill-atlas-core">
      <Handle className={styles.coreHandle} type="source" position={Position.Right} />
      <span><Network size={18} aria-hidden="true" /> Skill Atlas</span>
      <strong>{data.total}</strong>
      <small>{data.language === "zh" ? `${data.ready} 个能力已就绪` : `${data.ready} capabilities ready`}</small>
      <i aria-hidden="true" />
    </div>
  );
}

const nodeTypes = { skill: SkillNodeCard, "atlas-core": AtlasCoreNodeCard };

function mostConnectedSkill(skills: SkillSummary[]): SkillSummary | undefined {
  return [...skills].sort((left, right) =>
    (right.relationships.length + right.dependencies.length) - (left.relationships.length + left.dependencies.length)
    || left.displayName.localeCompare(right.displayName),
  )[0];
}

function SkillGraphWorkspace({ inventory }: { inventory: SkillInventorySummary }) {
  const { language, t } = useLanguage();
  const graph = useMemo(() => buildSkillGraph(inventory.skills), [inventory.skills]);
  const initialSkill = useMemo(() => mostConnectedSkill(graph.skills), [graph.skills]);
  const globalLayout = useMemo(() => globalClusterLayout(graph.skills), [graph.skills]);
  const [mode, setMode] = useState<GraphMode>("global");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<GraphDepth>(1);
  const [source, setSource] = useState<GraphSourceFilter>("all");
  const [status, setStatus] = useState<GraphStatusFilter>("all");
  const [relation, setRelation] = useState<GraphRelationFilter>("all");
  const [savedLayouts, setSavedLayouts] = useState<Record<GraphMode, StoredPositions>>({ global: {}, focus: {} });
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [layoutNotice, setLayoutNotice] = useState("");
  const [promptSkill, setPromptSkill] = useState<SkillSummary | null>(null);
  const [promptJourneyStartedAt, setPromptJourneyStartedAt] = useState<number>();
  const [isExpanded, setIsExpanded] = useState(false);
  const journeyStarts = useRef(new Map<string, number>());
  const workspaceRef = useRef<HTMLElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<SkillFlowEdge>([]);
  const { fitView, setCenter } = useReactFlow<GraphFlowNode, SkillFlowEdge>();
  const { workspace, toggleFavorite, togglePinned, saveNote } = useLocalWorkspace();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setSavedLayouts({
      global: readStoredPositions("global"),
      focus: readStoredPositions("focus"),
    }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function syncFullscreenState() {
      setIsExpanded(document.fullscreenElement === workspaceRef.current);
    }
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;
    function exitOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => setIsExpanded(false));
      } else {
        setIsExpanded(false);
      }
    }
    window.addEventListener("keydown", exitOnEscape);
    return () => window.removeEventListener("keydown", exitOnEscape);
  }, [isExpanded]);

  const selectedSkill = graph.skills.find((skill) => skill.id === selectedId) ?? null;
  const relationEdges = useMemo(
    () => graph.edges.filter((edge) => relation === "all" || edge.relation === relation),
    [graph.edges, relation],
  );
  const distanceMap = useMemo(
    () => mode === "focus" && selectedId
      ? graphDistances({ ...graph, edges: relationEdges }, selectedId, depth)
      : new Map<string, number>(),
    [depth, graph, mode, relationEdges, selectedId],
  );
  const visibleSkills = useMemo(() => graph.skills.filter((skill) => {
    if (mode === "focus" && !distanceMap.has(skill.id)) return false;
    if (skill.id === selectedId) return true;
    if (source !== "all" && skill.source.kind !== source) return false;
    if (status === "ready" && skill.environmentStatus !== "ready") return false;
    if (status === "attention" && skill.environmentStatus === "ready" && skill.structureStatus === "valid") return false;
    return true;
  }), [distanceMap, graph.skills, mode, selectedId, source, status]);
  const visibleIds = useMemo(() => new Set(visibleSkills.map((skill) => skill.id)), [visibleSkills]);
  const visibleEdges = useMemo(
    () => relationEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    [relationEdges, visibleIds],
  );
  const visibleCategoryLeaders = useMemo(() => {
    const leaders = new Map<SkillGraphCategory, string>();
    const counts = new Map<SkillGraphCategory, number>();
    const leaderDistances = new Map<SkillGraphCategory, number>();
    for (const skill of visibleSkills) {
      const category = categorizeSkill(skill);
      const position = globalLayout.positions.get(skill.id) ?? { x: 0, y: 0 };
      const distanceFromCore = Math.hypot(position.x + 115, position.y + 52);
      if (!leaders.has(category) || distanceFromCore < (leaderDistances.get(category) ?? Number.POSITIVE_INFINITY)) {
        leaders.set(category, skill.id);
        leaderDistances.set(category, distanceFromCore);
      }
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return { leaders, counts };
  }, [globalLayout.positions, visibleSkills]);
  const activeIds = useMemo(() => {
    const active = new Set<string>();
    if (!selectedId) return active;
    active.add(selectedId);
    for (const edge of visibleEdges) {
      if (edge.source === selectedId) active.add(edge.target);
      if (edge.target === selectedId) active.add(edge.source);
    }
    return active;
  }, [selectedId, visibleEdges]);

  useEffect(() => {
    const positions = mode === "global" ? globalLayout.positions : constellationLayout(distanceMap);
    const savedPositions = savedLayouts[mode];
    const skillNodes: SkillFlowNode[] = visibleSkills.map((skill) => ({
      id: skill.id,
      type: "skill",
      data: {
        skill,
        distance: mode === "focus" ? distanceMap.get(skill.id) ?? 0 : -1,
        language,
        mode,
        category: categorizeSkill(skill),
        categoryLabel: CATEGORY_PRESENTATION[categorizeSkill(skill)][language],
        categoryColor: CATEGORY_PRESENTATION[categorizeSkill(skill)].color,
        categoryCount: visibleCategoryLeaders.counts.get(categorizeSkill(skill)) ?? 0,
        showCategoryLabel: mode === "global" && visibleCategoryLeaders.leaders.get(categorizeSkill(skill)) === skill.id,
        muted: mode === "global" && Boolean(selectedId) && !activeIds.has(skill.id),
      },
      position: savedPositions[skill.id] ?? positions.get(skill.id) ?? { x: 0, y: 0 },
      selected: skill.id === selectedId,
    }));
    const nextNodes: GraphFlowNode[] = mode === "global"
      ? [{
          id: ATLAS_CORE_ID,
          type: "atlas-core",
          data: {
            language,
            total: visibleSkills.length,
            ready: visibleSkills.filter((skill) => skill.environmentStatus === "ready").length,
          },
          position: { x: -132, y: -91 },
          draggable: false,
          selectable: false,
        }, ...skillNodes]
      : skillNodes;
    const relationshipEdges: SkillFlowEdge[] = visibleEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: edge.relation === "dependency" && (mode === "focus" || edge.source === selectedId || edge.target === selectedId),
      markerEnd: edge.relation === "dependency" ? { type: MarkerType.ArrowClosed, color: "#58c7d2" } : undefined,
      data: { relation: edge.relation, reason: edge.reason },
      className: [
        edge.relation === "dependency" ? styles.dependencyEdge : styles.relatedEdge,
        mode === "global" && selectedId
          ? edge.source === selectedId || edge.target === selectedId ? styles.activeEdge : styles.quietEdge
          : mode === "global" ? styles.globalEdge : "",
      ].filter(Boolean).join(" "),
      ariaLabel: edge.reason,
    }));
    const selectedCategory = selectedSkill ? categorizeSkill(selectedSkill) : null;
    const clusterEdges: SkillFlowEdge[] = mode === "global"
      ? [...visibleCategoryLeaders.leaders.entries()].map(([category, leaderId]) => ({
          id: `cluster:${category}`,
          source: ATLAS_CORE_ID,
          target: leaderId,
          type: "straight",
          data: { relation: "cluster", reason: `${CATEGORY_PRESENTATION[category][language]} capability orbit` },
          className: [
            styles.radialEdge,
            selectedId
              ? selectedCategory === category ? styles.activeRadialEdge : styles.quietRadialEdge
              : "",
          ].filter(Boolean).join(" "),
          ariaLabel: `${CATEGORY_PRESENTATION[category][language]} capability orbit`,
        }))
      : [];
    setNodes(nextNodes);
    setEdges([...clusterEdges, ...relationshipEdges]);
  }, [activeIds, distanceMap, globalLayout.positions, language, mode, savedLayouts, selectedId, selectedSkill, setEdges, setNodes, visibleCategoryLeaders, visibleEdges, visibleSkills]);

  const fitKey = `${mode}:${mode === "focus" ? selectedId : "all"}:${depth}:${source}:${status}:${relation}:${layoutRevision}:${isExpanded}`;
  useEffect(() => {
    const timer = window.setTimeout(
      () => void fitView({ padding: mode === "global" ? 0.08 : 0.2, duration: 420, maxZoom: 1.15 }),
      isExpanded ? 100 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [fitKey, fitView, isExpanded, mode]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return graph.skills.flatMap((skill) => {
      const description = language === "zh" ? translatedSkillDescription(skill) : skill.description;
      const name = skill.name.toLocaleLowerCase();
      const displayName = skill.displayName.toLocaleLowerCase();
      const searchable = `${name} ${displayName} ${description} ${skill.tags.join(" ")}`.toLocaleLowerCase();
      if (!searchable.includes(needle)) return [];
      const rank = name === needle || displayName === needle
        ? 0
        : name.startsWith(needle) || displayName.startsWith(needle)
          ? 1
          : 2;
      return [{ skill, rank }];
    }).sort((left, right) => left.rank - right.rank || left.skill.displayName.localeCompare(right.skill.displayName))
      .slice(0, 6)
      .map((result) => result.skill);
  }, [graph.skills, language, query]);

  function focusSkill(skill: SkillSummary) {
    setSelectedId(skill.id);
    setQuery("");
    journeyStarts.current.set(skill.id, Date.now());
    if (mode === "global") {
      const target = nodes.find((node) => node.id === skill.id);
      if (target) {
        window.requestAnimationFrame(() => void setCenter(target.position.x + 115, target.position.y + 58, { zoom: 0.95, duration: 420 }));
      }
    }
  }

  function changeMode(nextMode: GraphMode) {
    if (nextMode === mode) return;
    if (nextMode === "focus" && !selectedId && initialSkill) setSelectedId(initialSkill.id);
    setMode(nextMode);
    setLayoutNotice("");
  }

  function saveLayout() {
    const positions = Object.fromEntries(nodes.filter((node) => node.type === "skill").map((node) => [node.id, node.position]));
    const mergedPositions = { ...savedLayouts[mode], ...positions };
    window.localStorage.setItem(LAYOUT_STORAGE_KEYS[mode], JSON.stringify(mergedPositions));
    setSavedLayouts((current) => ({ ...current, [mode]: mergedPositions }));
    setLayoutNotice(t(
      mode === "global" ? "全局地图布局已保存在这台设备上" : "聚焦布局已保存在这台设备上",
      mode === "global" ? "Global map layout saved on this device" : "Focus layout saved on this device",
    ));
    window.setTimeout(() => setLayoutNotice(""), 2_000);
  }

  function restoreAutomaticLayout() {
    window.localStorage.removeItem(LAYOUT_STORAGE_KEYS[mode]);
    setSavedLayouts((current) => ({ ...current, [mode]: {} }));
    setLayoutRevision((value) => value + 1);
    setLayoutNotice(t(
      mode === "global" ? "已恢复放射状能力地图" : "已恢复自动星座布局",
      mode === "global" ? "Radial capability map restored" : "Automatic constellation layout restored",
    ));
    window.setTimeout(() => setLayoutNotice(""), 2_000);
  }

  async function toggleExpandedView() {
    const target = workspaceRef.current;
    if (!target) return;

    if (document.fullscreenElement === target) {
      await document.exitFullscreen();
      return;
    }
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    try {
      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else {
        setIsExpanded(true);
      }
    } catch {
      setIsExpanded(true);
    }
  }

  function openPrompt(skill: SkillSummary) {
    setPromptJourneyStartedAt(journeyStarts.current.get(skill.id) ?? Date.now());
    setPromptSkill(skill);
  }

  const readyCount = visibleSkills.filter((skill) => skill.environmentStatus === "ready").length;

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}><Network size={14} aria-hidden="true" /> {t("本地能力关系图", "LOCAL CAPABILITY MAP")}</span>
          <h1>{t("Skills 知识图谱", "Skill knowledge graph")}</h1>
          <p>{t(
            mode === "global"
              ? "从宏观地图查看所有已安装 Skill，点击任一节点即可检查能力、关系和调用方式。"
              : "以一个 Skill 为中心，查看它的依赖、功能关联和可继续探索的能力。",
            mode === "global"
              ? "Explore every installed Skill on one capability map, then select any node to inspect its purpose, relationships, and invocation."
              : "Focus on one Skill to inspect its dependencies, related capabilities, and the next useful connections.",
          )}</p>
        </div>
        <div className={styles.headerControls}>
          <div className={styles.modeSwitcher} aria-label={t("图谱模式", "Graph mode")}>
            <button type="button" data-active={mode === "global"} onClick={() => changeMode("global")}>
              <MapIcon size={15} aria-hidden="true" /> {t("全局地图", "Global map")}
            </button>
            <button type="button" data-active={mode === "focus"} onClick={() => changeMode("focus")}>
              <Focus size={15} aria-hidden="true" /> {t("聚焦探索", "Focus")}
            </button>
          </div>
          <div className={styles.graphSummary} aria-label={t("当前视图摘要", "Current view summary")}>
            <span><strong>{visibleSkills.length}</strong>{t("个节点", "nodes")}</span>
            <span><strong>{visibleEdges.length}</strong>{t("条关系", "relations")}</span>
            <span><strong>{readyCount}</strong>{t("个已就绪", "ready")}</span>
          </div>
        </div>
      </header>

      <section className={styles.toolbar} aria-label={t("图谱控制", "Graph controls")}>
        <div className={styles.searchBox}>
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="graph-search">{t("搜索 Skill", "Search Skills")}</label>
          <input
            id="graph-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchResults[0]) focusSkill(searchResults[0]);
            }}
            placeholder={t("输入名称、功能或标签并聚焦…", "Search by name, capability, or tag…")}
          />
          {query.trim() && (
            <div className={styles.searchResults}>
              {searchResults.length ? searchResults.map((skill) => (
                <button type="button" key={skill.id} onClick={() => focusSkill(skill)}>
                  <span><strong>{skill.displayName}</strong><code>${skill.name}</code></span>
                  <Focus size={15} aria-hidden="true" />
                </button>
              )) : <p>{t("没有找到匹配的 Skill", "No matching Skill found")}</p>}
            </div>
          )}
        </div>

        <label>
          <span>{t("来源", "Source")}</span>
          <select value={source} onChange={(event) => setSource(event.target.value as GraphSourceFilter)}>
            <option value="all">{t("全部来源", "All sources")}</option>
            <option value="personal">{t("个人", "Personal")}</option>
            <option value="system">{t("系统", "System")}</option>
            <option value="plugin">{t("插件", "Plugin")}</option>
            <option value="compatibility">{t("兼容目录", "Compatibility")}</option>
          </select>
        </label>
        <label>
          <span>{t("状态", "Status")}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as GraphStatusFilter)}>
            <option value="all">{t("全部状态", "All statuses")}</option>
            <option value="ready">{t("环境已就绪", "Environment ready")}</option>
            <option value="attention">{t("需要处理", "Needs attention")}</option>
          </select>
        </label>
        <label>
          <span>{t("关系", "Relation")}</span>
          <select value={relation} onChange={(event) => setRelation(event.target.value as GraphRelationFilter)}>
            <option value="all">{t("全部关系", "All relations")}</option>
            <option value="dependency">{t("必需依赖", "Dependencies")}</option>
            <option value="related">{t("功能关联", "Related")}</option>
          </select>
        </label>
        {mode === "focus" ? (
          <div className={styles.depthControl} aria-label={t("关系深度", "Relationship depth")}>
            <span>{t("深度", "Depth")}</span>
            <button type="button" data-active={depth === 1} onClick={() => setDepth(1)}>1</button>
            <button type="button" data-active={depth === 2} onClick={() => setDepth(2)}>2</button>
          </div>
        ) : (
          <div className={styles.mapScope}>
            <span>{t("范围", "Scope")}</span>
            <strong>{t("全部 Skill", "All Skills")}</strong>
          </div>
        )}
        <button className={styles.toolButton} type="button" onClick={restoreAutomaticLayout}>
          <LocateFixed size={15} aria-hidden="true" /> {t("自动布局", "Auto layout")}
        </button>
        <button className={styles.toolButton} type="button" onClick={saveLayout}>
          <Save size={15} aria-hidden="true" /> {t("保存布局", "Save layout")}
        </button>
      </section>

      <section
        ref={workspaceRef}
        className={styles.workspace}
        data-inspecting={Boolean(selectedSkill)}
        data-expanded={isExpanded}
      >
        <div className={styles.canvas} aria-label={t("Skills 关系画布", "Skill relationship canvas")}>
          <ReactFlow<GraphFlowNode, SkillFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              const skill = graph.skills.find((item) => item.id === node.id);
              if (skill) focusSkill(skill);
            }}
            onPaneClick={() => {
              if (mode === "global") setSelectedId("");
            }}
            fitView
            minZoom={mode === "global" ? 0.12 : 0.28}
            maxZoom={1.6}
            nodesConnectable={false}
            deleteKeyCode={null}
          >
            <Background color="#25324b" gap={24} size={1} />
            <MiniMap<GraphFlowNode>
              className={styles.miniMap}
              nodeColor={(node) => node.type === "skill" ? nodeStatusColor(node.data.skill) : "#8ba2ff"}
              maskColor="rgb(8 13 23 / 72%)"
              pannable
              zoomable
            />
            <Controls className={styles.flowControls} showInteractive={false} />
          </ReactFlow>

          <button
            className={styles.fullscreenButton}
            type="button"
            onClick={() => void toggleExpandedView()}
            aria-label={isExpanded ? t("退出全屏", "Exit fullscreen") : t("全屏浏览", "Browse fullscreen")}
            title={isExpanded ? t("退出全屏，也可以按 Esc", "Exit fullscreen, or press Esc") : t("让知识图谱占满浏览器窗口", "Fill the browser window with the knowledge graph")}
          >
            {isExpanded ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
            <span>{isExpanded ? t("退出全屏", "Exit fullscreen") : t("全屏浏览", "Fullscreen")}</span>
          </button>

          <div className={styles.legend}>
            <span><i data-kind="dependency" /> {t("必需依赖", "Dependency")}</span>
            <span><i data-kind="related" /> {t("功能关联", "Related")}</span>
            <span><b data-status="ready" /> {t("环境就绪", "Ready")}</span>
            <span><b data-status="attention" /> {t("需要处理", "Needs attention")}</span>
          </div>
          {mode === "global" && !selectedSkill && (
            <div className={styles.mapIntro}>
              <Sparkles size={16} aria-hidden="true" />
              <span>{t("拖动画布探索能力星系，点击节点展开详情", "Drag to explore the capability galaxy, then select a node for details")}</span>
            </div>
          )}
          {layoutNotice && <div className={styles.notice} role="status"><Check size={14} /> {layoutNotice}</div>}
          {mode === "focus" && visibleSkills.length === 1 && (
            <div className={styles.isolatedHint}>
              <Sparkles size={18} aria-hidden="true" />
              <p>{t("当前筛选下没有相邻节点。尝试切换关系类型、来源或状态。", "No neighboring nodes match these filters. Try another relation, source, or status.")}</p>
            </div>
          )}
        </div>

        <div className={styles.details}>
          <div className={styles.contextStrip}>
            <span>{mode === "global" ? <MapIcon size={14} /> : <GitBranch size={14} />} {selectedSkill ? t("已选 Skill", "Selected Skill") : t("宏观地图", "Capability map")}</span>
            <small>{t("点击图中的节点查看详情", "Select a node to inspect details")}</small>
          </div>
          {selectedSkill ? (
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
          ) : (
            <div className={styles.noSelection}>
              <Layers3 size={24} />
              <h2>{t("选择一个 Skill", "Select a Skill")}</h2>
              <p>{t("地图会保留全局位置，同时高亮它的一层关系并在这里显示完整信息。", "The map keeps its global context, highlights first-degree relationships, and shows full details here.")}</p>
            </div>
          )}
        </div>
      </section>

      <section className={styles.relationshipGuide}>
        <div><Link2 size={17} /><span><strong>{t("功能关联", "Related capabilities")}</strong><small>{t("根据标签、工具和用途推断", "Inferred from tags, tools, and purpose")}</small></span></div>
        <div><GitBranch size={17} /><span><strong>{t("必需依赖", "Declared dependencies")}</strong><small>{t("只来自结构化 Skill 元数据；正文引用计入功能关联", "Only structured Skill metadata; instruction references become related capabilities")}</small></span></div>
        <div><Copy size={17} /><span><strong>{t("直接调用", "Ready to invoke")}</strong><small>{t("在详情中复制双语 Prompt", "Copy a bilingual Prompt from the detail panel")}</small></span></div>
      </section>

      {promptSkill && (
        <PromptDialog
          skill={promptSkill}
          journeyStartedAt={promptJourneyStartedAt}
          onClose={() => setPromptSkill(null)}
        />
      )}
    </main>
  );
}

export function SkillGraphClient({ inventory }: { inventory: SkillInventorySummary }) {
  return (
    <ReactFlowProvider>
      <SkillGraphWorkspace inventory={inventory} />
    </ReactFlowProvider>
  );
}

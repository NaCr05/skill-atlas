import type { AiAssistResponse, TaskRecommendationResult } from "./ai/assist-contract";
import type { MarketplaceResponse, MarketplaceSkill } from "./marketplaces/adapter";

export const DISCOVERY_HISTORY_KEY = "skill-atlas:discovery-history:v1";

const MAX_HISTORY_ITEMS = 8;
const MAX_TASK_LENGTH = 1_000;
const MAX_MARKET_QUERY_LENGTH = 200;
const MAX_MARKET_RESULTS = 40;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type TaskDiscoveryMode = "local" | "ai";
export type MarketplaceSurface = "skillsmp" | "skills-sh";

export interface TaskDiscoveryHistoryEntry {
  query: string;
  mode: TaskDiscoveryMode;
  searchedAt: string;
  aiResponse?: AiAssistResponse<"task-recommendation">;
}

export interface MarketplaceDiscoveryHistoryEntry {
  provider: MarketplaceSurface;
  query: string;
  searchedAt: string;
  response: MarketplaceResponse;
}

export interface DiscoveryHistoryState {
  version: 1;
  taskDraft: string;
  marketplaceDraft: {
    provider: MarketplaceSurface;
    query: string;
  };
  taskEntries: TaskDiscoveryHistoryEntry[];
  marketplaceEntries: MarketplaceDiscoveryHistoryEntry[];
}

export function emptyDiscoveryHistory(): DiscoveryHistoryState {
  return {
    version: 1,
    taskDraft: "",
    marketplaceDraft: { provider: "skillsmp", query: "" },
    taskEntries: [],
    marketplaceEntries: [],
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedText(value: unknown, maximum: number, trim = true): string {
  if (typeof value !== "string") return "";
  const text = trim ? value.trim() : value;
  return text.slice(0, maximum);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeWebUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function optionalCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function normalizeTaskResult(value: unknown): TaskRecommendationResult | undefined {
  const result = recordValue(value);
  const summary = boundedText(result.summary, 1_200);
  const nextStep = boundedText(result.nextStep, 800);
  const recommendations = Array.isArray(result.recommendations)
    ? result.recommendations.flatMap((item) => {
      const recommendation = recordValue(item);
      const skillName = boundedText(recommendation.skillName, 80);
      const reason = boundedText(recommendation.reason, 800);
      const confidence = recommendation.confidence;
      if (!skillName || !reason || !["high", "medium", "low"].includes(String(confidence))) return [];
      return [{ skillName, reason, confidence: confidence as "high" | "medium" | "low" }];
    }).slice(0, 5)
    : [];
  if (!summary || !nextStep || !recommendations.length) return undefined;
  return { summary, recommendations, nextStep };
}

function normalizeTaskAiResponse(value: unknown): AiAssistResponse<"task-recommendation"> | undefined {
  const response = recordValue(value);
  const result = normalizeTaskResult(response.result);
  if (response.action !== "task-recommendation"
    || (response.provider !== "openai" && response.provider !== "deepseek")
    || !validDate(response.generatedAt)
    || !result) return undefined;
  return {
    action: "task-recommendation",
    provider: response.provider,
    generatedAt: response.generatedAt,
    result,
  };
}

function normalizeMarketplaceSkill(value: unknown): MarketplaceSkill | undefined {
  const skill = recordValue(value);
  const id = boundedText(skill.id, 240);
  const name = boundedText(skill.name, 160);
  const description = boundedText(skill.description, 2_000);
  const sourceLabel = boundedText(skill.sourceLabel, 80);
  const pageUrl = safeWebUrl(skill.pageUrl);
  if (!id || !name || !sourceLabel || !pageUrl) return undefined;
  const author = boundedText(skill.author, 160);
  return {
    id,
    name,
    description,
    sourceLabel,
    pageUrl,
    ...(author ? { author } : {}),
    ...(safeWebUrl(skill.sourceUrl) ? { sourceUrl: safeWebUrl(skill.sourceUrl) } : {}),
    ...(optionalCount(skill.installs) !== undefined ? { installs: optionalCount(skill.installs) } : {}),
    ...(optionalCount(skill.stars) !== undefined ? { stars: optionalCount(skill.stars) } : {}),
    ...(typeof skill.duplicate === "boolean" ? { duplicate: skill.duplicate } : {}),
  };
}

function normalizeMarketplaceResponse(value: unknown): MarketplaceResponse | undefined {
  const response = recordValue(value);
  const provider = response.provider === "skills.sh" ? "skills.sh" : response.provider === "skillsmp" ? "skillsmp" : undefined;
  const browseUrl = safeWebUrl(response.browseUrl);
  if (!provider || !browseUrl || typeof response.available !== "boolean") return undefined;
  const notice = boundedText(response.notice, 1_000);
  const fetchedAt = validDate(response.fetchedAt) ? response.fetchedAt : undefined;
  const results = Array.isArray(response.results)
    ? response.results.flatMap((item) => {
      const skill = normalizeMarketplaceSkill(item);
      return skill ? [skill] : [];
    }).slice(0, MAX_MARKET_RESULTS)
    : [];
  return {
    provider,
    available: response.available,
    results,
    browseUrl,
    ...(notice ? { notice } : {}),
    ...(fetchedAt ? { fetchedAt } : {}),
  };
}

function taskKey(entry: Pick<TaskDiscoveryHistoryEntry, "query" | "mode">): string {
  return `${entry.mode}:${entry.query.trim().replace(/\s+/g, " ").toLocaleLowerCase()}`;
}

function marketplaceKey(entry: Pick<MarketplaceDiscoveryHistoryEntry, "provider" | "query">): string {
  return `${entry.provider}:${entry.query.trim().replace(/\s+/g, " ").toLocaleLowerCase()}`;
}

export function normalizeDiscoveryHistory(value: unknown): DiscoveryHistoryState {
  if (!value || typeof value !== "object") return emptyDiscoveryHistory();
  const state = recordValue(value);
  const draft = recordValue(state.marketplaceDraft);
  const taskEntries = Array.isArray(state.taskEntries)
    ? state.taskEntries.flatMap((item) => {
      const entry = recordValue(item);
      const query = boundedText(entry.query, MAX_TASK_LENGTH);
      const mode = entry.mode === "ai" ? "ai" as const : entry.mode === "local" ? "local" as const : undefined;
      if (!query || !mode || !validDate(entry.searchedAt)) return [];
      const aiResponse = normalizeTaskAiResponse(entry.aiResponse);
      if (mode === "ai" && !aiResponse) return [];
      return [{ query, mode, searchedAt: entry.searchedAt, ...(aiResponse ? { aiResponse } : {}) }];
    })
    : [];
  const marketplaceEntries = Array.isArray(state.marketplaceEntries)
    ? state.marketplaceEntries.flatMap((item) => {
      const entry = recordValue(item);
      const provider = entry.provider === "skills-sh" ? "skills-sh" as const : entry.provider === "skillsmp" ? "skillsmp" as const : undefined;
      const query = boundedText(entry.query, MAX_MARKET_QUERY_LENGTH);
      const response = normalizeMarketplaceResponse(entry.response);
      if (!provider || !validDate(entry.searchedAt) || !response) return [];
      return [{ provider, query, searchedAt: entry.searchedAt, response }];
    })
    : [];
  return {
    version: 1,
    taskDraft: boundedText(state.taskDraft, MAX_TASK_LENGTH, false),
    marketplaceDraft: {
      provider: draft.provider === "skills-sh" ? "skills-sh" : "skillsmp",
      query: boundedText(draft.query, MAX_MARKET_QUERY_LENGTH, false),
    },
    taskEntries: [...new Map(taskEntries.map((entry) => [taskKey(entry), entry])).values()].slice(0, MAX_HISTORY_ITEMS),
    marketplaceEntries: [...new Map(marketplaceEntries.map((entry) => [marketplaceKey(entry), entry])).values()].slice(0, MAX_HISTORY_ITEMS),
  };
}

function defaultStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readDiscoveryHistory(storage: StorageLike | undefined = defaultStorage()): DiscoveryHistoryState {
  if (!storage) return emptyDiscoveryHistory();
  try {
    const raw = storage.getItem(DISCOVERY_HISTORY_KEY);
    return raw ? normalizeDiscoveryHistory(JSON.parse(raw)) : emptyDiscoveryHistory();
  } catch {
    return emptyDiscoveryHistory();
  }
}

export function writeDiscoveryHistory(
  state: DiscoveryHistoryState,
  storage: StorageLike | undefined = defaultStorage(),
): DiscoveryHistoryState {
  const normalized = normalizeDiscoveryHistory(state);
  try {
    storage?.setItem(DISCOVERY_HISTORY_KEY, JSON.stringify(normalized));
  } catch {
    // Storage failures must never block local discovery or marketplace search.
  }
  return normalized;
}

function updateDiscoveryHistory(
  updater: (state: DiscoveryHistoryState) => DiscoveryHistoryState,
  storage: StorageLike | undefined = defaultStorage(),
): DiscoveryHistoryState {
  return writeDiscoveryHistory(updater(readDiscoveryHistory(storage)), storage);
}

export function saveTaskDraft(value: string, storage: StorageLike | undefined = defaultStorage()): DiscoveryHistoryState {
  return updateDiscoveryHistory((state) => ({ ...state, taskDraft: value.slice(0, MAX_TASK_LENGTH) }), storage);
}

export function recordTaskDiscovery(
  entry: Omit<TaskDiscoveryHistoryEntry, "searchedAt">,
  storage: StorageLike | undefined = defaultStorage(),
): DiscoveryHistoryState {
  const query = entry.query.trim().slice(0, MAX_TASK_LENGTH);
  if (!query) return readDiscoveryHistory(storage);
  const nextEntry: TaskDiscoveryHistoryEntry = {
    query,
    mode: entry.mode,
    searchedAt: new Date().toISOString(),
    ...(entry.aiResponse ? { aiResponse: entry.aiResponse } : {}),
  };
  return updateDiscoveryHistory((state) => ({
    ...state,
    taskDraft: query,
    taskEntries: [nextEntry, ...state.taskEntries.filter((item) => taskKey(item) !== taskKey(nextEntry))],
  }), storage);
}

export function removeTaskDiscovery(
  entry: Pick<TaskDiscoveryHistoryEntry, "query" | "mode">,
  storage: StorageLike | undefined = defaultStorage(),
): DiscoveryHistoryState {
  return updateDiscoveryHistory((state) => ({
    ...state,
    taskEntries: state.taskEntries.filter((item) => taskKey(item) !== taskKey(entry)),
  }), storage);
}

export function clearTaskDiscovery(storage: StorageLike | undefined = defaultStorage()): DiscoveryHistoryState {
  return updateDiscoveryHistory((state) => ({ ...state, taskEntries: [] }), storage);
}

export function saveMarketplaceDraft(
  provider: MarketplaceSurface,
  query: string,
  storage: StorageLike | undefined = defaultStorage(),
): DiscoveryHistoryState {
  return updateDiscoveryHistory((state) => ({
    ...state,
    marketplaceDraft: { provider, query: query.slice(0, MAX_MARKET_QUERY_LENGTH) },
  }), storage);
}

export function recordMarketplaceDiscovery(
  entry: Omit<MarketplaceDiscoveryHistoryEntry, "searchedAt">,
  storage: StorageLike | undefined = defaultStorage(),
): DiscoveryHistoryState {
  const query = entry.query.trim().slice(0, MAX_MARKET_QUERY_LENGTH);
  const nextEntry: MarketplaceDiscoveryHistoryEntry = {
    provider: entry.provider,
    query,
    response: entry.response,
    searchedAt: new Date().toISOString(),
  };
  return updateDiscoveryHistory((state) => ({
    ...state,
    marketplaceDraft: {
      provider: entry.provider,
      query: entry.provider === "skillsmp" ? query : state.marketplaceDraft.query,
    },
    marketplaceEntries: [nextEntry, ...state.marketplaceEntries.filter((item) => marketplaceKey(item) !== marketplaceKey(nextEntry))],
  }), storage);
}

export function removeMarketplaceDiscovery(
  entry: Pick<MarketplaceDiscoveryHistoryEntry, "provider" | "query">,
  storage: StorageLike | undefined = defaultStorage(),
): DiscoveryHistoryState {
  return updateDiscoveryHistory((state) => ({
    ...state,
    marketplaceEntries: state.marketplaceEntries.filter((item) => marketplaceKey(item) !== marketplaceKey(entry)),
  }), storage);
}

export function clearMarketplaceDiscovery(storage: StorageLike | undefined = defaultStorage()): DiscoveryHistoryState {
  return updateDiscoveryHistory((state) => ({ ...state, marketplaceEntries: [] }), storage);
}

import type { Language } from "./i18n";
import {
  emptyPersonalLibrary,
  mergePersonalLibraries,
  normalizePersonalLibrary,
  type PersonalLibraryState,
} from "./personal-library";

export const LOCAL_WORKSPACE_KEY = "skill-atlas:workspace:v1";
export const LOCAL_WORKSPACE_EVENT = "skill-atlas:workspace-changed";

const MAX_RECENT_COPIES = 20;
const MAX_ANALYTICS_EVENTS = 100;
const MAX_NOTE_LENGTH = 4_000;
const MAX_QUERY_LENGTH = 160;

export interface RecentPromptCopy {
  skillId: string;
  skillName: string;
  displayName: string;
  copiedAt: string;
  elapsedMs?: number;
  language: Language;
}

export interface ZeroResultSearch {
  query: string;
  searchedAt: string;
  surface: "inventory" | "task-recommendation";
}

export interface CopyJourney {
  skillId: string;
  elapsedMs: number;
  copiedAt: string;
}

export interface LocalWorkspaceState {
  version: 1;
  favorites: string[];
  pinned: string[];
  notes: Record<string, string>;
  recentCopies: RecentPromptCopy[];
  analytics: {
    zeroResultSearches: ZeroResultSearch[];
    copyJourneys: CopyJourney[];
  };
  personalLibrary: PersonalLibraryState;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function emptyLocalWorkspace(): LocalWorkspaceState {
  return {
    version: 1,
    favorites: [],
    pinned: [],
    notes: {},
    recentCopies: [],
    analytics: { zeroResultSearches: [], copyJourneys: [] },
    personalLibrary: emptyPersonalLibrary(),
  };
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))];
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function normalizeLocalWorkspace(value: unknown): LocalWorkspaceState {
  if (!value || typeof value !== "object") return emptyLocalWorkspace();
  const record = value as Record<string, unknown>;
  const notesValue = record.notes && typeof record.notes === "object" ? record.notes as Record<string, unknown> : {};
  const analyticsValue = record.analytics && typeof record.analytics === "object" ? record.analytics as Record<string, unknown> : {};
  const notes = Object.fromEntries(Object.entries(notesValue)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([id, note]) => [id, note.slice(0, MAX_NOTE_LENGTH)]));
  const recentCopies = Array.isArray(record.recentCopies) ? record.recentCopies.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const copy = item as Record<string, unknown>;
    if (typeof copy.skillId !== "string" || typeof copy.skillName !== "string" || typeof copy.displayName !== "string" || !validDate(copy.copiedAt)) return [];
    return [{
      skillId: copy.skillId,
      skillName: copy.skillName,
      displayName: copy.displayName,
      copiedAt: copy.copiedAt,
      elapsedMs: typeof copy.elapsedMs === "number" && Number.isFinite(copy.elapsedMs) ? Math.max(0, copy.elapsedMs) : undefined,
      language: copy.language === "en" ? "en" as const : "zh" as const,
    }];
  }).slice(0, MAX_RECENT_COPIES) : [];
  const zeroResultSearches = Array.isArray(analyticsValue.zeroResultSearches) ? analyticsValue.zeroResultSearches.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Record<string, unknown>;
    if (typeof event.query !== "string" || !validDate(event.searchedAt)) return [];
    return [{
      query: event.query.slice(0, MAX_QUERY_LENGTH),
      searchedAt: event.searchedAt,
      surface: event.surface === "task-recommendation" ? "task-recommendation" as const : "inventory" as const,
    }];
  }).slice(0, MAX_ANALYTICS_EVENTS) : [];
  const copyJourneys = Array.isArray(analyticsValue.copyJourneys) ? analyticsValue.copyJourneys.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const event = item as Record<string, unknown>;
    if (typeof event.skillId !== "string" || typeof event.elapsedMs !== "number" || !Number.isFinite(event.elapsedMs) || !validDate(event.copiedAt)) return [];
    return [{ skillId: event.skillId, elapsedMs: Math.max(0, event.elapsedMs), copiedAt: event.copiedAt }];
  }).slice(0, MAX_ANALYTICS_EVENTS) : [];
  return {
    version: 1,
    favorites: strings(record.favorites),
    pinned: strings(record.pinned),
    notes,
    recentCopies,
    analytics: { zeroResultSearches, copyJourneys },
    personalLibrary: normalizePersonalLibrary(record.personalLibrary),
  };
}

function defaultStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readLocalWorkspace(storage: StorageLike | undefined = defaultStorage()): LocalWorkspaceState {
  if (!storage) return emptyLocalWorkspace();
  try {
    const raw = storage.getItem(LOCAL_WORKSPACE_KEY);
    return raw ? normalizeLocalWorkspace(JSON.parse(raw)) : emptyLocalWorkspace();
  } catch {
    return emptyLocalWorkspace();
  }
}

export function writeLocalWorkspace(state: LocalWorkspaceState, storage: StorageLike | undefined = defaultStorage()): LocalWorkspaceState {
  const normalized = normalizeLocalWorkspace(state);
  if (!storage) return normalized;
  try {
    storage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(normalized));
    if (typeof window !== "undefined" && storage === window.localStorage) window.dispatchEvent(new Event(LOCAL_WORKSPACE_EVENT));
  } catch {
    // Private browsing and storage quotas must not block the core Skill workflow.
  }
  return normalized;
}

export function updateLocalWorkspace(
  updater: (state: LocalWorkspaceState) => LocalWorkspaceState,
  storage: StorageLike | undefined = defaultStorage(),
): LocalWorkspaceState {
  return writeLocalWorkspace(updater(readLocalWorkspace(storage)), storage);
}

export function recordZeroResultSearch(
  query: string,
  surface: ZeroResultSearch["surface"],
  storage: StorageLike | undefined = defaultStorage(),
): LocalWorkspaceState {
  const cleanQuery = query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
  if (!cleanQuery) return readLocalWorkspace(storage);
  return updateLocalWorkspace((state) => {
    const latest = state.analytics.zeroResultSearches[0];
    if (latest && latest.query.toLocaleLowerCase() === cleanQuery.toLocaleLowerCase() && latest.surface === surface && Date.now() - Date.parse(latest.searchedAt) < 30_000) return state;
    return {
      ...state,
      analytics: {
        ...state.analytics,
        zeroResultSearches: [{ query: cleanQuery, surface, searchedAt: new Date().toISOString() }, ...state.analytics.zeroResultSearches].slice(0, MAX_ANALYTICS_EVENTS),
      },
    };
  }, storage);
}

export function recordPromptCopy(
  copy: Omit<RecentPromptCopy, "copiedAt" | "elapsedMs"> & { journeyStartedAt?: number; copiedAt?: string },
  storage: StorageLike | undefined = defaultStorage(),
): LocalWorkspaceState {
  const copiedAt = validDate(copy.copiedAt) ? copy.copiedAt : new Date().toISOString();
  const elapsedMs = copy.journeyStartedAt
    ? Math.min(30 * 60_000, Math.max(0, Date.now() - copy.journeyStartedAt))
    : undefined;
  return updateLocalWorkspace((state) => ({
    ...state,
    recentCopies: [
      { skillId: copy.skillId, skillName: copy.skillName, displayName: copy.displayName, language: copy.language, copiedAt, elapsedMs },
      ...state.recentCopies.filter((item) => item.skillId !== copy.skillId),
    ].slice(0, MAX_RECENT_COPIES),
    analytics: {
      ...state.analytics,
      copyJourneys: elapsedMs === undefined ? state.analytics.copyJourneys : [
        { skillId: copy.skillId, elapsedMs, copiedAt },
        ...state.analytics.copyJourneys,
      ].slice(0, MAX_ANALYTICS_EVENTS),
    },
  }), storage);
}

export function medianCopyJourneyMs(state: LocalWorkspaceState): number | undefined {
  const values = state.analytics.copyJourneys.map((item) => item.elapsedMs).sort((a, b) => a - b);
  if (!values.length) return undefined;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
}

export function mergeLocalWorkspaces(current: LocalWorkspaceState, imported: LocalWorkspaceState): LocalWorkspaceState {
  const left = normalizeLocalWorkspace(current);
  const right = normalizeLocalWorkspace(imported);
  return normalizeLocalWorkspace({
    ...left,
    favorites: [...left.favorites, ...right.favorites],
    pinned: [...left.pinned, ...right.pinned],
    notes: { ...left.notes, ...right.notes },
    recentCopies: [...right.recentCopies, ...left.recentCopies],
    analytics: {
      zeroResultSearches: [...right.analytics.zeroResultSearches, ...left.analytics.zeroResultSearches],
      copyJourneys: [...right.analytics.copyJourneys, ...left.analytics.copyJourneys],
    },
    personalLibrary: mergePersonalLibraries(left.personalLibrary, right.personalLibrary),
  });
}

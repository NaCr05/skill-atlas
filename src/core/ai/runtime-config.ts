import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { isPathInside, resolveCodexEnvironment } from "@/core/skills/paths";
import {
  resolveAiProviderConfig,
  type AiProvider,
  type AiProviderConfig,
  type AiProviderSelection,
} from "./provider-config";
import { protectSecret, unprotectSecret } from "./windows-dpapi";

const providerSelectionSchema = z.enum(["auto", "openai", "deepseek"]);
const providerDocumentSchema = z.object({
  encryptedApiKey: z.string().min(1).max(16_384).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
});
const storedDocumentSchema = z.object({
  version: z.literal(1),
  selection: providerSelectionSchema,
  providers: z.object({
    openai: providerDocumentSchema,
    deepseek: providerDocumentSchema,
  }),
  updatedAt: z.string().datetime(),
});

type StoredAiSettings = z.infer<typeof storedDocumentSchema>;
type StoredProviderSettings = StoredAiSettings["providers"][AiProvider];
export type AiSettingSource = "saved" | "environment" | "none";

export interface AiProviderSettingsSummary {
  apiKeyConfigured: boolean;
  apiKeySource: AiSettingSource;
  model: string;
  modelSource: AiSettingSource;
}

export interface AiSettingsSummary {
  selection: AiProviderSelection;
  requestedValue: string;
  provider?: AiProvider;
  configured: boolean;
  configuredProviders: AiProvider[];
  model?: string;
  missingVariables: string[];
  providers: Record<AiProvider, AiProviderSettingsSummary>;
  hasSavedSettings: boolean;
  updatedAt?: string;
  storagePath: string;
  storageIssue: boolean;
}

export interface AiSettingsUpdate {
  selection: Exclude<AiProviderSelection, "invalid">;
  providers: Record<AiProvider, {
    apiKey?: string;
    clearApiKey?: boolean;
    model?: string;
  }>;
}

export interface RuntimeAiConfigOptions {
  env?: Readonly<Partial<NodeJS.ProcessEnv>>;
  homeDirectory?: string;
  protect?: (value: string) => Promise<string>;
  unprotect?: (value: string) => Promise<string>;
}

interface StoredDocumentRead {
  document?: StoredAiSettings;
  issue: boolean;
}

let settingsWriteQueue = Promise.resolve();

function settingsLocation(options: RuntimeAiConfigOptions): string {
  const env = options.env || process.env;
  const environment = resolveCodexEnvironment(env, options.homeDirectory);
  const location = path.join(environment.codexHome, ".skill-atlas", "ai-settings.json");
  if (!isPathInside(environment.codexHome, location)) {
    throw new Error("AI settings path is outside CODEX_HOME.");
  }
  return location;
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

async function readStoredDocument(options: RuntimeAiConfigOptions): Promise<StoredDocumentRead> {
  try {
    const parsed = storedDocumentSchema.safeParse(JSON.parse(await readFile(settingsLocation(options), "utf8")));
    return parsed.success ? { document: parsed.data, issue: false } : { issue: true };
  } catch (error) {
    return isMissingFile(error) ? { issue: false } : { issue: true };
  }
}

function settingSource(
  storedValue: string | null | undefined,
  environmentValue: string | undefined,
): AiSettingSource {
  if (typeof storedValue === "string" && storedValue.length > 0) return "saved";
  if (storedValue === null) return "none";
  return environmentValue?.trim() ? "environment" : "none";
}

async function effectiveEnvironment(
  stored: StoredDocumentRead,
  options: RuntimeAiConfigOptions,
): Promise<{ env: Record<string, string | undefined>; issue: boolean }> {
  const sourceEnv = options.env || process.env;
  const env: Record<string, string | undefined> = { ...sourceEnv };
  let issue = stored.issue;
  if (!stored.document) return { env, issue };

  env.AI_PROVIDER = stored.document.selection;
  const decrypt = options.unprotect || unprotectSecret;
  for (const provider of ["openai", "deepseek"] as const) {
    const keyName = provider === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY";
    const modelName = provider === "openai" ? "OPENAI_MODEL" : "DEEPSEEK_MODEL";
    const providerSettings = stored.document.providers[provider];
    if (providerSettings.encryptedApiKey === null) {
      env[keyName] = "";
    } else if (providerSettings.encryptedApiKey) {
      try {
        env[keyName] = await decrypt(providerSettings.encryptedApiKey);
      } catch {
        env[keyName] = "";
        issue = true;
      }
    }
    if (providerSettings.model === null) env[modelName] = "";
    else if (providerSettings.model !== undefined) env[modelName] = providerSettings.model;
  }
  return { env, issue };
}

function providerSummary(
  provider: AiProvider,
  stored: StoredDocumentRead,
  env: Readonly<Record<string, string | undefined>>,
): AiProviderSettingsSummary {
  const keyName = provider === "openai" ? "OPENAI_API_KEY" : "DEEPSEEK_API_KEY";
  const modelName = provider === "openai" ? "OPENAI_MODEL" : "DEEPSEEK_MODEL";
  const providerSettings = stored.document?.providers[provider];
  const apiKeySource = settingSource(providerSettings?.encryptedApiKey, env[keyName]);
  const modelSource = settingSource(providerSettings?.model, env[modelName]);
  return {
    apiKeyConfigured: Boolean(env[keyName]?.trim()),
    apiKeySource,
    model: env[modelName]?.trim() || "",
    modelSource,
  };
}

export async function loadRuntimeAiSettings(
  options: RuntimeAiConfigOptions = {},
): Promise<{ config: AiProviderConfig; summary: AiSettingsSummary }> {
  const stored = await readStoredDocument(options);
  const effective = await effectiveEnvironment(stored, options);
  const config = resolveAiProviderConfig(effective.env);
  return {
    config,
    summary: {
      selection: config.selection,
      requestedValue: config.requestedValue,
      provider: config.provider,
      configured: config.configured,
      configuredProviders: config.configuredProviders,
      model: config.model,
      missingVariables: config.missingVariables,
      providers: {
        openai: providerSummary("openai", stored, effective.env),
        deepseek: providerSummary("deepseek", stored, effective.env),
      },
      hasSavedSettings: Boolean(stored.document),
      updatedAt: stored.document?.updatedAt,
      storagePath: settingsLocation(options),
      storageIssue: effective.issue,
    },
  };
}

function emptyDocument(selection: StoredAiSettings["selection"]): StoredAiSettings {
  return {
    version: 1,
    selection,
    providers: { openai: {}, deepseek: {} },
    updatedAt: new Date().toISOString(),
  };
}

async function updateProviderDocument(
  existing: StoredProviderSettings,
  update: AiSettingsUpdate["providers"][AiProvider],
  protect: (value: string) => Promise<string>,
): Promise<StoredProviderSettings> {
  const next: StoredProviderSettings = { ...existing };
  if (update.clearApiKey) next.encryptedApiKey = null;
  else if (update.apiKey?.trim()) next.encryptedApiKey = await protect(update.apiKey.trim());
  if (update.model !== undefined) next.model = update.model.trim() || null;
  return next;
}

async function writeStoredDocument(document: StoredAiSettings, options: RuntimeAiConfigOptions): Promise<void> {
  const location = settingsLocation(options);
  const directory = path.dirname(location);
  const temporary = `${location}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, location);
    await chmod(location, 0o600).catch(() => undefined);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function saveRuntimeAiSettings(
  update: AiSettingsUpdate,
  options: RuntimeAiConfigOptions = {},
): Promise<AiSettingsSummary> {
  let summary: AiSettingsSummary | undefined;
  settingsWriteQueue = settingsWriteQueue.catch(() => undefined).then(async () => {
    const stored = await readStoredDocument(options);
    const current = stored.document || emptyDocument(update.selection);
    const encrypt = options.protect || protectSecret;
    const document: StoredAiSettings = {
      ...current,
      selection: update.selection,
      providers: {
        openai: await updateProviderDocument(current.providers.openai, update.providers.openai, encrypt),
        deepseek: await updateProviderDocument(current.providers.deepseek, update.providers.deepseek, encrypt),
      },
      updatedAt: new Date().toISOString(),
    };
    await writeStoredDocument(document, options);
    summary = (await loadRuntimeAiSettings(options)).summary;
  });
  await settingsWriteQueue;
  if (!summary) throw new Error("AI settings were not saved.");
  return summary;
}

export async function clearRuntimeAiSettings(
  options: RuntimeAiConfigOptions = {},
): Promise<AiSettingsSummary> {
  let summary: AiSettingsSummary | undefined;
  settingsWriteQueue = settingsWriteQueue.catch(() => undefined).then(async () => {
    await unlink(settingsLocation(options)).catch((error) => {
      if (!isMissingFile(error)) throw error;
    });
    summary = (await loadRuntimeAiSettings(options)).summary;
  });
  await settingsWriteQueue;
  if (!summary) throw new Error("AI settings were not cleared.");
  return summary;
}

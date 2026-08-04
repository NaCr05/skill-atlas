import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearRuntimeAiSettings,
  loadRuntimeAiSettings,
  saveRuntimeAiSettings,
  type RuntimeAiConfigOptions,
} from "@/core/ai/runtime-config";

describe("runtime AI settings", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function fixture(env: Record<string, string> = {}): Promise<RuntimeAiConfigOptions> {
    const codexHome = await mkdtemp(path.join(os.tmpdir(), "skill-atlas-ai-"));
    temporaryDirectories.push(codexHome);
    return {
      env: { ...env, CODEX_HOME: codexHome },
      protect: async (value) => Buffer.from(value, "utf8").toString("base64"),
      unprotect: async (value) => Buffer.from(value, "base64").toString("utf8"),
    };
  }

  it("persists a selected provider without exposing the API key in its summary", async () => {
    const options = await fixture();
    const summary = await saveRuntimeAiSettings({
      selection: "deepseek",
      providers: {
        openai: { model: "" },
        deepseek: { apiKey: "deepseek-test-secret", model: "deepseek-v4-flash" },
      },
    }, options);

    expect(summary).toMatchObject({
      provider: "deepseek",
      configured: true,
      hasSavedSettings: true,
      providers: {
        deepseek: { apiKeyConfigured: true, apiKeySource: "saved", model: "deepseek-v4-flash" },
      },
    });
    expect(JSON.stringify(summary)).not.toContain("deepseek-test-secret");

    const stored = await readFile(summary.storagePath, "utf8");
    expect(stored).not.toContain("deepseek-test-secret");
    expect((await loadRuntimeAiSettings(options)).config.apiKey).toBe("deepseek-test-secret");
  });

  it("preserves an existing key when the form leaves it blank and can explicitly clear it", async () => {
    const options = await fixture();
    const initialUpdate = {
      selection: "deepseek" as const,
      providers: {
        openai: { model: "" },
        deepseek: { apiKey: "keep-this-key", model: "deepseek-v4-flash" },
      },
    };
    await saveRuntimeAiSettings(initialUpdate, options);

    await saveRuntimeAiSettings({
      selection: "deepseek",
      providers: { openai: {}, deepseek: { model: "deepseek-v4-pro" } },
    }, options);
    expect((await loadRuntimeAiSettings(options)).config).toMatchObject({
      apiKey: "keep-this-key",
      model: "deepseek-v4-pro",
      configured: true,
    });

    const cleared = await saveRuntimeAiSettings({
      selection: "deepseek",
      providers: { openai: {}, deepseek: { clearApiKey: true } },
    }, options);
    expect(cleared.configured).toBe(false);
    expect(cleared.providers.deepseek.apiKeySource).toBe("none");
  });

  it("restores environment-variable configuration after clearing page settings", async () => {
    const options = await fixture({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "environment-key",
      OPENAI_MODEL: "environment-model",
    });
    await saveRuntimeAiSettings({
      selection: "deepseek",
      providers: {
        openai: {},
        deepseek: { apiKey: "saved-key", model: "deepseek-v4-flash" },
      },
    }, options);

    const restored = await clearRuntimeAiSettings(options);
    expect(restored).toMatchObject({
      provider: "openai",
      configured: true,
      hasSavedSettings: false,
      providers: { openai: { apiKeySource: "environment" } },
    });
  });
});

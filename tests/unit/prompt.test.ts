import { describe, expect, it, vi } from "vitest";

import { resolveAiProviderConfig } from "@/core/ai/provider-config";
import { createInvocationPrompt, enhanceInvocationPrompt } from "@/core/skills/prompt";

describe("Prompt generation", () => {
  const skill = {
    name: "frontend-design",
    description: "Creates distinctive interface designs.",
    defaultPrompt: "$frontend-design\n\nBuild a considered UI.",
  };

  it("uses the author-provided default when no task is supplied", () => {
    expect(createInvocationPrompt(skill, undefined, "en").source).toBe("skill-default");
  });

  it("uses a fully Chinese deterministic template in Chinese mode", () => {
    const result = createInvocationPrompt(skill, undefined, "zh");
    expect(result.source).toBe("dashboard-template");
    expect(result.prompt).toContain("任务目标：");
    expect(result.prompt).toContain("执行要求：");
    expect(result.prompt).not.toContain("Build a considered UI");
  });

  it("always preserves the explicit skill trigger in deterministic prompts", () => {
    const result = createInvocationPrompt(skill, "重构这个仪表盘");
    expect(result.prompt).toContain("$frontend-design");
    expect(result.prompt).toContain("重构这个仪表盘");
  });

  it("falls back safely when AI is not configured", async () => {
    const base = createInvocationPrompt(skill, "Review the page");
    const fetcher = vi.fn();
    const result = await enhanceInvocationPrompt(base, skill, fetcher, {});
    expect(result.prompt).toBe(base.prompt);
    expect(result.notice).toContain("未配置");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("selects a complete provider deterministically", () => {
    expect(resolveAiProviderConfig({
      OPENAI_API_KEY: "openai-key",
      OPENAI_MODEL: "openai-model",
      DEEPSEEK_API_KEY: "deepseek-key",
      DEEPSEEK_MODEL: "deepseek-model",
    })).toMatchObject({ provider: "openai", selection: "auto", configured: true });

    expect(resolveAiProviderConfig({
      DEEPSEEK_API_KEY: "deepseek-key",
      DEEPSEEK_MODEL: "deepseek-model",
    })).toMatchObject({ provider: "deepseek", selection: "auto", configured: true });

    expect(resolveAiProviderConfig({
      AI_PROVIDER: "deepseek",
      OPENAI_API_KEY: "openai-key",
      OPENAI_MODEL: "openai-model",
      DEEPSEEK_API_KEY: "deepseek-key",
      DEEPSEEK_MODEL: "deepseek-model",
    })).toMatchObject({
      provider: "deepseek",
      selection: "deepseek",
      configured: true,
      configuredProviders: ["openai", "deepseek"],
    });
  });

  it("aggregates output_text items instead of assuming the first output is a message", async () => {
    const base = createInvocationPrompt(skill, "Review the page");
    const mockFetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json({
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", content: [{ type: "output_text", text: "$frontend-design\n\nReview the page with a clear visual direction." }] },
        ],
      });
    });
    const fetcher = mockFetch as unknown as typeof fetch;
    const result = await enhanceInvocationPrompt(base, skill, fetcher, {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
    }, "en");
    expect(result.source).toBe("ai-enhanced");
    expect(result.provider).toBe("openai");
    expect(result.prompt).toContain("$frontend-design");
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const request = mockFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "test-model",
      instructions: expect.any(String),
      input: expect.any(String),
    });
  });

  it("uses DeepSeek Chat Completions when DeepSeek is selected", async () => {
    const base = createInvocationPrompt(skill, "检查这个页面", "zh");
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({
        choices: [{ message: { content: "$frontend-design\n\n请检查这个页面，并给出清晰的视觉方向。" } }],
      });
    });
    const result = await enhanceInvocationPrompt(base, skill, mockFetch as unknown as typeof fetch, {
      AI_PROVIDER: "deepseek",
      OPENAI_API_KEY: "unused-openai-key",
      OPENAI_MODEL: "unused-openai-model",
      DEEPSEEK_API_KEY: "deepseek-key",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
    }, "zh");

    expect(result).toMatchObject({ source: "ai-enhanced", provider: "deepseek" });
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");
    const request = mockFetch.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: "Bearer deepseek-key" });
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
      max_tokens: 500,
      stream: false,
      messages: [
        { role: "system", content: expect.any(String) },
        { role: "user", content: expect.stringContaining(base.prompt) },
      ],
    });
  });

  it("falls back to the local Prompt when DeepSeek fails", async () => {
    const base = createInvocationPrompt(skill, "检查这个页面", "zh");
    const networkFailure = vi.fn(async () => {
      throw new Error("sensitive provider error");
    }) as unknown as typeof fetch;
    const env = {
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "deepseek-key",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
    };

    const failed = await enhanceInvocationPrompt(base, skill, networkFailure, env, "zh");
    expect(failed).toMatchObject({ prompt: base.prompt, source: "dashboard-template" });
    expect(failed.notice).toContain("DeepSeek 增强请求失败");
    expect(failed.notice).not.toContain("sensitive provider error");

    const httpFailure = vi.fn(async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    const unavailable = await enhanceInvocationPrompt(base, skill, httpFailure, env, "zh");
    expect(unavailable.prompt).toBe(base.prompt);
    expect(unavailable.notice).toContain("DeepSeek 增强暂不可用（HTTP 429）");
  });

  it("does not silently fail over to another provider", async () => {
    const base = createInvocationPrompt(skill, "检查这个页面", "zh");
    const mockFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response("", { status: 503 });
    });
    const result = await enhanceInvocationPrompt(base, skill, mockFetch as unknown as typeof fetch, {
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "deepseek-key",
      DEEPSEEK_MODEL: "deepseek-v4-flash",
      OPENAI_API_KEY: "openai-key",
      OPENAI_MODEL: "openai-model",
    }, "zh");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.deepseek.com/chat/completions");
    expect(result.prompt).toBe(base.prompt);
  });

  it("reports incomplete and invalid provider configuration without making a request", async () => {
    const base = createInvocationPrompt(skill, "检查这个页面", "zh");
    const fetcher = vi.fn();
    const incomplete = await enhanceInvocationPrompt(base, skill, fetcher, {
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "deepseek-key",
    }, "zh");
    expect(incomplete.notice).toContain("缺少 DEEPSEEK_MODEL");

    const invalid = await enhanceInvocationPrompt(base, skill, fetcher, {
      AI_PROVIDER: "another-provider",
    }, "zh");
    expect(invalid.notice).toContain("AI_PROVIDER=another-provider 无效");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an English AI result when Chinese output was requested", async () => {
    const base = createInvocationPrompt(skill, "检查这个页面", "zh");
    const fetcher = vi.fn(async () => Response.json({
      output_text: "$frontend-design\n\nReview the page in English.",
    })) as unknown as typeof fetch;
    const result = await enhanceInvocationPrompt(base, skill, fetcher, {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
    }, "zh");
    expect(result.source).toBe("dashboard-template");
    expect(result.prompt).toBe(base.prompt);
    expect(result.notice).toContain("不符合调用约束");
  });
});

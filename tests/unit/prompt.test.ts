import { describe, expect, it, vi } from "vitest";

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
    expect(result.prompt).toContain("$frontend-design");
    const request = mockFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      model: "test-model",
      instructions: expect.any(String),
      input: expect.any(String),
    });
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

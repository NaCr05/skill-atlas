import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/settings/ai/route";

describe("AI settings route", () => {
  it("returns a stable localized validation error without echoing submitted fields", async () => {
    const request = new Request("http://127.0.0.1/api/settings/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "127.0.0.1",
        "X-Skill-Atlas-Language": "en",
      },
      body: JSON.stringify({ selection: "unsupported", providers: { openai: {}, deepseek: { apiKey: "must-not-echo" } } }),
    });

    const response = await POST(request);
    const payload = await response.json() as { code: string; error: string };

    expect(response.status).toBe(400);
    expect(payload.code).toBe("AI_SETTINGS_INVALID");
    expect(payload.error).toMatch(/invalid/i);
    expect(JSON.stringify(payload)).not.toContain("must-not-echo");
  });
});

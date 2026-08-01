import { z } from "zod";

import { assertLocalMutationRequest } from "@/core/security/local-request";
import { findSkillById } from "@/core/skills/discover";
import { createInvocationPrompt, enhanceInvocationPrompt } from "@/core/skills/prompt";

export const runtime = "nodejs";

const inputSchema = z.object({
  skillId: z.string().min(1).max(80),
  task: z.string().max(4_000).optional(),
  enhanceWithAi: z.boolean().default(false),
  language: z.enum(["zh", "en"]).default("zh"),
});

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = inputSchema.parse(await request.json());
    const skill = await findSkillById(input.skillId);
    if (!skill) return Response.json({ error: input.language === "zh" ? "未找到该技能。" : "Skill not found." }, { status: 404 });
    const base = createInvocationPrompt(skill, input.task, input.language);
    const result = input.enhanceWithAi
      ? await enhanceInvocationPrompt(base, skill, fetch, process.env, input.language)
      : base;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "提示词生成失败。";
    return Response.json({ error: message }, { status: 400 });
  }
}

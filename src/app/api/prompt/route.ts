import { z } from "zod";

import { apiErrorResponse, localizedErrorMessage } from "@/core/errors/skill-atlas-error";
import { loadRuntimeAiSettings } from "@/core/ai/runtime-config";
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
    if (!skill) return Response.json({ code: "SKILL_NOT_FOUND", error: localizedErrorMessage("SKILL_NOT_FOUND", input.language) }, { status: 404 });
    const base = createInvocationPrompt(skill, input.task, input.language);
    let result = base;
    if (input.enhanceWithAi) {
      const { config } = await loadRuntimeAiSettings();
      result = await enhanceInvocationPrompt(base, skill, fetch, process.env, input.language, config);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "PROMPT_FAILED");
  }
}

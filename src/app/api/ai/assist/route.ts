import { z } from "zod";

import { AiAssistError, runAiAssist } from "@/core/ai/assist";
import { aiAssistInputSchema } from "@/core/ai/assist-contract";
import { loadRuntimeAiSettings } from "@/core/ai/runtime-config";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { discoverSkills } from "@/core/skills/discover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = aiAssistInputSchema.parse(await request.json());
    const [{ config }, inventory] = await Promise.all([
      loadRuntimeAiSettings(),
      input.action === "installation-explanation" || input.action === "update-summary"
        ? Promise.resolve({ skills: [] })
        : discoverSkills(),
    ]);
    return json(await runAiAssist(input, inventory.skills, config));
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "AI_INPUT_INVALID" }, 400);
    if (error instanceof AiAssistError) {
      const status = error.code === "AI_NOT_CONFIGURED" ? 409
        : error.code === "AI_INPUT_INVALID" ? 400
          : 502;
      return json({ error: error.code }, status);
    }
    return json({ error: "AI_PROVIDER_FAILED" }, 502);
  }
}

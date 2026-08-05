import { z } from "zod";

import {
  clearRuntimeAiSettings,
  loadRuntimeAiSettings,
  saveRuntimeAiSettings,
} from "@/core/ai/runtime-config";
import { apiErrorResponse, SkillAtlasError } from "@/core/errors/skill-atlas-error";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const providerUpdateSchema = z.object({
  apiKey: z.string().trim().min(1).max(2_048).optional(),
  clearApiKey: z.boolean().optional(),
  model: z.string().trim().max(120).refine((value) => !/[\r\n\0]/.test(value)).optional(),
}).refine((value) => !(value.apiKey && value.clearApiKey), {
  message: "Cannot save and clear the same API key.",
});

const updateSchema = z.object({
  selection: z.enum(["auto", "openai", "deepseek"]),
  providers: z.object({
    openai: providerUpdateSchema,
    deepseek: providerUpdateSchema,
  }),
});

function json(data: unknown): Response {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return json(await loadRuntimeAiSettings().then((result) => result.summary));
  } catch (error) {
    return apiErrorResponse(request, error, "AI_SETTINGS_UNAVAILABLE", 400);
  }
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const update = updateSchema.parse(await request.json());
    return json(await saveRuntimeAiSettings(update));
  } catch (error) {
    const safeError = error instanceof z.ZodError ? new SkillAtlasError("AI_SETTINGS_INVALID", { cause: error }) : error;
    console.error("[ai-settings] save failed", safeError instanceof SkillAtlasError ? safeError.code : "AI_SETTINGS_SAVE_FAILED");
    return apiErrorResponse(request, safeError, "AI_SETTINGS_SAVE_FAILED", error instanceof z.ZodError ? 400 : 500);
  }
}

export async function DELETE(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return json(await clearRuntimeAiSettings());
  } catch (error) {
    return apiErrorResponse(request, error, "AI_SETTINGS_CLEAR_FAILED", 500);
  }
}

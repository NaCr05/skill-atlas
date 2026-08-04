import { z } from "zod";

import {
  clearRuntimeAiSettings,
  loadRuntimeAiSettings,
  saveRuntimeAiSettings,
} from "@/core/ai/runtime-config";
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

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return json(await loadRuntimeAiSettings().then((result) => result.summary));
  } catch {
    return json({ error: "AI_SETTINGS_UNAVAILABLE" }, 400);
  }
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const update = updateSchema.parse(await request.json());
    return json(await saveRuntimeAiSettings(update));
  } catch (error) {
    return json({ error: error instanceof z.ZodError ? "AI_SETTINGS_INVALID" : "AI_SETTINGS_SAVE_FAILED" }, error instanceof z.ZodError ? 400 : 500);
  }
}

export async function DELETE(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return json(await clearRuntimeAiSettings());
  } catch {
    return json({ error: "AI_SETTINGS_CLEAR_FAILED" }, 500);
  }
}

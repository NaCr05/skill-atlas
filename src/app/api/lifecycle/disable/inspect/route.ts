import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectSkillDisable } from "@/core/lifecycle/skill-state";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
const inputSchema = z.object({ skillId: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return Response.json(await inspectSkillDisable(inputSchema.parse(await request.json())), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "DISABLE_INSPECTION_FAILED");
  }
}

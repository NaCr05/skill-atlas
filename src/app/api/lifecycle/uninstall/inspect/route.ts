import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectSkillRemoval } from "@/core/lifecycle/skill-trash";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";

const inputSchema = z.object({ skillId: z.string().trim().min(1).max(80) });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = inputSchema.parse(await request.json());
    const review = await inspectSkillRemoval(input);
    return Response.json(review, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "REMOVAL_INSPECTION_FAILED");
  }
}

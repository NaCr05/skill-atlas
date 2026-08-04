import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectSkillUpdate } from "@/core/lifecycle/inspect-update";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  skillId: z.string().regex(/^[a-f0-9]{18}$/),
  sourceUrl: z.string().url().max(2_048).optional(),
});

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = inputSchema.parse(await request.json());
    const preview = await inspectSkillUpdate(input);
    return Response.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "UPDATE_INSPECTION_FAILED");
  }
}

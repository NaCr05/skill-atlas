import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectGithubSkill } from "@/core/installer/inspect-source";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";

const inputSchema = z.object({
  sourceUrl: z.string().url().max(2_048),
  skillName: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = inputSchema.parse(await request.json());
    const review = await inspectGithubSkill(input);
    return Response.json(review, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "INSTALL_INSPECTION_FAILED");
  }
}

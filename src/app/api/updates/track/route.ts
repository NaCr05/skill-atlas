import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { confirmSourceTracking } from "@/core/lifecycle/inspect-update";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";

const inputSchema = z.object({ previewId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { previewId } = inputSchema.parse(await request.json());
    const tracked = await confirmSourceTracking(previewId);
    return Response.json(tracked, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "UPDATE_TRACKING_FAILED");
  }
}

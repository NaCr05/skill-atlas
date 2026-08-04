import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { confirmPermanentDeletion } from "@/core/lifecycle/skill-trash";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { runRecordedOperation } from "@/core/operations/operation-log";

export const runtime = "nodejs";

const inputSchema = z.object({
  planId: z.uuid(),
  confirmationText: z.string().min(1).max(160),
});

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = inputSchema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "purge", target: input.planId, recoveryHref: "/trash", work: () => confirmPermanentDeletion(input), describe: (value) => `${value.skillName} permanently deleted` });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "PURGE_FAILED");
  }
}

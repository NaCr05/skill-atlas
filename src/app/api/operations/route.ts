import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { listOperations } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return Response.json({ records: await listOperations() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "OPERATION_READ_FAILED");
  }
}

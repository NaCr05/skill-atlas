import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectAllTrackedUpdates, readBatchUpdateOverview } from "@/core/lifecycle/update-batch";
import { runRecordedOperation } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return Response.json(await readBatchUpdateOverview(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "BATCH_UPDATE_FAILED"); }
}

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const result = await runRecordedOperation({ kind: "batch-update-check", target: "all-tracked-skills", recoveryHref: "/operations", work: () => inspectAllTrackedUpdates(), describe: (value) => `${value.trackedCount} checked; ${value.updateCount} updates` });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "BATCH_UPDATE_FAILED"); }
}

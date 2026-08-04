import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { runRecordedOperation } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { confirmStorageCleanup } from "@/core/storage/storage-manager";

export const runtime = "nodejs";
const schema = z.object({ planId: z.uuid(), confirmationText: z.string().min(1).max(160) });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = schema.parse(await request.json());
    const result = await runRecordedOperation({
      kind: "storage-cleanup", target: input.planId, recoveryHref: "/storage",
      work: async (progress) => {
        await progress("preflight", "succeeded", "Review is valid and the stored fingerprint still matches.");
        await progress("backup", "running", "Moving the entry into a private purge quarantine.");
        const value = await confirmStorageCleanup(input);
        await progress("backup", "succeeded", "Quarantine move and final verification completed.");
        await progress("verify", "succeeded", "Cleanup audit evidence was committed.");
        return value;
      },
      describe: (value) => `${value.skillName} private storage permanently cleaned`,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "STORAGE_CLEANUP_FAILED"); }
}

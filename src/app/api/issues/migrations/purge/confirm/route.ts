import { z } from "zod";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { confirmMigrationArchivePurge } from "@/core/issues/migration-archive";
import { runRecordedOperation } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
const schema = z.object({ planId: z.uuid(), confirmationText: z.string().max(160) });
export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const input = schema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "migration-purge", target: input.planId, recoveryHref: "/operations", work: () => confirmMigrationArchivePurge(input), describe: (value) => `${value.skillName} migration archive permanently removed` });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "MIGRATION_ARCHIVE_PURGE_FAILED"); }
}

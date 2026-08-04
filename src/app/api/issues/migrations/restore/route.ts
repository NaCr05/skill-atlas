import { z } from "zod";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { restoreMigrationArchive } from "@/core/issues/migration-archive";
import { runRecordedOperation } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";

export const runtime = "nodejs";
const schema = z.object({ migrationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/) });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { migrationId } = schema.parse(await request.json());
    const result = await runRecordedOperation({ kind: "migration-restore", target: migrationId, recoveryHref: "/operations", work: () => restoreMigrationArchive(migrationId), describe: (value) => `${value.skillName} compatibility entry restored` });
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "MIGRATION_ARCHIVE_RESTORE_FAILED"); }
}

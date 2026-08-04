import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { listMigrationArchives } from "@/core/issues/migration-archive";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return Response.json(await listMigrationArchives(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "MIGRATION_ARCHIVE_READ_FAILED"); }
}

import { z } from "zod";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectMigrationArchivePurge } from "@/core/issues/migration-archive";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
const schema = z.object({ migrationId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/) });
export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    return Response.json(await inspectMigrationArchivePurge(schema.parse(await request.json()).migrationId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "MIGRATION_ARCHIVE_PURGE_INSPECTION_FAILED"); }
}

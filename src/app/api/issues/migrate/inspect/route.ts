import { z } from "zod";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { inspectDuplicateMigration } from "@/core/issues/duplicate-migration";
import { assertLocalMutationRequest } from "@/core/security/local-request";
export const runtime = "nodejs";
const schema = z.object({ skillId: z.string().regex(/^[a-f0-9]{18}$/) });
export async function POST(request: Request) {
  try { assertLocalMutationRequest(request); return Response.json(await inspectDuplicateMigration(schema.parse(await request.json())), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(request, error, "DUPLICATE_MIGRATION_INSPECTION_FAILED"); }
}

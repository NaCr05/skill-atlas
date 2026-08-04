import { z } from "zod";

import { inspectPortableImport } from "@/core/data-portability";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
const schema = z.object({ server: z.unknown() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 5 * 1024 * 1024) throw new Error("Import file is too large.");
    return Response.json(inspectPortableImport(schema.parse(await request.json()).server), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "DATA_IMPORT_FAILED"); }
}

import { z } from "zod";

import { confirmPortableImport } from "@/core/data-portability";
import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { runRecordedOperation } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
const schema = z.object({ planId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { planId } = schema.parse(await request.json());
    const result = await runRecordedOperation({
      kind: "data-import", target: planId, recoveryHref: "/settings",
      work: async (progress) => {
        await progress("preflight", "succeeded", "Import schema and bounded record counts were validated.");
        await progress("backup", "running", "Saving a private snapshot of current server data.");
        const value = await confirmPortableImport(planId);
        await progress("backup", "succeeded", `Previous data saved to ${value.backupDirectory}`);
        await progress("replace", "succeeded", "Imported data was merged without deleting existing records.");
        await progress("verify", "succeeded", "Imported settings were normalized and persisted.");
        return value;
      },
      describe: (value) => `Local Skill Atlas data imported; backup at ${value.backupDirectory}`,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(request, error, "DATA_IMPORT_FAILED"); }
}

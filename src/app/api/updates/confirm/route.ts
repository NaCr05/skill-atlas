import { z } from "zod";

import { apiErrorResponse } from "@/core/errors/skill-atlas-error";
import { confirmSkillUpdate } from "@/core/lifecycle/apply-update";
import { assertLocalMutationRequest } from "@/core/security/local-request";
import { invalidateSkillInventoryCache } from "@/core/skills/discover";
import { runRecordedOperation } from "@/core/operations/operation-log";
import { markBatchUpdateApplied } from "@/core/lifecycle/update-batch";

export const runtime = "nodejs";

const inputSchema = z.object({ previewId: z.uuid() });

export async function POST(request: Request) {
  try {
    assertLocalMutationRequest(request);
    const { previewId } = inputSchema.parse(await request.json());
    const result = await runRecordedOperation({
      kind: "update",
      target: previewId,
      recoveryHref: "/trash",
      work: async (progress) => {
        await progress("preflight", "succeeded", "The review plan and local fingerprint are valid.");
        await progress("download", "running", "Downloading into an isolated staging directory.");
        const updated = await confirmSkillUpdate(previewId, {
          checkpoint: async (checkpoint) => {
            if (checkpoint === "staged") {
              await progress("download", "succeeded", "Download and staged fingerprint verification completed.");
              await progress("backup", "running", "Moving the current Skill into a private backup directory.");
            } else if (checkpoint === "backed-up") {
              await progress("backup", "succeeded", "The previous version was backed up and verified.");
              await progress("replace", "running", "Replacing the active directory atomically.");
            } else if (checkpoint === "installed") {
              await progress("replace", "succeeded", "The staged Skill became the active version.");
              await progress("verify", "running", "Verifying the installed fingerprint and source lock.");
            } else if (checkpoint === "rollback-started") {
              await progress("rollback", "running", "Update failed; restoring the verified backup.");
            } else if (checkpoint === "rollback-succeeded") {
              await progress("rollback", "succeeded", "The previous Skill version was restored.");
            } else if (checkpoint === "rollback-failed") {
              await progress("rollback", "failed", "Automatic rollback needs recovery-center attention.");
            }
          },
        });
        await progress("verify", "succeeded", "Installed fingerprint and source registry are consistent.");
        return updated;
      },
      describe: (value) => `${value.skillName} updated to ${value.revision.slice(0, 12)}`,
    });
    // The update transaction is authoritative; an advisory cache-write failure must not
    // turn an already-committed filesystem update into a false API failure.
    await markBatchUpdateApplied(result.skillId, result.revision).catch(() => undefined);
    invalidateSkillInventoryCache();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(request, error, "UPDATE_APPLY_FAILED");
  }
}

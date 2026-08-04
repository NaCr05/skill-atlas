import { findSkillById } from "@/core/skills/discover";
import { localizedErrorMessage, requestLanguage } from "@/core/errors/skill-atlas-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ skillId: string }> },
) {
  const { skillId } = await context.params;
  const skill = await findSkillById(skillId);
  if (!skill) {
    return Response.json(
      { code: "SKILL_NOT_FOUND", error: localizedErrorMessage("SKILL_NOT_FOUND", requestLanguage(request)) },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(skill, { headers: { "Cache-Control": "no-store" } });
}

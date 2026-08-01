import { type NextRequest } from "next/server";

import { loadSkillsShLeaderboard } from "@/core/marketplaces/skills-sh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawView = request.nextUrl.searchParams.get("view");
  const view = rawView === "all-time" || rawView === "hot" ? rawView : "trending";
  const result = await loadSkillsShLeaderboard(view, 20);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

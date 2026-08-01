import { type NextRequest } from "next/server";

import { searchSkillsMp } from "@/core/marketplaces/skillsmp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || "";
  const result = await searchSkillsMp(query, 20);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

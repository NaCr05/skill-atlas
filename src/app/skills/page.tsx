import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const focusedSkillName = firstValue(parameters.skill).trim().slice(0, 80);
  redirect(focusedSkillName ? `/?skill=${encodeURIComponent(focusedSkillName)}` : "/");
}

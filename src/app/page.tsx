import { CatalogPage } from "@/components/catalog-page";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const focusedSkillName = firstValue(parameters.skill).trim().slice(0, 80);
  return <CatalogPage focusedSkillName={focusedSkillName} />;
}

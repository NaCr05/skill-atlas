export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  author?: string;
  sourceLabel: string;
  sourceUrl?: string;
  pageUrl: string;
  installs?: number;
  stars?: number;
  duplicate?: boolean;
}

export interface MarketplaceResponse {
  provider: "skillsmp" | "skills.sh";
  available: boolean;
  results: MarketplaceSkill[];
  notice?: string;
  browseUrl: string;
  fetchedAt?: string;
}

export interface MarketplaceAdapter {
  search(query: string, limit?: number): Promise<MarketplaceResponse>;
}

export async function fetchJson(
  url: URL,
  headers: HeadersInit = {},
  fetcher: typeof fetch = fetch,
): Promise<{ response: Response; payload: unknown }> {
  const response = await fetcher(url, {
    headers: { Accept: "application/json", ...headers },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function textValue(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

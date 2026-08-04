import packageJson from "../../../package.json";

export interface AppUpdateStatus {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  publishedAt?: string;
  releaseName?: string;
}

function parts(version: string): number[] { return version.replace(/^v/i, "").split(".").slice(0, 3).map((part) => Number.parseInt(part, 10) || 0); }
export function isNewerVersion(candidate: string, current: string): boolean {
  const left = parts(candidate); const right = parts(current);
  for (let index = 0; index < 3; index += 1) { if (left[index] !== right[index]) return left[index] > right[index]; }
  return false;
}

export async function checkForAppUpdate(fetcher: typeof fetch = fetch): Promise<AppUpdateStatus> {
  const response = await fetcher("https://api.github.com/repos/NaCr05/skill-atlas/releases/latest", { headers: { Accept: "application/vnd.github+json", "User-Agent": "skill-atlas-local" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`GitHub release check failed (HTTP ${response.status}).`);
  const release = await response.json() as { tag_name?: string; html_url?: string; published_at?: string; name?: string };
  if (!release.tag_name) throw new Error("The latest GitHub release has no version tag.");
  return { currentVersion: packageJson.version, latestVersion: release.tag_name.replace(/^v/i, ""), updateAvailable: isNewerVersion(release.tag_name, packageJson.version), releaseUrl: release.html_url, publishedAt: release.published_at, releaseName: release.name };
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostName(value: string): string {
  if (value.startsWith("[")) return value.split("]")[0] + "]";
  return value.split(":")[0].toLocaleLowerCase();
}

export function assertLocalMutationRequest(request: Request): void {
  const host = request.headers.get("host") || "";
  if (!LOCAL_HOSTS.has(hostName(host))) {
    throw new SkillAtlasError("LOCAL_REQUEST_REJECTED");
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).hostname.toLocaleLowerCase();
    } catch {
      throw new SkillAtlasError("LOCAL_REQUEST_REJECTED");
    }
    if (!LOCAL_HOSTS.has(originHost)) {
      throw new SkillAtlasError("LOCAL_REQUEST_REJECTED");
    }
  }
}
import { SkillAtlasError } from "@/core/errors/skill-atlas-error";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostName(value: string): string {
  if (value.startsWith("[")) return value.split("]")[0] + "]";
  return value.split(":")[0].toLocaleLowerCase();
}

export function assertLocalMutationRequest(request: Request): void {
  const host = request.headers.get("host") || "";
  if (!LOCAL_HOSTS.has(hostName(host))) {
    throw new Error("仅接受来自 localhost 的变更请求。");
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).hostname.toLocaleLowerCase();
    } catch {
      throw new Error("请求 Origin 无效。");
    }
    if (!LOCAL_HOSTS.has(originHost)) {
      throw new Error("已阻止非本机页面发起的变更请求。");
    }
  }
}

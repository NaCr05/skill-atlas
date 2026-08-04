import { listOperations } from "@/core/operations/operation-log";
import { assertLocalMutationRequest } from "@/core/security/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  assertLocalMutationRequest(request);
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let sending = false;
  let previous = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* The browser may already have closed the stream. */ }
      };
      request.signal.addEventListener("abort", close, { once: true });
      controller.enqueue(encoder.encode("retry: 2000\n\n"));

      const send = async () => {
        if (closed || sending) return;
        sending = true;
        try {
          const payload = JSON.stringify({ records: await listOperations() });
          if (payload !== previous) {
            previous = payload;
            controller.enqueue(encoder.encode(`event: operations\ndata: ${payload}\n\n`));
          } else {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          }
        } catch {
          controller.enqueue(encoder.encode("event: operations-error\ndata: {}\n\n"));
        } finally {
          sending = false;
        }
      };

      await send();
      timer = setInterval(() => { void send(); }, 2_000);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

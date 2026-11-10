import type { SendResult } from "./types";

// 5xx, 429 and network errors are worth retrying; any other non-2xx is a permanent failure.
// isError lets a provider that reports errors inside a 2xx body flag them.
export async function toResult(
  request: () => Promise<Response>,
  isError?: (body: string) => boolean,
): Promise<SendResult> {
  let res: Response;
  try {
    res = await request();
  } catch (error) {
    return { status: "retry", error: String(error) };
  }
  const body = await res.text();
  if (res.ok && !isError?.(body)) return { status: "ok" };
  const error = `HTTP ${res.status}: ${body.slice(0, 200)}`;
  const transient = res.status >= 500 || res.status === 429;
  return { status: transient ? "retry" : "fail", error };
}

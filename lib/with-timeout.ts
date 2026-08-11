export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Race a promise against a timeout. Does not cancel the underlying work. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation"
): Promise<T> {
  if (!ms || ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export async function fetchJsonWithTimeout<T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const { timeoutMs = 15_000, signal, ...rest } = init;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...rest, signal: controller.signal });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `Expected JSON, got ${contentType || "unknown"}`,
      };
    }
    const data = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, status: 0, data: null, error: `Timed out after ${timeoutMs}ms` };
    }
    return { ok: false, status: 0, data: null, error: err?.message || "Network error" };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

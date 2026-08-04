const DEFAULT_RETRY_BASE_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

type HeaderReader = Pick<Headers, "get">;

export function graphRetryAfterMs(headers: HeaderReader, nowMs = Date.now()): number | null {
  const milliseconds = Number(headers.get("x-ms-retry-after-ms")?.trim());
  if (Number.isFinite(milliseconds) && milliseconds >= 0) return milliseconds;

  const raw = headers.get("retry-after")?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = new Date(raw).getTime();
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : null;
}

export function graphRetryDelayMs(
  headers: HeaderReader,
  attempt: number,
  nowMs = Date.now(),
): number {
  const exponential = DEFAULT_RETRY_BASE_MS * 2 ** Math.max(0, attempt);
  return Math.min(
    MAX_RETRY_DELAY_MS,
    Math.max(exponential, graphRetryAfterMs(headers, nowMs) ?? 0),
  );
}

export function isRetryableGraphReadStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

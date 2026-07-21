import { isValidEmailFormat } from "@/lib/auth/email-policy";
import { normalizePortalDomain } from "@/lib/bitrix/portal";

const BITRIX_REST_TIMEOUT_MS = 12_000;

export interface BitrixUserCurrentResult {
  /** Primary email from Bitrix (usually work). */
  email: string | null;
  /** Work + personal addresses from the profile, in priority order. */
  emails: string[];
  id: string | null;
  displayName: string | null;
}

export type BitrixUserCurrentFailure = {
  ok: false;
  message: string;
  code?: string;
  httpStatus: number;
};

function bitrixResultString(
  result: Record<string, unknown>,
  upperKey: string,
  lowerKey: string,
): string {
  const u = result[upperKey];
  const l = result[lowerKey];
  if (typeof u === "string" && u.trim()) return u.trim();
  if (typeof l === "string" && l.trim()) return l.trim();
  return "";
}

function displayNameFromBitrixResult(result: Record<string, unknown>): string | null {
  const first = bitrixResultString(result, "NAME", "name");
  const last = bitrixResultString(result, "LAST_NAME", "last_name");
  const second = bitrixResultString(result, "SECOND_NAME", "second_name");
  const parts = [first, last, second].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" ");
}

/** Calls portal REST `user.current` with placement OAuth token as `auth`. */
export async function fetchBitrixUserCurrent(
  portalDomain: string,
  authToken: string,
): Promise<{ ok: true; user: BitrixUserCurrentResult } | BitrixUserCurrentFailure> {
  const host = normalizePortalDomain(portalDomain);
  const url = `https://${host}/rest/user.current`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BITRIX_REST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams({ auth: authToken }).toString(),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      message: timedOut
        ? "Bitrix did not respond in time. Please try again."
        : "Could not reach Bitrix. Please try again.",
      code: timedOut ? "BITRIX_TIMEOUT" : "BITRIX_UNAVAILABLE",
      httpStatus: timedOut ? 504 : 502,
    };
  } finally {
    clearTimeout(timeout);
  }

  let data: Record<string, unknown>;
  try {
    const text = await res.text();
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {
      ok: false,
      message: `Bitrix REST HTTP ${res.status} (non-JSON body)`,
      httpStatus: res.status,
    };
  }

  const err = data.error as string | undefined;
  const errDesc = typeof data.error_description === "string" ? data.error_description : undefined;

  if (err != null && err !== "") {
    const message = [err, errDesc].filter(Boolean).join(": ");
    return { ok: false, message: message || err, code: err, httpStatus: res.status };
  }

  if (!res.ok) {
    return { ok: false, message: `Bitrix REST HTTP ${res.status}`, httpStatus: res.status };
  }

  const result = data.result as Record<string, unknown> | undefined;
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      message: "Invalid Bitrix user.current response (missing result)",
      httpStatus: res.status,
    };
  }

  const emails = emailsFromBitrixResult(result);
  const email = emails[0] ?? null;
  const id =
    (typeof result.ID === "string" && result.ID) ||
    (typeof result.id === "string" && result.id) ||
    null;

  return {
    ok: true,
    user: { email, emails, id, displayName: displayNameFromBitrixResult(result) },
  };
}

const BITRIX_EMAIL_KEYS: [string, string][] = [
  ["EMAIL", "email"],
  ["PERSONAL_MAILBOX", "personal_mailbox"],
  ["WORK_MAILBOX", "work_mailbox"],
];

/** Collect valid emails from Bitrix `user.current` (work email is not always in `EMAIL`). */
export function emailsFromBitrixResult(result: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [upper, lower] of BITRIX_EMAIL_KEYS) {
    const raw = bitrixResultString(result, upper, lower);
    if (!raw || !isValidEmailFormat(raw)) continue;
    const normalized = raw.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

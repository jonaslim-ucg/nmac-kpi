"use client";

const BITRIX_SDK_SCRIPT = "https://api.bitrix24.com/api/v1/";
const BITRIX_SDK_LOAD_TIMEOUT_MS = 10_000;
const BITRIX_SDK_INIT_TIMEOUT_MS = 15_000;

export type BitrixClientAuth = {
  access_token: string;
  domain: string;
  member_id?: string;
};

declare global {
  interface Window {
    BX24?: {
      init: (cb: () => void) => void;
      getAuth: () => false | BitrixClientAuth;
      fitWindow?: () => void;
    };
  }
}

function loadScriptOnce(src: string): Promise<true> {
  return new Promise((resolve, reject) => {
    if (window.BX24) {
      resolve(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Bitrix SDK")), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Failed to load Bitrix SDK"));
    document.head.appendChild(s);
  });
}

function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const timeout = window.setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function hasBitrixEmbedSignals(input: {
  referrer: string;
  search: string;
  hasBitrixSdk?: boolean;
}): boolean {
  return (
    input.hasBitrixSdk === true ||
    /bitrix24\.com/i.test(input.referrer) ||
    /[?&]DOMAIN=/i.test(input.search)
  );
}

/** True only when the page has a Bitrix-specific signal, not merely because it is inside an iframe. */
export function isLikelyBitrixEmbed(): boolean {
  if (typeof window === "undefined") return false;
  return hasBitrixEmbedSignals({
    referrer: document.referrer,
    search: window.location.search,
    hasBitrixSdk: Boolean(window.BX24),
  });
}

/**
 * Load BX24, init, and return portal OAuth credentials for server-side `user.current`.
 * Returns null when not running inside Bitrix or auth is unavailable.
 */
export async function getBitrixClientAuth(): Promise<BitrixClientAuth | null> {
  if (typeof window === "undefined") return null;
  if (!isLikelyBitrixEmbed()) return null;

  try {
    const loaded = await withTimeout(
      BITRIX_SDK_LOAD_TIMEOUT_MS,
      loadScriptOnce(BITRIX_SDK_SCRIPT),
    );
    if (loaded !== true) return null;
  } catch {
    return null;
  }

  const BX24 = window.BX24;
  if (!BX24?.init || !BX24?.getAuth) return null;

  const initDone = await withTimeout(
    BITRIX_SDK_INIT_TIMEOUT_MS,
    new Promise<boolean>((resolve) => {
      try {
        BX24.init(() => resolve(true));
      } catch {
        resolve(false);
      }
    }),
  );
  if (initDone !== true) return null;

  try {
    BX24.fitWindow?.();
  } catch {
    /* ignore */
  }

  const auth = BX24.getAuth();
  if (!auth || typeof auth !== "object") return null;
  const access_token = typeof auth.access_token === "string" ? auth.access_token.trim() : "";
  const domain = typeof auth.domain === "string" ? auth.domain.trim() : "";
  if (!access_token || !domain) return null;

  return {
    access_token,
    domain,
    member_id: typeof auth.member_id === "string" ? auth.member_id : undefined,
  };
}

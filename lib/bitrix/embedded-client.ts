"use client";

const BITRIX_SDK_SCRIPT = "https://api.bitrix24.com/api/v1/";

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

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Bitrix SDK"));
    document.head.appendChild(s);
  });
}

function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

/** True when the page is likely embedded (iframe) or opened from a Bitrix host. */
export function isLikelyBitrixEmbed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  if (/bitrix24\.com/i.test(document.referrer)) return true;
  return /[?&]DOMAIN=/i.test(window.location.search);
}

/**
 * Load BX24, init, and return portal OAuth credentials for server-side `user.current`.
 * Returns null when not running inside Bitrix or auth is unavailable.
 */
export async function getBitrixClientAuth(): Promise<BitrixClientAuth | null> {
  if (typeof window === "undefined") return null;
  if (!isLikelyBitrixEmbed()) return null;

  try {
    await loadScriptOnce(BITRIX_SDK_SCRIPT);
  } catch {
    return null;
  }

  const BX24 = window.BX24;
  if (!BX24?.init || !BX24?.getAuth) return null;

  const initDone = await withTimeout(
    20_000,
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

"use client";

import { useEffect } from "react";
import { useSession } from "@/components/auth/session-provider";
import { isLikelyBitrixEmbed } from "@/lib/bitrix/embedded-client";

/** Prevents duplicate POSTs within the same activation (React Strict Mode). Resets on re-open. */
let loggedThisActivation = false;
let hiddenSince: number | null = null;

async function postAppOpen() {
  if (loggedThisActivation) return;
  loggedThisActivation = true;

  const via = isLikelyBitrixEmbed() ? "bitrix" : "browser";
  try {
    await fetch("/api/auth/activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ via }),
    });
  } catch {
    loggedThisActivation = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    hiddenSince = Date.now();
    return;
  }

  const hiddenMs = hiddenSince != null ? Date.now() - hiddenSince : 0;
  hiddenSince = null;

  // Bitrix keeps the iframe alive when switching apps; treat re-show as a fresh open.
  if (isLikelyBitrixEmbed() && hiddenMs >= 1000) {
    loggedThisActivation = false;
    void postAppOpen();
  }
}

/**
 * Records "Opened app via Bitrix24" on every app open.
 * Bitrix users keep their session cookie, so sign-in does not run again — this is the login audit trail.
 */
export function ActivityLogger() {
  const { user, loading } = useSession();

  useEffect(() => {
    if (loading || !user) return;

    void postAppOpen();

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      loggedThisActivation = false;
      void postAppOpen();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [user, loading]);

  return null;
}

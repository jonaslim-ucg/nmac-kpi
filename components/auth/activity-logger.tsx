"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/components/auth/session-provider";
import { isLikelyBitrixEmbed } from "@/lib/bitrix/embedded-client";

const CLIENT_DEDUPE_MS = 5 * 60 * 1000;

/**
 * Records "Opened app" when a signed-in user loads the dashboard.
 * Bitrix users usually skip /login (session cookie), so sign-in audit never runs without this.
 */
export function ActivityLogger() {
  const { user, loading } = useSession();
  const started = useRef(false);

  useEffect(() => {
    if (loading || !user || started.current) return;

    const storageKey = `nmac:activity:${user.email}`;
    const lastRaw = sessionStorage.getItem(storageKey);
    if (lastRaw) {
      const last = Number(lastRaw);
      if (Number.isFinite(last) && Date.now() - last < CLIENT_DEDUPE_MS) return;
    }

    started.current = true;
    const via = isLikelyBitrixEmbed() ? "bitrix" : "browser";

    void fetch("/api/auth/activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ via }),
    }).then(() => {
      sessionStorage.setItem(storageKey, String(Date.now()));
    });
  }, [user, loading]);

  return null;
}

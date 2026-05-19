"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getBitrixClientAuth, isLikelyBitrixEmbed } from "@/lib/bitrix/embedded-client";

type Phase = "idle" | "trying" | "failed";

/**
 * When opened inside Bitrix24 (iframe), loads BX24 and signs in via `/api/auth/bitrix`.
 * On failure, calls `onFallback` so the email OTP form can be shown.
 */
export function BitrixAutoSignIn({ onFallback }: { onFallback: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() => (isLikelyBitrixEmbed() ? "trying" : "idle"));

  useEffect(() => {
    if (phase !== "trying") return;

    let cancelled = false;

    void (async () => {
      const auth = await getBitrixClientAuth();
      if (cancelled) return;

      if (!auth) {
        setPhase("failed");
        onFallback();
        return;
      }

      try {
        const res = await fetch("/api/auth/bitrix", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: auth.access_token,
            domain: auth.domain,
            embedded: true,
          }),
        });
        const j = (await res.json()) as { ok?: boolean; message?: string };
        if (cancelled) return;

        if (!res.ok || !j.ok) {
          setPhase("failed");
          onFallback();
          return;
        }

        router.replace("/");
        router.refresh();
      } catch {
        if (!cancelled) {
          setPhase("failed");
          onFallback();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, onFallback, router]);

  if (phase !== "trying") return null;

  return (
    <div className="py-8 text-center">
      <p className="text-sm font-medium text-foreground">Signing in with Bitrix24…</p>
      <p className="mt-2 text-xs text-muted-foreground">Using your Bitrix account</p>
    </div>
  );
}



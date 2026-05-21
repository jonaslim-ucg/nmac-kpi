"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NO_APP_ACCESS_MESSAGE } from "@/lib/auth/app-user-access";
import { getBitrixClientAuth, isLikelyBitrixEmbed } from "@/lib/bitrix/embedded-client";

type Phase = "idle" | "trying" | "failed" | "denied";

/**
 * When opened inside Bitrix24 (iframe), loads BX24 and signs in via `/api/auth/bitrix`.
 * On failure, calls `onFallback` so the email OTP form can be shown.
 */
export function BitrixAutoSignIn({
  onFallback,
  allowOtpFallback = true,
}: {
  onFallback: () => void;
  /** When false, never show the email OTP form (used after access was revoked). */
  allowOtpFallback?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() => (isLikelyBitrixEmbed() ? "trying" : "idle"));
  const [deniedMessage, setDeniedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "trying") return;

    let cancelled = false;

    void (async () => {
      const auth = await getBitrixClientAuth();
      if (cancelled) return;

      if (!auth) {
        if (!allowOtpFallback) {
          setDeniedMessage(NO_APP_ACCESS_MESSAGE);
          setPhase("denied");
          return;
        }
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
          if (res.status === 403 && j.message) {
            setDeniedMessage(j.message);
            setPhase("denied");
            return;
          }
          if (!allowOtpFallback) {
            setDeniedMessage(j.message ?? NO_APP_ACCESS_MESSAGE);
            setPhase("denied");
            return;
          }
          setPhase("failed");
          onFallback();
          return;
        }

        router.replace("/nmac-2026");
        router.refresh();
      } catch {
        if (!cancelled) {
          if (!allowOtpFallback) {
            setDeniedMessage(NO_APP_ACCESS_MESSAGE);
            setPhase("denied");
            return;
          }
          setPhase("failed");
          onFallback();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, onFallback, router]);

  if (phase === "denied") {
    return (
      <div className="py-4">
        <p className="text-sm font-medium text-foreground">Access not available</p>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {deniedMessage}
        </p>
      </div>
    );
  }

  if (phase !== "trying") return null;

  return (
    <div className="py-8 text-center">
      <p className="text-sm font-medium text-foreground">Signing in with Bitrix24…</p>
      <p className="mt-2 text-xs text-muted-foreground">Using your Bitrix account</p>
    </div>
  );
}

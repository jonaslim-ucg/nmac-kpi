"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BitrixAutoSignIn } from "@/components/auth/bitrix-auto-sign-in";
import { AppBrand } from "@/components/dashboard/app-logo";
import { NO_APP_ACCESS_MESSAGE } from "@/lib/auth/app-user-access";
import { isLikelyBitrixEmbed } from "@/lib/bitrix/embedded-client";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [accessDenied, setAccessDenied] = useState(false);
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendSec, setResendSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBitrixFallback = useCallback(() => {
    setShowOtpForm(true);
  }, []);

  useEffect(() => {
    const denied = new URLSearchParams(window.location.search).get("access") === "denied";
    setAccessDenied(denied);
    if (denied) {
      setShowOtpForm(false);
      return;
    }
    setShowOtpForm(!isLikelyBitrixEmbed());
  }, []);

  useEffect(() => {
    if (resendSec <= 0) return;
    const t = window.setInterval(() => setResendSec((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendSec]);

  const sendCode = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = (await r.json()) as { ok?: boolean; message?: string };
      if (!r.ok || !j.ok) {
        setError(j.message ?? "Could not send code.");
        return;
      }
      setStep("code");
      setResendSec(60);
    } catch {
      setError("Could not send code.");
    } finally {
      setBusy(false);
    }
  }, [email]);

  const verify = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const j = (await r.json()) as { ok?: boolean; message?: string };
      if (!r.ok || !j.ok) {
        setError(j.message ?? "Could not sign in.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not sign in.");
    } finally {
      setBusy(false);
    }
  }, [email, code, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <AppBrand layout="login" />
        </div>

        {!showOtpForm ? (
          <BitrixAutoSignIn onFallback={onBitrixFallback} allowOtpFallback={!accessDenied} />
        ) : accessDenied ? (
          <div className="py-2">
            <p className="text-lg font-semibold tracking-tight text-foreground">Access not available</p>
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {NO_APP_ACCESS_MESSAGE}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              {step === "email" ? "Sign in" : "Check your email"}
            </h1>
            {step === "email" ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter your email to receive a login code
                </p>
                <label className="mt-6 block text-sm font-medium text-foreground">
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none ring-accent focus:ring-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {error ? (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={busy || !email.trim()}
                  className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send code"}
                </button>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter the 6-digit code we sent to your email
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">{email.trim()}</p>
                <label className="mt-6 block text-sm font-medium text-foreground">
                  Code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none ring-accent focus:ring-2"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={busy}
                  />
                </label>
                {error ? (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={verify}
                  disabled={busy || code.length !== 6}
                  className="mt-6 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? "Signing in…" : "Sign in"}
                </button>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => {
                      setStep("email");
                      setCode("");
                      setError(null);
                    }}
                  >
                    Use a different email
                  </button>
                  <button
                    type="button"
                    disabled={resendSec > 0 || busy}
                    className="text-muted-foreground underline-offset-2 hover:text-foreground disabled:cursor-not-allowed disabled:no-underline"
                    onClick={sendCode}
                  >
                    {resendSec > 0 ? `Resend in ${resendSec}s` : "Resend code"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

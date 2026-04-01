"use client";

import { useCallback, useEffect, useState } from "react";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import { formatDisplayName } from "@/lib/auth/display-name";

export default function SettingsPage() {
  const { user, loading, logout, refresh } = useSession();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFirst(user.firstName ?? "");
      setLast(user.lastName ?? "");
    }
  }, [user]);

  const saveProfile = useCallback(async () => {
    setMessage(null);
    setSaving(true);
    try {
      const r = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: first, last_name: last }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setMessage(j.error ?? "Could not save.");
        return;
      }
      setMessage("Saved.");
      await refresh();
    } catch {
      setMessage("Could not save.");
    } finally {
      setSaving(false);
    }
  }, [first, last, refresh]);

  return (
    <MainShell title="Settings" subtitle="Your account">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Account</h2>
          {loading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Signed in as{" "}
                <strong className="text-foreground">{formatDisplayName(user)}</strong>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{user?.email}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Role: <span className="capitalize text-foreground">{user?.role}</span>
              </p>

              <div className="mt-6 space-y-3 border-t border-border pt-5">
                <p className="text-sm font-medium text-foreground">Your name</p>
                <p className="text-xs text-muted-foreground">
                  Shown in the sidebar and across the app instead of your email when filled in.
                </p>
                <div className="flex flex-wrap gap-3">
                  <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">First name</span>
                    <input
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={first}
                      onChange={(e) => setFirst(e.target.value)}
                      autoComplete="given-name"
                      placeholder="First name"
                    />
                  </label>
                  <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Last name</span>
                    <input
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={last}
                      onChange={(e) => setLast(e.target.value)}
                      autoComplete="family-name"
                      placeholder="Last name"
                    />
                  </label>
                </div>
                {message ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {message}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveProfile()}
                  disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save name"}
                </button>
              </div>

              <ul className="mt-6 list-inside list-disc text-xs text-muted-foreground">
                <li>
                  <strong className="text-foreground">Viewer</strong> — dashboard and reports (read-only).
                </li>
                <li>
                  <strong className="text-foreground">Editor</strong> — can enter weekly KPI data.
                </li>
                <li>
                  <strong className="text-foreground">Admin</strong> — editors’ access plus user management.
                </li>
              </ul>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-4 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent-muted/40"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </MainShell>
  );
}

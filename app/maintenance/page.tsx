"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { AppBrand } from "@/components/dashboard/app-logo";
import { MAINTENANCE_BLOCK_MESSAGE } from "@/lib/auth/maintenance-mode";

export default function MaintenancePage() {
  const router = useRouter();

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.replace("/login?maintenance=1");
    router.refresh();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <AppBrand layout="login" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Under maintenance</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{MAINTENANCE_BLOCK_MESSAGE}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 w-full rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-muted/80"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

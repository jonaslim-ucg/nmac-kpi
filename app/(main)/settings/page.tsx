"use client";

import { MainShell } from "@/components/dashboard/main-shell";
import { useAppRole } from "@/components/dashboard/mock-role-provider";
import type { AppRole } from "@/components/dashboard/mock-role-provider";

export default function SettingsPage() {
  const { role, setRole } = useAppRole();

  return (
    <MainShell title="Settings" subtitle="Role preview (until sign-in is on)">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Role (preview)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong>Admin</strong> can open <strong>Data entry</strong> in the sidebar. <strong>Viewer</strong> can use
            the dashboard and charts only.
          </p>
          <div className="mt-4 flex gap-3">
            {(["admin", "user"] as AppRole[]).map((r) => (
              <label
                key={r}
                className="flex cursor-pointer items-center gap-2 text-sm text-foreground/90"
              >
                <input
                  type="radio"
                  name="role"
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="accent-violet-600"
                />
                {r === "admin" ? "Admin" : "Viewer"}
              </label>
            ))}
          </div>
        </div>
      </div>
    </MainShell>
  );
}

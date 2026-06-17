"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { MainShell } from "@/components/dashboard/main-shell";
import { KpiNmac2026Client } from "@/components/kpi-nmac-2026/kpi-nmac-2026-client";
import { useDashboardPreferences } from "@/components/auth/dashboard-preferences-provider";
import { useSession } from "@/components/auth/session-provider";
import {
  firstAllowedNmacNavHref,
  isNmacNavViewAllowed,
} from "@/lib/auth/role-nmac-nav";
import { isNk26View, nk26Title, type Nk26View } from "@/lib/kpi-nmac-2026/views-meta";

export default function Nmac2026Page() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSession();
  const { ready: prefsReady, roleNmacNav } = useDashboardPreferences();
  const raw = params.section;
  const segment = useMemo(() => {
    if (!raw) return "overview";
    return Array.isArray(raw) ? (raw[0] ?? "overview") : raw;
  }, [raw]);
  const view: Nk26View = isNk26View(segment) ? segment : "overview";
  const allowed = !prefsReady || isNmacNavViewAllowed(user?.role, view, roleNmacNav);

  useEffect(() => {
    if (!prefsReady || allowed) return;
    router.replace(firstAllowedNmacNavHref(user?.role, roleNmacNav));
  }, [allowed, prefsReady, roleNmacNav, router, user?.role]);

  if (!prefsReady || !allowed) {
    return (
      <MainShell title={nk26Title(view)}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  return (
    <MainShell title={nk26Title(view)}>
      <KpiNmac2026Client view={view} />
    </MainShell>
  );
}

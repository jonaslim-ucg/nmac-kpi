"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { MainShell } from "@/components/dashboard/main-shell";
import { KpiNmac2026Client } from "@/components/kpi-nmac-2026/kpi-nmac-2026-client";
import { isNk26View, nk26Title, type Nk26View } from "@/lib/kpi-nmac-2026/views-meta";

export default function Nmac2026Page() {
  const params = useParams();
  const raw = params.section;
  const segment = useMemo(() => {
    if (!raw) return "overview";
    return Array.isArray(raw) ? (raw[0] ?? "overview") : raw;
  }, [raw]);
  const view: Nk26View = isNk26View(segment) ? segment : "overview";

  return (
    <MainShell title={nk26Title(view)}>
      <KpiNmac2026Client view={view} />
    </MainShell>
  );
}

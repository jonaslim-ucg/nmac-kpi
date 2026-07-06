"use client";

import { SurveyOutreachDevPanel } from "@/components/dev/survey-outreach-dev-panel";
import { MainShell } from "@/components/dashboard/main-shell";
import { useSession } from "@/components/auth/session-provider";
import { canAccessDev } from "@/lib/auth/types";

export default function SurveyOutreachDevPage() {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <MainShell title="Survey outreach" subtitle="Loading">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </MainShell>
    );
  }

  if (!canAccessDev(user?.role)) {
    return (
      <MainShell title="Survey outreach" subtitle="Restricted">
        <p className="text-sm text-muted-foreground">You need the Developer role to access this page.</p>
      </MainShell>
    );
  }

  return (
    <MainShell
      title="Survey outreach"
      subtitle="Sent emails and reminder schedule"
    >
      <div className="mx-auto max-w-5xl">
        <SurveyOutreachDevPanel />
      </div>
    </MainShell>
  );
}

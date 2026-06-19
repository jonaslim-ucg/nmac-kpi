import { NextResponse } from "next/server";
import { buildAppointmentReviewStats } from "@/lib/appointment-review/analytics";
import { toAppointmentReviewDetail } from "@/lib/appointment-review/display";
import { APPOINTMENT_REVIEWS_SETUP_SQL, listAppointmentReviews } from "@/lib/appointment-review/store";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canEditKpiData } from "@/lib/auth/types";
import { getAppDashboardSettings } from "@/lib/auth/app-settings";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getAppDashboardSettings();
  if (!canEditKpiData(session.role, settings?.customRoles ?? [])) {
    return unauthorized();
  }

  const url = new URL(req.url);
  const daysRaw = url.searchParams.get("days");
  const days = daysRaw ? Number(daysRaw) : null;

  const result = await listAppointmentReviews();
  if (!result.ok) {
    if (result.setupRequired) {
      return NextResponse.json(
        {
          setupRequired: true,
          setupSql: APPOINTMENT_REVIEWS_SETUP_SQL,
          error: result.error ?? "Run the database setup to enable appointment reviews.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: result.error ?? "Could not load reviews." }, { status: 500 });
  }

  let rows = result.rows;
  if (days && Number.isFinite(days) && days > 0) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    rows = rows.filter((r) => new Date(r.created_at).getTime() >= cutoff);
  }

  return NextResponse.json(
    {
      stats: buildAppointmentReviewStats(rows),
      reviews: rows.map(toAppointmentReviewDetail),
      ready: true,
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

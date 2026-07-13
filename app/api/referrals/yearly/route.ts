import { NextResponse } from "next/server";
import { ArdtsConfigError, fetchArdtsStatusCounts } from "@/lib/ardts/status-counts";
import { monthDateBounds } from "@/lib/ardts/referral-display";
import type { ReferralMonthlyPoint, ReferralYearlyResponse } from "@/lib/ardts/referral-metrics";
import { getSessionFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function parseYear(value: string | null): number | null {
  if (!value) return new Date().getFullYear();
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseYear(searchParams.get("year"));
  if (year === null) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }

  try {
    const months = await Promise.all(
      Array.from({ length: 12 }, async (_, monthIndex) => {
        const { from, to } = monthDateBounds(year, monthIndex);
        const data = await fetchArdtsStatusCounts({ range: "custom", from, to, itemType: "all" });
        const point: ReferralMonthlyPoint = {
          monthIndex,
          from,
          to,
          total: data.total,
          booked: data.counts.booked ?? 0,
          booking_pending: data.counts.booking_pending ?? 0,
          need_help: data.counts.need_help ?? 0,
          completed: data.counts.completed ?? 0,
          closed: data.counts.closed ?? 0,
        };
        return point;
      }),
    );

    const body: ReferralYearlyResponse = { year, months };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (err) {
    if (err instanceof ArdtsConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not load yearly referral counts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

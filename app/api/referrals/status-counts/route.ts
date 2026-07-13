import { NextResponse } from "next/server";
import { ArdtsConfigError, fetchArdtsStatusCounts } from "@/lib/ardts/status-counts";
import { ARDTS_RANGE_PRESETS, type ArdtsRangePreset } from "@/lib/ardts/types";
import { getSessionFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function parseRange(value: string | null): ArdtsRangePreset | null {
  if (!value) return "last_7_days";
  return (ARDTS_RANGE_PRESETS as readonly string[]).includes(value) ? (value as ArdtsRangePreset) : null;
}

function parseYear(value: string | null): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

function parseMonth(value: string | null): number | null {
  if (!value) return null;
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return month;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const yearRaw = searchParams.get("year");
  const monthRaw = searchParams.get("month");
  const year = parseYear(yearRaw);
  const month = parseMonth(monthRaw);
  const hasMonthParams = yearRaw !== null || monthRaw !== null;
  if (hasMonthParams && (year === null || month === null)) {
    return NextResponse.json({ error: "Month reporting requires valid year and month." }, { status: 400 });
  }

  const range = hasMonthParams ? null : parseRange(searchParams.get("range"));
  if (!hasMonthParams && !range) {
    return NextResponse.json({ error: "Invalid range.", valid_ranges: ARDTS_RANGE_PRESETS }, { status: 400 });
  }

  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const statusParams = [
    ...searchParams.getAll("status"),
    ...searchParams.getAll("statuses"),
  ].filter(Boolean);
  const status = statusParams.length > 0 ? statusParams : undefined;

  if (!hasMonthParams && range === "custom" && (!from || !to)) {
    return NextResponse.json({ error: "Custom range requires from and to (YYYY-MM-DD)." }, { status: 400 });
  }

  try {
    const data = await fetchArdtsStatusCounts(
      hasMonthParams
        ? { year: year!, month: month!, itemType: "all", status }
        : { range: range!, from, to, itemType: "all", status },
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (err) {
    if (err instanceof ArdtsConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not load referral counts.";
    const status = message.includes("Invalid") || message.includes("requires") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

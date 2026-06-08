import { NextResponse } from "next/server";
import { ArdtsConfigError, fetchArdtsStatusCounts } from "@/lib/ardts/status-counts";
import { ARDTS_RANGE_PRESETS, type ArdtsRangePreset } from "@/lib/ardts/types";
import { getSessionFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function parseRange(value: string | null): ArdtsRangePreset | null {
  if (!value) return "last_7_days";
  return (ARDTS_RANGE_PRESETS as readonly string[]).includes(value) ? (value as ArdtsRangePreset) : null;
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const range = parseRange(searchParams.get("range"));
  if (!range) {
    return NextResponse.json(
      { error: "Invalid range.", valid_ranges: ARDTS_RANGE_PRESETS },
      { status: 400 },
    );
  }

  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const statusParams = searchParams.getAll("status").filter(Boolean);
  const status = statusParams.length > 0 ? statusParams : undefined;

  if (range === "custom" && (!from || !to)) {
    return NextResponse.json({ error: "Custom range requires from and to (YYYY-MM-DD)." }, { status: 400 });
  }

  try {
    const data = await fetchArdtsStatusCounts({ range, from, to, status });
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

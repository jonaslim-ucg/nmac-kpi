import { NextResponse } from "next/server";
import { CrmConfigError, fetchCrmAiConfirmationRate } from "@/lib/crm/appointments";
import { getSessionFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function parseYear(value: string | null): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

function parseMonth(value: string | null): number | null {
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
  const year = parseYear(searchParams.get("year"));
  const month = parseMonth(searchParams.get("month"));

  if (year === null || month === null) {
    return NextResponse.json({ error: "Invalid year or month." }, { status: 400 });
  }

  try {
    const data = await fetchCrmAiConfirmationRate(year, month);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (err) {
    if (err instanceof CrmConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Could not load AI confirmation rate.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

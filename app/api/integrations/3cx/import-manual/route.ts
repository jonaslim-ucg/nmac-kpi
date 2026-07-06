import { NextResponse } from "next/server";
import { normalizeThreeCxRange, threeCxRangeLabel } from "@/lib/3cx/email-report";
import { logThreeCxImport, saveThreeCxImport } from "@/lib/3cx/import-server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import { MONTHS } from "@/lib/kpi-nmac-2026/model";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function parseYear(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2020 && n <= 2100 ? n : null;
}

function parseMonthIndex(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 11 ? n : null;
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();
  const actor = { email: session.email, role: session.role };

  const form = await req.formData();
  const year = parseYear(form.get("year"));
  const monthIndex = parseMonthIndex(form.get("monthIndex"));
  const range = normalizeThreeCxRange(form.get("range"));
  const file = form.get("file");

  if (year === null || monthIndex === null) {
    return NextResponse.json({ error: "Choose a valid month and year." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a 3CX CSV file to import." }, { status: 400 });
  }

  try {
    const text = await file.text();
    const result = await saveThreeCxImport({
      actor,
      year,
      monthIndex,
      range,
      text,
      source: {
        mode: "manual",
        fileName: file.name,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import the 3CX CSV file.";
    await logThreeCxImport(actor, "error", "3CX manual import failed", {
      year,
      monthIndex,
      month: MONTHS[monthIndex],
      range,
      rangeLabel: threeCxRangeLabel(range),
      fileName: file.name,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

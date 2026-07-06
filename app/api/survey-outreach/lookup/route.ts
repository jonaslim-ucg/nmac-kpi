import { NextResponse } from "next/server";
import { lookupOutreachByToken } from "@/lib/survey-outreach/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  try {
    const lookup = await lookupOutreachByToken(token);
    if (!lookup) {
      return NextResponse.json({ ok: false, error: "Invalid or expired survey link." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...lookup });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: "Could not load survey link." }, { status: 500 });
  }
}

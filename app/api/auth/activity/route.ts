import { NextResponse } from "next/server";
import { recordAppOpen } from "@/lib/dev/session-activity";
import { DEV_LOGS_SETUP_SQL } from "@/lib/dev/logs";
import { getSessionFromCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { via?: unknown };
  const via = body.via === "bitrix" ? "bitrix" : "browser";

  const result = await recordAppOpen({ email: session.email, role: session.role }, via);

  if (result.setupRequired) {
    return NextResponse.json(
      {
        ok: false,
        setupRequired: true,
        setupSql: DEV_LOGS_SETUP_SQL,
        error: "Dev logs table is missing in Supabase.",
      },
      { status: 503 },
    );
  }

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, logged: result.logged });
}

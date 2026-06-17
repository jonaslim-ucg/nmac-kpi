import { NextResponse } from "next/server";
import {
  clearDevLogs,
  DEV_LOGS_SETUP_SQL,
  listDevLogs,
} from "@/lib/dev/logs";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

function withSetup(payload: Record<string, unknown>, status = 503) {
  return NextResponse.json({ ...payload, setupSql: DEV_LOGS_SETUP_SQL }, { status });
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const result = await listDevLogs(Number.isFinite(limitRaw) ? limitRaw : 100);

  if (result.setupRequired) {
    return withSetup({
      logs: [],
      setupRequired: true,
      error: result.error ?? "Run the database setup to enable automatic logging.",
    });
  }

  if (result.error) {
    return NextResponse.json({ logs: [], error: result.error }, { status: 500 });
  }

  return NextResponse.json(
    { logs: result.logs, ready: true },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function DELETE() {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();

  const result = await clearDevLogs();
  if (result.setupRequired) {
    return withSetup({
      error: result.error ?? "Run the database setup to enable logging.",
      setupRequired: true,
    });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Could not clear logs." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

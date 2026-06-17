import { NextResponse } from "next/server";
import {
  appendDevLog,
  clearDevLogs,
  isDevLogLevel,
  listDevLogs,
  type DevLogLevel,
} from "@/lib/dev/logs";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}

export async function GET(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const logs = await listDevLogs(Number.isFinite(limitRaw) ? limitRaw : 100);

  return NextResponse.json(
    { logs },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();

  const body = (await req.json()) as {
    level?: unknown;
    message?: unknown;
    source?: unknown;
    context?: unknown;
  };

  const level = body.level as DevLogLevel | undefined;
  const message = typeof body.message === "string" ? body.message : "";
  const source = typeof body.source === "string" ? body.source : null;
  const context =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? (body.context as Record<string, unknown>)
      : null;

  if (!isDevLogLevel(level)) {
    return NextResponse.json({ error: "Invalid level." }, { status: 400 });
  }
  if (!message.trim()) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const log = await appendDevLog({
    level,
    message,
    source,
    context,
    createdByEmail: session.email,
  });

  if (!log) {
    return NextResponse.json({ error: "Could not save log." }, { status: 500 });
  }

  return NextResponse.json({ log });
}

export async function DELETE() {
  const session = await getSessionFromCookies();
  if (!session || !canAccessDev(session.role)) return unauthorized();

  const ok = await clearDevLogs();
  if (!ok) {
    return NextResponse.json({ error: "Could not clear logs." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

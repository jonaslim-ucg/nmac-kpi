import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth/session";
import { canAccessDev } from "@/lib/auth/types";
import {
  getSurveySuppressionStats,
  recallAllProductionSurveyOutreach,
} from "@/lib/survey-outreach/recall";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  try {
    const stats = await getSurveySuppressionStats();
    return NextResponse.json({
      ...stats,
      note: "Recall suppresses future survey emails. Messages already in inboxes cannot be deleted via API.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load recall stats." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return unauthorized();
  if (!canAccessDev(session.role)) return forbidden();

  let reason = "Recalled after accidental send before go-live.";
  try {
    const body = (await req.json()) as { reason?: unknown };
    if (typeof body.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim();
    }
  } catch {
    // empty body is fine
  }

  try {
    const result = await recallAllProductionSurveyOutreach(reason);
    const stats = await getSurveySuppressionStats();
    return NextResponse.json({ ...result, ...stats });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Recall failed." },
      { status: 500 },
    );
  }
}

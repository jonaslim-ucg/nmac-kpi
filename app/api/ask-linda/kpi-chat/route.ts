import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeAskLindaKpiRequest } from "@/lib/ask-linda/authorize";
import { buildNmacKpiContextForQuestion } from "@/lib/ask-linda/kpi-data-server";
import { lookupAppUserByEmail } from "@/lib/auth/app-user-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  email: z.string().email(),
  question: z.string().min(1).max(12_000),
});

/**
 * Server-to-server bridge: Ask Linda (NMAC tab) delegates NMAC KPI questions here.
 * Returns a markdown snapshot of live KPI data for the model to answer from.
 */
export async function POST(req: NextRequest) {
  if (!authorizeAskLindaKpiRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const question = body.question.trim();

  const appUser = await lookupAppUserByEmail(email);
  if (!appUser) {
    return NextResponse.json(
      { ok: false, error: "ask_linda_kpi_not_in_directory" },
      { status: 403 },
    );
  }

  try {
    const answer = await buildNmacKpiContextForQuestion(question);
    return NextResponse.json({ ok: true, answer });
  } catch (e) {
    console.error("[ask-linda/kpi-chat]", e);
    return NextResponse.json({ ok: false, error: "kpi_load_failed" }, { status: 500 });
  }
}

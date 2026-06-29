import { NextResponse } from "next/server";
import { APPOINTMENT_REVIEW_MAX_SCORE, type AppointmentReviewPayload } from "@/lib/appointment-review/types";
import { insertAppointmentReview } from "@/lib/appointment-review/store";

export const dynamic = "force-dynamic";

function scale(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > APPOINTMENT_REVIEW_MAX_SCORE) return null;
  return v;
}

function str(v: unknown, max = 4000): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function parsePayload(body: unknown): AppointmentReviewPayload | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Invalid request body." };
  }
  const b = body as Record<string, unknown>;

  const appointmentEase = scale(b.appointmentEase);
  const visitRating = scale(b.visitRating);
  const providerAndServices = str(b.providerAndServices);

  if (appointmentEase === null || visitRating === null || !providerAndServices) {
    return { error: "Please answer all required questions." };
  }

  return {
    appointmentEase,
    visitRating,
    providerAndServices,
    healthImprovement: str(b.healthImprovement),
    recommendationMessage: str(b.recommendationMessage),
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });
  }

  const parsed = parsePayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, message: parsed.error }, { status: 400 });
  }

  const result = await insertAppointmentReview(parsed);
  if (!result.ok) {
    if (result.setupRequired) {
      return NextResponse.json(
        {
          ok: false,
          setupRequired: true,
          message: "Review storage is not configured yet. Please contact the practice.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, message: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

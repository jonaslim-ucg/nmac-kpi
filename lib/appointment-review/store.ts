import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AppointmentReviewPayload } from "@/lib/appointment-review/types";
import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";

export const APPOINTMENT_REVIEWS_SETUP_SQL = `-- Run in Supabase SQL Editor
create table if not exists public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_ease smallint not null check (appointment_ease between 1 and 5),
  visit_rating smallint not null check (visit_rating between 1 and 5),
  provider_and_services text not null,
  health_improvement text not null default '',
  recommendation_message text not null default ''
);

alter table public.appointment_reviews enable row level security;
`;

type InsertResult =
  | { ok: true }
  | { ok: false; error: string; setupRequired?: boolean };

export async function insertAppointmentReview(payload: AppointmentReviewPayload): Promise<InsertResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Review storage is not available." };
  }

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("appointment_reviews").insert({
      appointment_ease: payload.appointmentEase,
      visit_rating: payload.visitRating,
      provider_and_services: payload.providerAndServices,
      health_improvement: payload.healthImprovement,
      recommendation_message: payload.recommendationMessage,
    });

    if (error) {
      if (/appointment_reviews/i.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
        return { ok: false, error: "Review storage is not configured.", setupRequired: true };
      }
      return { ok: false, error: "Could not save your review." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save your review." };
  }
}

type ListResult =
  | { ok: true; rows: AppointmentReviewRow[] }
  | { ok: false; error: string; setupRequired?: boolean };

export async function listAppointmentReviews(limit = 500): Promise<ListResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Review storage is not available." };
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("appointment_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (/appointment_reviews/i.test(error.message) && /does not exist|schema cache/i.test(error.message)) {
        return { ok: false, error: "Review storage is not configured.", setupRequired: true };
      }
      return { ok: false, error: "Could not load reviews." };
    }

    return { ok: true, rows: (data ?? []) as AppointmentReviewRow[] };
  } catch {
    return { ok: false, error: "Could not load reviews." };
  }
}

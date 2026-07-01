import { createServiceRoleClient } from "@/lib/supabase/admin";
import { serviceTypeLabel, type AppointmentReviewPayload } from "@/lib/appointment-review/types";
import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";

export const APPOINTMENT_REVIEWS_SETUP_SQL = `-- Run in Supabase SQL Editor
create table if not exists public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  patient_name text not null,
  appointment_ease smallint not null check (appointment_ease between 1 and 5),
  visit_rating smallint not null check (visit_rating between 1 and 5),
  provider_and_services text not null default '',
  service_type text,
  service_type_other text not null default '',
  provider_rating smallint check (provider_rating between 1 and 5),
  health_improvement text not null default '',
  health_rating smallint check (health_rating between 1 and 5),
  confidence_rating smallint check (confidence_rating between 1 and 5),
  quality_of_life_rating smallint check (quality_of_life_rating between 1 and 5),
  recommendation_message text not null default '',
  recommendation_rating smallint check (recommendation_rating between 1 and 5),
  would_encourage_patient boolean,
  testimonial_permission text not null check (testimonial_permission in ('yes-named', 'yes-anonymous', 'confidential')),
  wait_time text not null check (wait_time in ('0-5', '10-15', '20-30', 'over-30')),
  provider_time_adequate boolean not null,
  provider_time_comment text not null default '',
  front_desk_rating smallint not null check (front_desk_rating between 1 and 5),
  is_new_patient boolean not null,
  patient_duration text not null check (patient_duration in ('new', 'less-1', '1-4', '5-9', '10-plus')),
  referral_sources text[] not null default '{}',
  referral_other text not null default '',
  exceptional_staff_comment text not null default ''
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

  const serviceLabel = serviceTypeLabel(payload.serviceType, payload.serviceTypeOther);

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("appointment_reviews").insert({
      email: payload.email,
      patient_name: payload.patientName,
      appointment_ease: payload.appointmentEase,
      visit_rating: payload.visitRating,
      provider_and_services: serviceLabel,
      service_type: payload.serviceType,
      service_type_other: payload.serviceTypeOther,
      provider_rating: payload.providerRating,
      health_improvement: payload.healthImprovementComment,
      health_rating: payload.healthRating,
      confidence_rating: payload.confidenceRating,
      quality_of_life_rating: payload.qualityOfLifeRating,
      recommendation_message: payload.recommendationMessage,
      recommendation_rating: payload.recommendationRating,
      would_encourage_patient: payload.wouldEncouragePatient,
      testimonial_permission: payload.testimonialPermission,
      wait_time: payload.waitTime,
      provider_time_adequate: payload.providerTimeAdequate,
      provider_time_comment: payload.providerTimeComment,
      front_desk_rating: payload.frontDeskRating,
      is_new_patient: payload.patientDuration === "new",
      patient_duration: payload.patientDuration,
      referral_sources: payload.referralSources,
      referral_other: payload.referralOther,
      exceptional_staff_comment: payload.exceptionalStaffComment,
    });

    if (error) {
      if (
        /appointment_reviews/i.test(error.message) &&
        /does not exist|schema cache|could not find/i.test(error.message)
      ) {
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

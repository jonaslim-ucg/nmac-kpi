import { createServiceRoleClient } from "@/lib/supabase/admin";
import type { AppointmentReviewPayload } from "@/lib/appointment-review/types";
import type { AppointmentReviewRow } from "@/lib/appointment-review/analytics";

export const APPOINTMENT_REVIEWS_SETUP_SQL = `-- Run in Supabase SQL Editor
create table if not exists public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  appointment_ease smallint not null check (appointment_ease between 1 and 10),
  wait_time text not null,
  visit_rating smallint not null check (visit_rating between 1 and 10),
  provider_time_adequate boolean not null,
  provider_time_comment text not null default '',
  understand_diagnosis boolean not null,
  clinical_care_rating smallint not null check (clinical_care_rating between 1 and 10),
  clinical_care_comment text not null default '',
  front_desk_rating smallint not null check (front_desk_rating between 1 and 10),
  is_patient boolean not null,
  patient_duration text not null,
  exceptional_staff_comment text not null default '',
  improvement_staff_comment text not null default '',
  recommend_likelihood smallint not null check (recommend_likelihood between 1 and 10)
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
      wait_time: payload.waitTime,
      visit_rating: payload.visitRating,
      provider_time_adequate: payload.providerTimeAdequate,
      provider_time_comment: payload.providerTimeComment,
      understand_diagnosis: payload.understandDiagnosis,
      clinical_care_rating: payload.clinicalCareRating,
      clinical_care_comment: payload.clinicalCareComment,
      front_desk_rating: payload.frontDeskRating,
      is_patient: payload.isPatient,
      patient_duration: payload.patientDuration,
      exceptional_staff_comment: payload.exceptionalStaffComment,
      improvement_staff_comment: payload.improvementStaffComment,
      recommend_likelihood: payload.recommendLikelihood,
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

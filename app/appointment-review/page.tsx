import type { Metadata } from "next";
import { AppBrand } from "@/components/dashboard/app-logo";
import { AppointmentReviewForm } from "@/components/appointment-review/appointment-review-form";

export const metadata: Metadata = {
  title: "Appointment Review | NMAC",
  description: "Share feedback about your recent appointment.",
};

export default function AppointmentReviewPage() {
  return (
    <div className="min-h-full py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl px-4">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 border-b border-border pb-6">
            <AppBrand layout="login" />
            <h1 className="mt-6 text-xl font-semibold tracking-tight text-foreground">Appointment review</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your feedback helps us improve. Please take a few minutes to tell us about your recent visit. Questions
              marked with <span className="text-red-600 dark:text-red-400">*</span> are required.
            </p>
          </div>
          <AppointmentReviewForm />
        </div>
      </div>
    </div>
  );
}

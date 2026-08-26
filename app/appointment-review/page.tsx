import type { Metadata } from "next";
import Image from "next/image";
import { AppointmentReviewForm } from "@/components/appointment-review/appointment-review-form";

export const metadata: Metadata = {
  title: "Provider Experience Survey | NMAC",
  description: "Share feedback about your recent visit with NMAC.",
};

type Props = {
  searchParams: Promise<{ t?: string }>;
};

export default async function AppointmentReviewPage({ searchParams }: Props) {
  const params = await searchParams;
  const surveyToken = params.t?.trim() || null;

  return (
    <div className="min-h-full py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl px-4">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 border-b border-border pb-6">
            <div className="flex justify-center">
              <Image
                src="/nmac-email-logo.png"
                alt="Northshore Medical & Aesthetics Center"
                width={2000}
                height={721}
                priority
                className="h-auto w-full max-w-md"
              />
            </div>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">Provider experience survey</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your feedback helps us improve. Please take a few minutes to tell us about your recent visit. Questions
              marked with <span className="text-red-600 dark:text-red-400">*</span> are required.
            </p>
          </div>
          <AppointmentReviewForm surveyToken={surveyToken} />
        </div>
      </div>
    </div>
  );
}

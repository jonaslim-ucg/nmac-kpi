import { redirect } from "next/navigation";

/** Default landing: NMAC master Performance overview (not legacy weekly KPIs). */
export default function HomePage() {
  redirect("/nmac-2026");
}

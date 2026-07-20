export const NK26_VIEWS = [
  "overview",
  "visits",
  "scheduling",
  "finance",
  "calls",
  "threecx",
  "nursing",
  "specialty",
  "compliance",
  "referrals",
] as const;

export type Nk26View = (typeof NK26_VIEWS)[number];

export function isNk26View(s: string): s is Nk26View {
  return (NK26_VIEWS as readonly string[]).includes(s);
}

export function nk26Title(view: string): string {
  switch (view) {
    case "overview":
      return "Performance overview";
    case "visits":
      return "Patient check-outs & exams";
    case "scheduling":
      return "Scheduling & utilization";
    case "finance":
      return "Finance & revenue";
    case "calls":
      return "Call performance";
    case "threecx":
      return "3CX queue performance";
    case "nursing":
      return "Nursing KPIs";
    case "specialty":
      return "Specialty clinics";
    case "compliance":
      return "Compliance & quality";
    case "referrals":
      return "Referral KPI";
    default:
      return "NMAC 2026 KPI";
  }
}

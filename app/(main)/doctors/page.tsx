import { MainShell } from "@/components/dashboard/main-shell";
import { MOCK_DOCTORS } from "@/lib/kpi/data-source";

export default function DoctorsPage() {
  return (
    <MainShell title="Doctors" subtitle="Per-doctor utilization · placeholder list">
      <div className="mx-auto max-w-6xl">
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {MOCK_DOCTORS.map((name) => (
            <li key={name} className="px-4 py-3 text-sm text-foreground/90">{name}</li>
          ))}
        </ul>
      </div>
    </MainShell>
  );
}

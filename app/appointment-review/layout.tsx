/** Escapes the dashboard shell's overflow-hidden so the long form can scroll. */
export default function AppointmentReviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-10 overflow-y-auto overscroll-y-contain bg-background">
      {children}
    </div>
  );
}

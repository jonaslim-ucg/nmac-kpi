export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}

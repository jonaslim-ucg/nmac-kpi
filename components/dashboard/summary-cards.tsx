"use client";

type Card = { label: string; value: string; hint?: string };

export function SummaryCards({ cards }: { cards: Card[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c) => (
        <div key={c.label} className="dashboard-card p-5">
          <span className="dashboard-card-accent" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
          <p className="mt-2 font-mono text-[1.65rem] font-bold leading-none tracking-tight text-card-foreground">
            {c.value}
          </p>
          {c.hint ? (
            <p className="mt-2 text-xs text-muted-foreground">{c.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

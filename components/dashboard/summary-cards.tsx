"use client";

type Card = { label: string; value: string; hint?: string };

export function SummaryCards({ cards }: { cards: Card[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-muted-foreground">{c.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-card-foreground">
            {c.value}
          </p>
          {c.hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";

/** Minimal bar motif — reads as metrics without extra decoration. */
export function AppLogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 20V12M12 20V6M19 20V10"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type AppBrandProps = {
  layout?: "sidebar" | "login";
};

export function AppBrand({ layout = "sidebar" }: AppBrandProps) {
  const isLogin = layout === "login";
  const inner = (
    <>
      <AppLogoMark
        className={
          isLogin
            ? "h-10 w-10 shrink-0 text-foreground"
            : "h-7 w-7 shrink-0 text-foreground/90"
        }
      />
      <div className="min-w-0 leading-tight">
        <p
          className={
            isLogin
              ? "truncate text-xl font-semibold tracking-[-0.04em] text-foreground"
              : "truncate text-[13px] font-semibold tracking-[-0.03em] text-foreground"
          }
        >
          NMAC
        </p>
        <p
          className={
            isLogin
              ? "mt-0.5 truncate text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
              : "truncate text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
          }
        >
          KPI
        </p>
      </div>
    </>
  );

  const className =
    "group flex min-w-0 items-center gap-2.5 rounded-lg outline-none ring-offset-background transition " +
    (isLogin
      ? "pointer-events-none"
      : "hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent/35");

  if (isLogin) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link href="/" className={className} aria-label="NMAC KPI home">
      {inner}
    </Link>
  );
}

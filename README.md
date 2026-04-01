# NMAC KPI Dashboard

Next.js dashboard for weekly KPIs with **Supabase** as the only data source for KPIs and weekly values.

## Setup

1. Install deps:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. In Supabase **SQL Editor**, run in order:

   - [`supabase/schema.sql`](supabase/schema.sql) — tables + RLS  
   - [`supabase/seed.sql`](supabase/seed.sql) — KPI definitions + 2026 weekly sample data (weeks 1–8)

5. Start locally:

```bash
npm run dev
```

## Data model

- **`kpi_definitions`** — KPI metadata and targets (`slug`, `label`, `unit`, `suffix`, `target`, `sort_order`).
- **`kpi_weekly_values`** — Weekly `this_year` / `last_year` by `kpi_slug`, `year`, `week_index`.

Admin **Save** uses `upsert` on `(kpi_slug, year, week_index)`.

## Vercel

Add the same `NEXT_PUBLIC_SUPABASE_*` variables to the project environment, then deploy.

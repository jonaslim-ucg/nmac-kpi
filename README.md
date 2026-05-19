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

3. Fill `.env.local` (see [`.env.example`](.env.example) for all keys):

   - **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Settings → API → service role — server-only, never expose to the browser).
   - **Auth:** `AUTH_SECRET` — at least 32 characters (e.g. `openssl rand -base64 32`).
   - **Optional:** `AUTH_ALLOWED_EMAIL_DOMAINS` (comma-separated, e.g. `ucg.bm`) to restrict sign-in; `AUTH_BOOTSTRAP_ADMIN_EMAILS` for extra admin grants on first signup (after the first user); `BITRIX_ALLOWED_PORTALS` to restrict Bitrix auto sign-in to specific portal hostnames.
   - **Microsoft Graph (email codes):** `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `GRAPH_SENDER_EMAIL` (mailbox that sends mail), `GRAPH_SENDER_NAME` (e.g. `NMAC KPI`). In Azure Entra ID, the app registration needs **Application** permission **Mail.Send** on Microsoft Graph, with **admin consent**.

   **If Outlook still shows the wrong sender name (e.g. “NMAC CRM”):** Microsoft 365 often uses the **mailbox / user display name** from the directory, not only the Graph API. In [Microsoft 365 admin](https://admin.microsoft.com) go to **Users** → open the account for `GRAPH_SENDER_EMAIL` → set **Display name** to **NMAC KPI** (or **Exchange admin center** → **Recipients** → **Mailboxes** → same mailbox → edit display name). Redeploy is not required for that change.

4. In Supabase **SQL Editor**, run in order:

   - [`supabase/schema.sql`](supabase/schema.sql) — KPI tables + NMAC master monthly + NMAC master targets + `app_users` / `auth_otp_codes` + RLS  
   - [`supabase/seed.sql`](supabase/seed.sql) — KPI definitions + 2026 weekly sample data (weeks 1–8)  
   - If your project already had `schema.sql` applied before NMAC monthly storage existed, run [`supabase/nmac-master-monthly.sql`](supabase/nmac-master-monthly.sql) once in the SQL Editor.
   - If `nmac_master_targets` is missing, run [`supabase/nmac-master-targets.sql`](supabase/nmac-master-targets.sql) once.

5. Start locally:

```bash
npm run dev
```

## Data model

- **`kpi_definitions`** — KPI metadata and targets (`slug`, `label`, `unit`, `suffix`, `target`, `sort_order`).
- **`kpi_weekly_values`** — Weekly `this_year` / `last_year` by `kpi_slug`, `year`, `week_index`.
- **`nmac_master_monthly`** — NMAC master dashboard: one row per `year` + `month_index` (0–11). Column `values` is JSON: each KPI id maps to `{ "ty": number, "ly": number }` (this year / last year actuals). Legacy rows with a plain number per id are read as `{ "ty": n }`. Written from **Administration → NMAC master (Supabase)**; charts load that data into the browser when available.
- **`nmac_master_targets`** — One row per `year`, `values` JSON map of NMAC KPI id → numeric **target for this year** (merged with app defaults where omitted). Edited under **Administration → NMAC master (Supabase)**; cached in the browser as `nmac_kpi_targets_2026` for charts.
- **`app_users`** — `email`, optional `first_name` / `last_name` (shown in the UI instead of email when set), and role (`viewer`, `editor`, `admin`). First successful sign-up becomes **admin** when the table was empty; after that, new users default to **viewer** unless listed in `AUTH_BOOTSTRAP_ADMIN_EMAILS` or an admin changes their role under **Users**. If the table already exists without name columns, run [`supabase/add-user-names.sql`](supabase/add-user-names.sql) in the SQL Editor.
- **`auth_otp_codes`** — Short-lived hashed OTP for email sign-in (service role only).

Admin **Save** uses `upsert` on `(kpi_slug, year, week_index)`.

## Sign-in and roles

### Bitrix24 (embedded app)

When NMAC KPI is installed as a **local Bitrix24 application** (iframe), users are signed in automatically:

1. The login page loads the Bitrix JS SDK (`BX24.init` / `getAuth`).
2. `POST /api/auth/bitrix` validates the token with your portal’s `user.current` REST API.
3. The user’s Bitrix **work email** is matched to `app_users` (created on first sign-in with the same rules as email OTP).
4. Session cookie `nmac_session` is set with `SameSite=None; Secure` for iframe use.

**Bitrix app setup**

- **Handler URL:** your deployed app root or `/login` (e.g. `https://your-app.vercel.app/login`).
- The app must be served over **HTTPS** (required for embedded cookies).
- Optional env: `BITRIX_ALLOWED_PORTALS` — comma-separated portal hostnames (e.g. `northshoremedicalcenter.bitrix24.com`). If unset, any valid Bitrix domain is accepted.

Email OTP sign-in still works when Bitrix auth is unavailable (standalone browser) or as a fallback.

### Roles

- **Viewer** — Dashboard and doctors (read-only).
- **Editor** — Can use **Data entry** to save weekly values and **NMAC master (Supabase)** for NMAC targets plus monthly this year / last year actuals.
- **Admin** — Editor capabilities plus **Users** to add users and change roles.

## Vercel

1. In [Supabase](https://supabase.com/dashboard) → your project → **Settings → API**, copy **Project URL**, **anon public**, and **service_role** (secret).
2. In [Vercel](https://vercel.com) → your project → **Settings → Environment Variables**, add every variable from `.env.local` that the app needs, including `AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and the Azure / Graph keys for sending login codes.
3. Enable **Production** (and **Preview** if you use preview URLs) for each variable as appropriate.
4. **Redeploy** after changing variables. `NEXT_PUBLIC_*` values are baked in at build time; server secrets apply at runtime but still require a new deployment when first added.

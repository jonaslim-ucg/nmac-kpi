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
   - **NMAC CRM + survey outreach:** `NMAC_CRM_BASE_URL` (default `https://crm.nmac.bm`), `REPORTS_API_TOKEN`, `APP_BASE_URL=https://kpi.nmac.bm` (public URL for survey links), `SURVEY_OUTREACH_SECRET`, `CRON_SECRET`, optional `SURVEY_FINAL_REMINDER_DAYS` (`14` or `21`), and optional `SURVEY_OUTREACH_TEST_EMAILS` for scheduled test sends. **Patient survey emails are off by default** — set `SURVEY_OUTREACH_LIVE_START_AT` to the approved go-live timestamp before setting the master `SURVEY_OUTREACH_SEND_EMAILS=true`; the in-app **Survey outreach** toggle must also be on. The in-app switch is a global stop: while it is off, neither live nor test survey emails can send. See [`.env.example`](.env.example).
   - **3CX report email import:** add Microsoft Graph **Application** permission **Mail.Read** with admin consent. Set `GRAPH_3CX_REPORT_MAILBOX` to the mailbox that receives the scheduled 3CX report emails. Optional filters: `GRAPH_3CX_SUBJECT_QUERY` (defaults to `3CX`), `GRAPH_3CX_SENDER`, and `GRAPH_3CX_FOLDER` (defaults to `inbox`). Daily automatic checks use `GRAPH_3CX_POLL_TIME_ZONE=Asia/Manila` for the 9:00–11:59 AM polling window, `GRAPH_3CX_DAILY_REPORT_QUERY=DailyDataSending,Daily Data Sending` to match the daily scheduled report, and `GRAPH_3CX_REPORT_TIME_ZONE=Atlantic/Bermuda` when assigning the saved report day.

   **If Outlook still shows the wrong sender name (e.g. “NMAC CRM”):** Microsoft 365 often uses the **mailbox / user display name** from the directory, not only the Graph API. In [Microsoft 365 admin](https://admin.microsoft.com) go to **Users** → open the account for `GRAPH_SENDER_EMAIL` → set **Display name** to **NMAC KPI** (or **Exchange admin center** → **Recipients** → **Mailboxes** → same mailbox → edit display name). Redeploy is not required for that change.

4. In Supabase **SQL Editor**, run in order:

   - [`supabase/schema.sql`](supabase/schema.sql) — KPI tables + NMAC master monthly + NMAC master targets + `app_users` / `auth_otp_codes` + RLS  
   - [`supabase/seed.sql`](supabase/seed.sql) — KPI definitions + 2026 weekly sample data (weeks 1–8)  
   - If your project already had `schema.sql` applied before NMAC monthly storage existed, run [`supabase/nmac-master-monthly.sql`](supabase/nmac-master-monthly.sql) once in the SQL Editor.
   - If `nmac_master_targets` is missing, run [`supabase/nmac-master-targets.sql`](supabase/nmac-master-targets.sql) once.
   - If you see **Could not find the table `public.nmac_master_target_months`**, run [`supabase/nmac-master-target-months.sql`](supabase/nmac-master-target-months.sql) once.
   - For organization-wide Settings (hide legacy nav, sample data, chart cache reset), run [`supabase/app-settings.sql`](supabase/app-settings.sql) once.

5. Start locally:

```bash
npm run dev
```

For local survey reminder testing, keep `SURVEY_OUTREACH_SEND_EMAILS=false` and
`SURVEY_OUTREACH_TEST_EMAILS=kim.ramirez@ucg.bm`. In **Dev → Survey outreach**,
turn on **Local scheduled checks** while testing a scheduled reminder; local
development does not run Vercel Cron in the background.

Before deploying the resilient scheduler, apply
[`supabase/migrations/20260715000000_survey_outreach_reliability.sql`](supabase/migrations/20260715000000_survey_outreach_reliability.sql)
to the NMAC KPI Supabase database. Keep `SURVEY_OUTREACH_SEND_EMAILS=false` (or
unset) and leave the in-app live switch off until patient sending is approved.

## Data model

- **`kpi_definitions`** — KPI metadata and targets (`slug`, `label`, `unit`, `suffix`, `target`, `sort_order`).
- **`kpi_weekly_values`** — Weekly `this_year` / `last_year` by `kpi_slug`, `year`, `week_index`.
- **`nmac_master_monthly`** — NMAC master dashboard: one row per `year` + `month_index` (0–11). Column `values` is JSON: each KPI id maps to `{ "ty": number, "ly": number }` (this year / last year actuals). Legacy rows with a plain number per id are read as `{ "ty": n }`. Written from **Administration → NMAC master (Supabase)**; charts load that data into the browser when available.
- **`nmac_master_targets`** — One row per `year`, `values` JSON map of NMAC KPI id → numeric **target for this year** (merged with app defaults where omitted). Edited under **Administration → NMAC master (Supabase)**; cached in the browser per year as `nmac_kpi_targets_<year>` for charts.
- **`app_users`** — `email`, optional `first_name` / `last_name` (shown in the UI instead of email when set), and role (`viewer`, `editor`, `admin`).
- **`app_settings`** — Single row (`id = default`): organization-wide `hide_legacy_nav`, `use_nmac_test_data`, and `nmac_month_cache_revision` (any signed-in user can change; all accounts see the same values). First successful sign-up becomes **admin** when the table was empty; after that, new users default to **viewer** unless listed in `AUTH_BOOTSTRAP_ADMIN_EMAILS` or an admin changes their role under **Users**. If the table already exists without name columns, run [`supabase/add-user-names.sql`](supabase/add-user-names.sql) in the SQL Editor.
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

## 3CX email import

In **Developer → 3CX import**, use **Fetch email** to pull the newest matching scheduled 3CX report for the selected month and week-of-month range. Use **Import CSV** to manually upload the same 3CX report format. The importer reads CSV/text-style 3CX queue performance exports and stores queue + extension rows in the `threecx_queue_report_*` tables by report start/end date. Daily scheduled imports, weekly imports, and the full-month roll-up update these NMAC call KPIs:

- Incoming Calls
- Total Answered Calls
- Total Missed/Abandoned Calls
- Telephone Calls Answered

Use the month bar plus week selector for the full month, first week, second week, third week, or fourth/last week. The email path searches messages received inside that selected date window. Successful and failed imports are logged under **Developer → 3CX import** and the general **Developer → Activity** page.

The deployed app also has a daily 3CX email cron at `/api/integrations/3cx/import-email/cron`. Vercel calls it every 15 minutes during the 9, 10, and 11 AM hours in Philippine time, so the usual 10:00 AM email is picked up even if delivery is a few minutes late. The cron searches the configured mailbox for matching 3CX CSV/text attachments received in that Philippine-time window, requires the daily report label (`DailyDataSending` / `Daily Data Sending` by default), then saves the report as a one-day import using the email received date in the 3CX report timezone (`Atlantic/Bermuda` by default). Repeated checks are safe because imports and report rows are upserted by report date, queue, and attachment hash.

## Vercel

1. In [Supabase](https://supabase.com/dashboard) → your project → **Settings → API**, copy **Project URL**, **anon public**, and **service_role** (secret).
2. In [Vercel](https://vercel.com) → your project → **Settings → Environment Variables**, add every variable from `.env.local` that the app needs, including `AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, the Azure / Graph keys for sending login codes, and for survey outreach: `REPORTS_API_TOKEN`, `APP_BASE_URL`, `SURVEY_OUTREACH_SECRET`, `CRON_SECRET`, and `SURVEY_OUTREACH_TEST_EMAILS=kim.ramirez@ucg.bm` while testing. Leave **`SURVEY_OUTREACH_SEND_EMAILS` unset or `false`** until you are ready to email patients. At go-live, set **`SURVEY_OUTREACH_LIVE_START_AT`** to the approved timestamp first, set **`SURVEY_OUTREACH_SEND_EMAILS=true`**, then use the in-app **Survey outreach** toggle to turn live sending on/off. Production emails will only sync/send visits at or after the cutoff.
3. Enable **Production** (and **Preview** if you use preview URLs) for each variable as appropriate.
4. **Redeploy** after changing variables. `NEXT_PUBLIC_*` values are baked in at build time; server secrets apply at runtime but still require a new deployment when first added.

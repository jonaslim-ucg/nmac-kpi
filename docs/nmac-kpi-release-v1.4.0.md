# NMAC KPI — Release v1.4.0

## Release note (what users see)

**Headline:** Role-based Master KPI access, custom roles, maintenance mode, and activity logging

**Body:** Admins can control which **Master KPI pages** each role sees and **create custom roles** with their own access. Developers get a private **Developer** section with **maintenance mode** and a full **activity log** that records sign-ins, KPI saves, and admin changes — including what was **added, changed, or removed**. Only **Developers** can assign the Developer role.

---

## Changelog

- **new** — Master KPI access by role — choose which pages Viewer, Editor, and custom roles can open
- **new** — Custom roles — create roles with their own Master KPI page access and optional KPI edit permission
- **new** — Maintenance mode — block Viewers and Editors while Admins and Developers keep access
- **new** — Activity log — automatic tracking of sign-ins, KPI saves, and admin changes (Developer → Activity)
- **new** — Detailed data entry logs — expand a row to see what KPI values were added, changed, or removed
- **improved** — Developer role has full admin access and a private Developer section in the sidebar
- **improved** — Only Developers can assign or change the Developer role — Admins cannot
- **improved** — Renamed Dev to Developer across the app for clearer role labels

---

## CSV import

**Import file:** `docs/nmac-kpi-release-import-v1.4.0.csv`

**Template:** one row per changelog item; `release_summary` and `release_details` on the first row only. Quote any field that contains commas.

---

## Database setup (one-time)

Run these in Supabase SQL Editor if not already applied:

- `supabase/add-dev-logs.sql` — activity logging
- `supabase/add-role-nmac-nav.sql` — per-role Master KPI access
- `supabase/add-maintenance-mode.sql` — maintenance mode flag
- `supabase/add-custom-roles.sql` — custom roles support

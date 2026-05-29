# NMAC KPI — Release v1.1.0

## Release note (what users see)

**Headline:** Reporting KPIs on Performance overview, monthly actuals search, and editor guide

**Body:** Stakeholder-requested KPIs are now featured at the top of Performance overview with stat cards and monthly charts. Monthly data entry includes search on the Monthly actuals tab. An editor PDF guide is available for teams entering their own numbers.

---

## Changelog (bullet list)

- **feature** — Four priority metrics on Performance overview
- **feature** — Ave Patient Satisfaction Score
- **feature** — % Copay Collection Rate on Performance overview
- **improvement** — Doctor Utilisation — all rostered providers
- **feature** — % Patients Completing Feedback
- **feature** — Search on Monthly actuals
- **improvement** — Editor guide PDF for data entry team
- **fix** — Performance overview layout — full-width priority metrics
- **improvement** — Overview trend chart includes new reporting KPIs

---

## CSV import format

The import file uses **one row per changelog bullet**. Release-level text is repeated on every row:

| Column | Purpose | Same on every row? |
|--------|---------|-------------------|
| `version` | e.g. `v1.1.0` | Yes |
| `app_slug` | `nmac-kpi` | Yes |
| `summary` | **Release note headline** | Yes — copy onto every row |
| `body` | **Release note paragraph** | Yes — copy onto every row |
| `change_type` | `feature`, `fix`, `improvement`, or `breaking` | No — per bullet |
| `change_title` | **Changelog bullet title** | No — one per row |

**Import file:** `/Users/joanslim/Downloads/nmac-kpi-release-import.csv`

**Template:** `/Users/joanslim/Downloads/nmac-kpi-release-import-template.csv`

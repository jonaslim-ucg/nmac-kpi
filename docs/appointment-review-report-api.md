# Appointment review report API

`GET /api/admin/appointment-reviews` returns the complete survey-results report. It accepts either a logged-in session for a user who can access **Survey results**, or a server-to-server bearer key.

## Server-to-server authentication

Generate a secret and save it as `APPOINTMENT_REPORTS_API_KEY` in the KPI deployment environment:

```bash
openssl rand -hex 32
```

Redeploy after adding the environment variable, then call the endpoint with the same value:

```bash
curl --get 'https://kpi.nmac.bm/api/admin/appointment-reviews' \
  --header 'Authorization: Bearer YOUR_APPOINTMENT_REPORTS_API_KEY' \
  --data-urlencode 'dateStart=2026-07-01' \
  --data-urlencode 'dateEnd=2026-07-22'
```

Use a dedicated secret for this endpoint. Do not reuse `REPORTS_API_TOKEN`, which authenticates requests from this app to the CRM.

## Date filters

- `dateStart=YYYY-MM-DD` — optional, inclusive clinic-calendar start date.
- `dateEnd=YYYY-MM-DD` — optional, inclusive clinic-calendar end date.
- `startDate` and `endDate` are accepted as aliases.
- Existing `range=quarter` and `days=30`/`days=90` filters remain supported.

Examples:

```text
/api/admin/appointment-reviews?dateStart=2026-07-01&dateEnd=2026-07-22
/api/admin/appointment-reviews?range=quarter
/api/admin/appointment-reviews?days=30
```

Date-only boundaries use the NMAC clinic timezone (`Atlantic/Bermuda`). Responses are selected by submission time. Sent/provider figures are selected by the initial survey email's sent time.

## Response fields

```json
{
  "ready": true,
  "dateStart": "2026-07-01",
  "dateEnd": "2026-07-22",
  "numberSent": 120,
  "numberResponses": 54,
  "stats": {},
  "providers": [
    {
      "providerName": "Brown, Kyjuan",
      "appointmentCount": 31,
      "surveySentCount": 28,
      "responseCount": 14,
      "appointmentCountEstimated": false
    }
  ],
  "appointments": [],
  "reviews": []
}
```

- `stats` contains every aggregate displayed on the survey overview dashboard.
- `reviews` contains all matching survey submissions, not only the first 500.
- `providers` gives appointment, sent-survey, and response counts per provider.
- `appointments` gives the provider count and provider mapping for every sent survey appointment group.
- `appointmentCountEstimated` or `providerMappingComplete: false` identifies legacy grouped records created before the appointment/provider mapping migration.

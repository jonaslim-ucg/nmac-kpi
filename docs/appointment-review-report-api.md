# Appointment review report API

`GET /api/admin/appointment-reviews` returns the complete survey-results report for an authenticated user who can access **Survey results**.

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

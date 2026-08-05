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
- `includeTests=true` includes test outreach and its linked responses. It defaults to `false`.

Examples:

```text
/api/admin/appointment-reviews?dateStart=2026-07-01&dateEnd=2026-07-22
/api/admin/appointment-reviews?dateStart=2026-07-01&dateEnd=2026-07-22&includeTests=true
/api/admin/appointment-reviews?range=quarter
/api/admin/appointment-reviews?days=30
```

Date-only boundaries use the NMAC clinic timezone (`Atlantic/Bermuda`). The report applies the same date rules as the Survey Results dashboard:

- Initial-survey, repeat-send, failed-initial, provider appointment, and checkout KPIs are selected by the appointment/checkout date.
- Responses and response analytics are selected by survey submission time.
- The all-stage delivery-failure fields are selected by the time the failure or bounce was recorded.

This means an initial survey sent on July 25 for a July 24 checkout is counted under July 24. Known failed or bounced initial messages are excluded from successful-send totals.

## Response fields

```json
{
  "ready": true,
  "dateStart": "2026-07-01",
  "dateEnd": "2026-07-22",
  "includeTests": false,
  "dateBasis": {
    "initialSurveyKpis": "appointment_date",
    "providerAppointmentsAndSends": "appointment_date",
    "dailyCheckouts": "appointment_date",
    "responses": "submitted_at",
    "deliveryFailureEvents": "failure_event_at"
  },
  "kpis": {
    "appointmentCheckouts": 142,
    "initialSurveyAttempts": 126,
    "initialSurveysSent": 120,
    "uniqueInitialRecipients": 116,
    "repeatInitialSends": 4,
    "failedInitialSends": 6,
    "bouncedInitialSends": 5,
    "permanentInitialFailures": 1,
    "totalResponses": 54
  },
  "numberCheckouts": 142,
  "numberInitialSurveyAttempts": 126,
  "numberSent": 120,
  "numberUniqueInitialRecipients": 116,
  "numberRepeatInitialSends": 4,
  "numberFailedInitialSends": 6,
  "numberBouncedInitialSends": 5,
  "numberPermanentInitialFailures": 1,
  "numberResponses": 54,
  "dailyCheckouts": [
    { "date": "2026-07-21", "count": 49 },
    { "date": "2026-07-22", "count": 93 }
  ],
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

- `stats` contains the response-rating and questionnaire aggregates displayed on the survey overview dashboard.
- `kpis` is the preferred summary for survey appointment KPIs. The corresponding top-level `number*` fields remain available for existing integrations.
- `initialSurveyAttempts` is the total of successful initial sends, bounced initial sends, and permanent pre-send initial failures.
- `initialSurveysSent` includes repeat visits but excludes every known failed or bounced initial message.
- `uniqueInitialRecipients` counts normalized recipient addresses after failed messages are excluded.
- `repeatInitialSends` counts additional successful initial sends to an address already represented in the selected appointment-date period.
- `failedInitialSends` includes both known initial-message bounces and permanent initial failures rejected before delivery.
- `dailyCheckouts` contains the CRM checked-out appointment count for each appointment date; `appointmentCheckouts` is its total.
- `numberFailedEmails`, `numberBounceReports`, and `numberPermanentSendFailures` remain available for all-stage delivery monitoring and use failure-event dates rather than appointment dates.
- `reviews` contains all matching survey submissions, not only the first 500.
- `providers` gives appointment, successfully sent initial-survey, and response counts per provider. Known failed initial deliveries are excluded from `surveySentCount`.
- `appointments` gives the provider count and provider mapping for every sent survey appointment group.
- `appointments[].initialDeliveryStatus` is `successful`, `failed`, or `not_sent`.
- `appointmentCountEstimated` or `providerMappingComplete: false` identifies legacy grouped records created before the appointment/provider mapping migration.
- A response submitted without an outreach token produces a `source: "response"` appointment inferred from its selected providers. It has no CRM appointment ID or sent-email timestamp, and its provider appointment count is marked as estimated.

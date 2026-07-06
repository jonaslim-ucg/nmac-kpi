#!/usr/bin/env python3
"""Send one apology email per suppressed survey recipient. Safe to re-run."""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SUBJECT = "Please disregard our recent survey email — sent in error"

BODY_TEMPLATE = """Dear {first_name},

We are writing to let you know that the email you recently received from Northshore Medical & Aesthetics Center (NMAC) asking you to complete a visit survey was sent in error while our team was testing a new patient feedback system.

Please disregard that message. You do not need to complete the survey, and no further emails related to this test should be sent to you.

We sincerely apologize for any confusion or inconvenience this may have caused, especially if you received the message more than once.

Thank you for your understanding.

Kind regards,
Northshore Medical & Aesthetics Center"""


def load_env(path: Path) -> None:
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key, val)


def first_name(patient_name):
    if not patient_name:
        return "Patient"
    parts = [p.strip() for p in patient_name.split(",")]
    if len(parts) >= 2 and parts[1]:
        return parts[1].split()[0]
    return parts[0]


def supabase_request(method: str, path: str, body=None, prefer=None):
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as res:
        raw = res.read().decode()
        return json.loads(raw) if raw else None


def graph_token() -> str:
    body = urllib.parse.urlencode({
        "client_id": os.environ["AZURE_CLIENT_ID"],
        "client_secret": os.environ["AZURE_CLIENT_SECRET"],
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }).encode()
    url = f"https://login.microsoftonline.com/{os.environ['AZURE_TENANT_ID']}/oauth2/v2.0/token"
    req = urllib.request.Request(url, data=body, method="POST")
    with urllib.request.urlopen(req) as res:
        data = json.load(res)
    token = data.get("access_token")
    if not token:
        raise RuntimeError(data.get("error_description", "Graph token failed"))
    return token


def send_mail(token: str, to: str, subject: str, text: str) -> None:
    sender = os.environ["GRAPH_SENDER_EMAIL"]
    sender_name = os.environ.get("GRAPH_SENDER_NAME", "NMAC KPI")
    url = f"https://graph.microsoft.com/v1.0/users/{urllib.parse.quote(sender)}/sendMail"
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "Text", "content": text},
            "from": {"emailAddress": {"address": sender, "name": sender_name}},
            "sender": {"emailAddress": {"address": sender, "name": sender_name}},
            "toRecipients": [{"emailAddress": {"address": to}}],
        },
        "saveToSentItems": True,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as res:
            pass
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Graph {e.code}: {e.read().decode()[:500]}")


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    load_env(Path(__file__).resolve().parents[1] / ".env")

    if not dry_run and os.environ.get("SURVEY_APOLOGY_SEND_ENABLED", "").strip().lower() != "true":
        print("STOPPED: SURVEY_APOLOGY_SEND_ENABLED is not true. No emails sent.")
        return 1

    pending = supabase_request(
        "GET",
        "survey_email_suppressions?select=id,patient_email&apology_sent_at=is.null&order=patient_email.asc",
    )
    print(f"Pending apologies: {len(pending)}")
    if dry_run:
        print("Dry run — exiting without sends.")
        return 0

    token = graph_token()
    sent = 0
    failed = []

    for i, row in enumerate(pending, 1):
        email = row["patient_email"].strip().lower()
        sid = row["id"]
        try:
            outreach = supabase_request(
                "GET",
                f"survey_outreach?select=patient_name&patient_email=ilike.{urllib.parse.quote(email)}"
                "&initial_sent_at=not.is.null&order=initial_sent_at.desc&limit=1",
            )
            name = outreach[0]["patient_name"] if outreach else None
            body = BODY_TEMPLATE.format(first_name=first_name(name))
            send_mail(token, email, SUBJECT, body)
            supabase_request(
                "PATCH",
                f"survey_email_suppressions?id=eq.{sid}",
                {"apology_sent_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                prefer="return=minimal",
            )
            sent += 1
            if i % 25 == 0:
                print(f"  sent {i}/{len(pending)}…")
            time.sleep(0.25)
        except Exception as e:
            failed.append({"email": email, "error": str(e)})

    print(json.dumps({"sent": sent, "failed": len(failed), "failures": failed[:10]}, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

import assert from "node:assert/strict";
import test from "node:test";

import {
  bounceDiagnostic,
  bounceReason,
  bounceRecipient,
  bounceStatusCode,
  isHardBounce,
  originalInternetMessageId,
  originalSubjectFromNdr,
  surveyStageFromSubject,
} from "../../lib/survey-outreach/bounce-parser.ts";

test("parses an Outlook unknown-recipient NDR", () => {
  const preview = [
    "Your message to missing.patient@example.com couldn't be delivered.",
    "missing.patient wasn't found at example.com.",
  ].join("\n");
  const body = `${preview}\nRemote Server returned '550 5.1.10 RESOLVER.ADR.RecipientNotFound'`;

  assert.equal(bounceRecipient(body, preview), "missing.patient@example.com");
  assert.equal(bounceStatusCode(body), "5.1.10");
  assert.equal(bounceReason(body, preview), "Recipient address was not found.");
  assert.match(bounceDiagnostic(body), /5\.1\.10/);
  assert.equal(isHardBounce("5.1.10", body), true);
});

test("uses the NDR reply reference to identify the original message", () => {
  assert.equal(
    originalInternetMessageId([
      { name: "Message-ID", value: "<ndr@example.com>" },
      { name: "In-Reply-To", value: "<original-message@example.com>" },
    ]),
    "<original-message@example.com>",
  );
});

test("maps every survey subject to its stage", () => {
  assert.equal(surveyStageFromSubject("How was your recent visit to NMAC?"), "initial");
  assert.equal(surveyStageFromSubject("How were your recent visits to NMAC?"), "initial");
  assert.equal(surveyStageFromSubject("Survey answers needed: Reminder about your NMAC visit"), "reminder1");
  assert.equal(surveyStageFromSubject("Survey answers needed: Second reminder about your NMAC visit"), "reminder2");
  assert.equal(surveyStageFromSubject("Survey answers needed: Final reminder about your NMAC visit"), "final");
  assert.equal(surveyStageFromSubject("Automatic reply"), null);
});

test("removes only the Outlook undeliverable prefix", () => {
  assert.equal(
    originalSubjectFromNdr("Undeliverable: Survey answers needed: Reminder about your NMAC visit"),
    "Survey answers needed: Reminder about your NMAC visit",
  );
});

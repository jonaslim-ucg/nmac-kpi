import assert from "node:assert/strict";
import test from "node:test";
import {
  SERVICE_TYPE_OPTIONS,
  areProviderRatingsComplete,
  areServiceTypesComplete,
  averageProviderRatings,
  serviceTypesLabel,
} from "../../lib/appointment-review/types.ts";

test("requires at least one provider", () => {
  assert.equal(areServiceTypesComplete([], ""), false);
});

test("accepts several named providers", () => {
  assert.equal(
    areServiceTypesComplete(["dr-brown-kyjuan", "dr-estwick-paula"], ""),
    true,
  );
  assert.equal(
    serviceTypesLabel(["dr-brown-kyjuan", "dr-estwick-paula"], ""),
    "Dr. Kyjuan Brown, Dr. Paula Estwick",
  );
});

test("requires details when Other Providers is selected", () => {
  assert.equal(areServiceTypesComplete(["other"], ""), false);
  assert.equal(areServiceTypesComplete(["other"], "Dr. Example"), true);
});

test("lists phlebotomy and ultrasound providers directly before Other Providers", () => {
  assert.deepEqual(SERVICE_TYPE_OPTIONS.slice(-3), [
    { value: "phlebotomist-lab-appointment", label: "Phlebotomist Lab Appointment" },
    { value: "ultrasound-technician", label: "Ultrasound Technician" },
    { value: "other", label: "Other Providers" },
  ]);
  assert.equal(
    serviceTypesLabel(["phlebotomist-lab-appointment", "ultrasound-technician"], ""),
    "Phlebotomist Lab Appointment, Ultrasound Technician",
  );
});

test("requires a rating for each non-doctor provider", () => {
  assert.equal(
    areProviderRatingsComplete(
      ["phlebotomist-lab-appointment", "ultrasound-technician"],
      { "phlebotomist-lab-appointment": 5 },
    ),
    false,
  );
  assert.equal(
    areProviderRatingsComplete(
      ["phlebotomist-lab-appointment", "ultrasound-technician"],
      {
        "phlebotomist-lab-appointment": 5,
        "ultrasound-technician": 4,
      },
    ),
    true,
  );
});

test("requires an individual score for every selected provider", () => {
  const providers = ["dr-brown-kyjuan", "dr-estwick-paula"] as const;
  assert.equal(
    areProviderRatingsComplete([...providers], { "dr-brown-kyjuan": 5 }),
    false,
  );
  assert.equal(
    areProviderRatingsComplete([...providers], {
      "dr-brown-kyjuan": 5,
      "dr-estwick-paula": 3,
    }),
    true,
  );
  assert.equal(
    averageProviderRatings([...providers], {
      "dr-brown-kyjuan": 5,
      "dr-estwick-paula": 3,
    }),
    4,
  );
});

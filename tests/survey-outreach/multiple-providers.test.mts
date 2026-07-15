import assert from "node:assert/strict";
import test from "node:test";
import {
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

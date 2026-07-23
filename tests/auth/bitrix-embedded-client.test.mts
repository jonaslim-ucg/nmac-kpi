import assert from "node:assert/strict";
import test from "node:test";
import { hasBitrixEmbedSignals } from "../../lib/bitrix/embedded-client.ts";

test("does not treat an ordinary iframe as a Bitrix embed without Bitrix signals", () => {
  assert.equal(
    hasBitrixEmbedSignals({
      referrer: "https://app.example.com/workspace",
      search: "",
    }),
    false,
  );
});

test("recognizes a Bitrix24 parent referrer", () => {
  assert.equal(
    hasBitrixEmbedSignals({
      referrer: "https://nmac.bitrix24.com/workgroups/group/1/",
      search: "",
    }),
    true,
  );
});

test("recognizes Bitrix DOMAIN query parameters case-insensitively", () => {
  assert.equal(
    hasBitrixEmbedSignals({
      referrer: "",
      search: "?domain=nmac.bitrix24.com&PLACEMENT=DEFAULT",
    }),
    true,
  );
});

test("recognizes an already-loaded Bitrix SDK", () => {
  assert.equal(
    hasBitrixEmbedSignals({
      referrer: "",
      search: "",
      hasBitrixSdk: true,
    }),
    true,
  );
});

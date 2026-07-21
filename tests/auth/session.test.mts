import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import {
  signSessionToken,
  verifySessionToken,
  verifySessionTokenEdge,
} from "../../lib/auth/session-token.ts";
import { isAppRole } from "../../lib/auth/role-id.ts";

const TEST_SECRET = "custom-role-session-test-secret-32-characters";

test("accepts built-in and custom role ids", () => {
  for (const role of ["viewer", "editor", "admin", "dev", "editor_2", "front_desk_manager"]) {
    assert.equal(isAppRole(role), true, role);
  }

  for (const role of [null, 7, "", " ", "_editor", "Editor", "editor-role"]) {
    assert.equal(isAppRole(role), false, String(role));
  }
});

test("round-trips a custom role through both session verifiers", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = TEST_SECRET;

  try {
    const expected = {
      sub: "user-123",
      email: "susete@example.com",
      role: "editor_2",
    };
    const token = await signSessionToken(expected);

    assert.deepEqual(await verifySessionToken(token), expected);
    assert.deepEqual(await verifySessionTokenEdge(token, TEST_SECRET), expected);
    assert.equal(
      await verifySessionTokenEdge(token, "different-test-secret-at-least-32-characters"),
      null,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test("rejects malformed role claims", async () => {
  const token = await new SignJWT({ email: "susete@example.com", role: "Editor+" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-123")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(TEST_SECRET));

  assert.equal(await verifySessionTokenEdge(token, TEST_SECRET), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { issueLoginToken, readLoginToken, isAllowedEmail, safeNext, loginFromRequest, LOGIN_COOKIE } from "../src/lib/auth/rdcLogin";

process.env.ADMIN_JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";

test("a session token round-trips and rejects tampering", () => {
  const token = issueLoginToken("asha@rdc.in", "Asha Example");
  assert.equal(readLoginToken(token)?.email, "asha@rdc.in");
  const [payload, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({email: "boss@rdc.in", name: "x", exp: Date.now() + 1e9})).toString("base64url");
  assert.equal(readLoginToken(`${forged}.${signature}`), null);
  assert.equal(readLoginToken(`${payload}.${signature}x`), null);
  assert.equal(readLoginToken("garbage"), null);
  assert.equal(readLoginToken(null), null);
});

test("only company addresses are let in", () => {
  assert.equal(isAllowedEmail("asha@rdc.in"), true);
  assert.equal(isAllowedEmail("ASHA@RDC.IN"), true);
  assert.equal(isAllowedEmail("asha@gmail.com"), false);
  assert.equal(isAllowedEmail("asha@rdc.in.evil.com"), false);
  assert.equal(isAllowedEmail("asha@notrdc.in"), false);
  // A token for an outside address is refused even if correctly signed.
  assert.equal(readLoginToken(issueLoginToken("asha@gmail.com", "x")), null);
});

test("after sign-in the visitor only lands inside this app", () => {
  assert.equal(safeNext("/?open=1"), "/?open=1");
  assert.equal(safeNext("//evil.example"), "/?open=1");
  assert.equal(safeNext("https://evil.example"), "/?open=1");
  assert.equal(safeNext("/\\evil.example"), "/?open=1");
  assert.equal(safeNext(null), "/?open=1");
});

test("the visitor is read from the request cookie", () => {
  const token = issueLoginToken("ravi@rdc.in", "Ravi");
  const req = new Request("https://hr.rdcc.ai/chatbot/api/chat", {headers: {cookie: `other=1; ${LOGIN_COOKIE}=${token}`}});
  assert.equal(loginFromRequest(req)?.email, "ravi@rdc.in");
  assert.equal(loginFromRequest(new Request("https://hr.rdcc.ai/chatbot/api/chat")), null);
});

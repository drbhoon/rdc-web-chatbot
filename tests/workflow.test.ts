import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { exportReview, parseReview } from "../src/lib/knowledge/reviewWorkbook";
import { issueAdminToken, requireAdmin } from "../src/lib/admin/auth";

test("Excel export preserves questions as text and requires explicit publication", async () => {
  const buffer = await exportReview([{id: "q1", question: '=HYPERLINK("https://example.com")', language: "en", reason: "insufficient_knowledge", occurrences: 2, answer: null, version: 1}]);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer as never);
  const sheet = book.getWorksheet("Questions")!;
  assert.equal(sheet.getCell("B3").type, ExcelJS.ValueType.String);
  await assert.rejects(parseReview(buffer as unknown as ArrayBuffer), /at least one/);
  sheet.getCell("F3").value = "Approved factual answer"; sheet.getCell("G3").value = "YES";
  const data = await book.xlsx.writeBuffer();
  assert.deepEqual(await parseReview(data as unknown as ArrayBuffer), [{id: "q1", answer: "Approved factual answer", version: 1}]);
  sheet.getCell("F3").value = {formula: "1+1", result: 2};
  await assert.rejects(parseReview(await book.xlsx.writeBuffer() as unknown as ArrayBuffer), /plain text/);
});
test("Admin authentication rejects default, tampered and expired credentials", () => {
  process.env.ADMIN_JWT_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
  const token = issueAdminToken();
  const request = (value: string) => new Request("https://test.invalid", {headers: {"x-admin-token": value}});
  assert.equal(requireAdmin(request(token)), true);
  assert.equal(requireAdmin(request("rdc_admin_token")), false);
  assert.equal(requireAdmin(request(token + "x")), false);
  assert.equal(requireAdmin(request(process.env.ADMIN_JWT_SECRET)), false);
});

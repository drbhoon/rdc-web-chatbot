import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { exportReview, parseReview } from "../src/lib/knowledge/reviewWorkbook";
import { issueAdminToken, requireAdmin } from "../src/lib/admin/auth";

test("Excel export preserves questions as text and requires explicit publication", async () => {
  const buffer = await exportReview([{id: "q1", question: '=HYPERLINK("https://example.com")', language: "en", occurrences: 2, answer: null, version: 1, askedOn: "2026-09-27", botAnswer: "TARA's reply"}]);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer as never);
  const sheet = book.getWorksheet("Questions")!;
  assert.equal(sheet.getCell("D3").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("F3").text, "TARA's reply");
  await assert.rejects(parseReview(buffer as unknown as ArrayBuffer), /at least one/);
  sheet.getCell("G3").value = "Approved factual answer"; sheet.getCell("H3").value = "YES";
  const data = await book.xlsx.writeBuffer();
  assert.deepEqual(await parseReview(data as unknown as ArrayBuffer), [{id: "q1", answer: "Approved factual answer", version: 1}]);
  sheet.getCell("G3").value = {formula: "1+1", result: 2};
  await assert.rejects(parseReview(await book.xlsx.writeBuffer() as unknown as ArrayBuffer), /plain text/);
});

test("sheets exported before the daily-sheet change still import", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Questions");
  sheet.addRow(["old instructions"]);
  sheet.addRow(["ID", "Question", "Language", "Reason", "Times asked", "Answer", "Publish", "Version"]);
  sheet.addRow(["q9", "Old question", "en", "insufficient_knowledge", 1, "Old-format answer", "YES", 3]);
  assert.deepEqual(await parseReview(await book.xlsx.writeBuffer() as unknown as ArrayBuffer), [{id: "q9", answer: "Old-format answer", version: 3}]);
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

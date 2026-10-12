import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";

// An in-memory stand-in for the employee_otps table, enough for the directory's queries.
type Row = Record<string, unknown> & { id: string };
const rows: Row[] = [];
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, want]) => {
    const have = row[key];
    if (want instanceof Date) return have instanceof Date && have.getTime() === want.getTime();
    if (want && typeof want === "object") {
      const w = want as { gt?: Date; gte?: Date; not?: unknown };
      if (w.gt) return have instanceof Date && have > w.gt;
      if (w.gte) return have instanceof Date && have >= w.gte;
      if ("not" in w) return have !== undefined && have !== w.not;
    }
    return (have ?? null) === want;
  });
}
const sortBy = (list: Row[], orderBy?: Record<string, "asc" | "desc">) => {
  const [key] = Object.keys(orderBy ?? {});
  return key ? [...list].sort((a, b) => ((b[key] as Date)?.getTime() ?? 0) - ((a[key] as Date)?.getTime() ?? 0)) : list;
};
let clock = Date.now();
const employeeOtp = {
  findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc"> }) =>
    sortBy(rows.filter((r) => matches(r, where)), orderBy)[0] ?? null,
  count: async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => matches(r, where)).length,
  create: async ({ data }: { data: Record<string, unknown> }) => {
    const row: Row = { id: `otp-${rows.length + 1}`, email: null, codeHash: null, verifiedAt: null, attempts: 0, createdAt: new Date(clock++), ...data };
    rows.push(row);
    return row;
  },
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.find((r) => r.id === where.id)!;
    for (const [key, value] of Object.entries(data)) {
      const inc = (value as { increment?: number })?.increment;
      row[key] = inc !== undefined ? (row[key] as number) + inc : value;
    }
    return row;
  },
};
(globalThis as unknown as { prisma: unknown }).prisma = { employeeOtp };

// The code e-mail is caught here instead of being sent.
const sent: Array<{ to: string; text: string }> = [];
(nodemailer as unknown as { createTransport: () => unknown }).createTransport = () => ({
  sendMail: async (mail: { to: string; text: string }) => { sent.push(mail); },
});
Object.assign(process.env, { SMTP_HOST: "smtp.test", SMTP_USER: "noreply@rdc.in", SMTP_PASS: "x", SMTP_FROM: "noreply@rdc.in" });

const NAMES = ["Asha Example", "Ravi Sample", "Meena Demo", "Kiran Trial", "Sunil Mock", "Leela Pilot", "Arjun Draft", "Nisha Proof", "Vikram Model", "Pooja Probe", "Rohan Extra"];

test("employee details always need an e-mailed code, and one code opens 10 lookups", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tara-employees-"));
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Employees");
  sheet.addRow(["Employee Name", "Designation", "City"]);
  for (const name of NAMES) sheet.addRow([name, "Engineer", "Mumbai"]);
  process.env.EMPLOYEE_EXCEL_PATH = path.join(dir, "employees.xlsx");
  await book.xlsx.writeFile(process.env.EMPLOYEE_EXCEL_PATH);

  const { handleEmployeeDirectoryMessage: ask } = await import("../src/lib/employee/directory");
  const chat = "chat-1";

  // No details before the code, whoever asks.
  const first = await ask("Tell me about Asha Example", chat);
  assert.equal(first.eventType, "employee_lookup_requested");
  assert.doesNotMatch(first.message!, /Engineer/);

  const mailed = await ask("my id is tester@rdc.in", chat);
  assert.equal(mailed.eventType, "employee_otp_sent");
  const code = sent.at(-1)!.text.match(/\d{6}/)![0];
  assert.equal(sent.at(-1)!.to, "tester@rdc.in");

  const wrong = await ask(code === "111111" ? "222222" : "111111", chat);
  assert.equal(wrong.eventType, "employee_otp_failed");

  const verified = await ask(code, chat);
  assert.equal(verified.eventType, "employee_lookup_completed");
  assert.match(verified.message!, /Asha Example[\s\S]*Engineer[\s\S]*Lookups left with this verification: 9\./);

  for (const [n, name] of NAMES.slice(1, 10).entries()) {
    const reply = await ask(`Tell me about ${name}`, chat);
    assert.equal(reply.eventType, "employee_lookup_completed", name);
    assert.match(reply.message!, new RegExp(`Lookups left with this verification: ${8 - n}\\.`));
  }

  // The 11th needs a new code.
  const eleventh = await ask("Tell me about Rohan Extra", chat);
  assert.equal(eleventh.eventType, "employee_lookup_limit_reached");
  assert.doesNotMatch(eleventh.message!, /Engineer/);

  // Another chat starts from nothing.
  assert.equal((await ask("Tell me about Rohan Extra", "chat-2")).eventType, "employee_lookup_requested");
});

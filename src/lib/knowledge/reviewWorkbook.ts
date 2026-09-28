import ExcelJS from "exceljs";

/**
 * The review workbook: questions customers asked, what the bot answered, and a
 * column for RDC's refined answer. The same sheet serves the daily e-mail and
 * the Admin download, and comes back through Admin > Upload.
 *
 * Columns are found by their header, not their position, so a reviewer who
 * inserts a note column does not publish the wrong cell.
 */
export interface ReviewRow {
  id: string;
  question: string;
  language: string;
  occurrences: number;
  answer: string | null;
  version: number;
  askedOn?: string;
  botAnswer?: string | null;
}

const HEADERS = ["ID", "Asked on", "Language", "Question", "Times asked", "TARA's answer", "Refined answer", "Publish", "Version"];
const INSTRUCTIONS =
  "Write a better answer in 'Refined answer' where TARA's answer needs it, and set Publish to YES. " +
  "Upload this file in TARA Online Admin > Knowledge. Keep ID and Version unchanged. " +
  "A published answer is used from then on whenever this question, or one like it, is asked.";

export async function exportReview(rows: ReviewRow[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Questions", {views: [{state: "frozen", ySplit: 2}]});
  sheet.addRow([INSTRUCTIONS]);
  sheet.mergeCells("A1:I1");
  sheet.getRow(1).height = 48;
  sheet.getCell("A1").alignment = {wrapText: true, vertical: "middle"};
  sheet.addRow(HEADERS);
  sheet.columns = [{width: 38}, {width: 12}, {width: 10}, {width: 55}, {width: 11}, {width: 75}, {width: 75}, {width: 10}, {width: 9}];
  for (const item of rows) {
    sheet.addRow([item.id, item.askedOn || "", item.language, item.question, item.occurrences, item.botAnswer || "", item.answer || "", "", item.version]);
  }
  sheet.getRow(2).font = {bold: true, color: {argb: "FFFFFFFF"}};
  sheet.getRow(2).fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FF17365D"}};
  sheet.autoFilter = "A2:I2";
  for (let n = 3; n <= sheet.rowCount; n++) {
    sheet.getRow(n).alignment = {wrapText: true, vertical: "top"};
    sheet.getRow(n).height = 90;
    sheet.getCell(`G${n}`).fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FFFFF2CC"}};
    sheet.getCell(`H${n}`).dataValidation = {type: "list", allowBlank: true, formulae: ['"YES,NO"']};
  }
  return book.xlsx.writeBuffer();
}

export async function parseReview(buffer: ArrayBuffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(buffer) as never);
  const sheet = book.getWorksheet("Questions");
  const column: Record<string, number> = {};
  sheet?.getRow(2).eachCell((cell, index) => { column[cell.text.trim().toLowerCase()] = index; });
  // "Answer" is the column's name in sheets exported before 2026-09-28.
  const answerCol = column["refined answer"] || column["answer"];
  if (!sheet || !column["id"] || !answerCol || !column["publish"] || !column["version"]) {
    throw new Error("Use the exported Questions workbook without changing its headers.");
  }
  if (sheet.rowCount > 1002) throw new Error("Import at most 1,000 rows at a time.");
  const rows: Array<{id: string; answer: string; version: number}> = [];
  const ids = new Set<string>();
  sheet.eachRow((row, n) => {
    if (n < 3 || row.getCell(column["publish"]).text.trim().toUpperCase() !== "YES") return;
    const id = row.getCell(column["id"]).text.trim();
    const cell = row.getCell(answerCol);
    if (cell.type === ExcelJS.ValueType.Formula) throw new Error(`Row ${n}: use plain text for the answer.`);
    const answer = cell.text.trim();
    const version = Number(row.getCell(column["version"]).text);
    if (!id || !answer || answer.length > 6000 || !Number.isInteger(version) || version < 1) {
      throw new Error(`Row ${n}: ID, Version and a refined answer of 1–6,000 characters are required.`);
    }
    if (ids.has(id)) throw new Error(`Row ${n}: duplicate question ID.`);
    ids.add(id);
    rows.push({id, answer, version});
  });
  if (!rows.length) throw new Error("Fill at least one Refined answer and set its Publish cell to YES.");
  return rows;
}

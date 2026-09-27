import ExcelJS from "exceljs";
export interface ReviewRow { id: string; question: string; language: string; reason: string; occurrences: number; answer: string | null; version: number; }
export async function exportReview(rows: ReviewRow[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Questions", {views: [{state: "frozen", ySplit: 2}]});
  sheet.addRow(["Fill Answer and set Publish to YES. Keep ID and Version unchanged. Import through Admin > Knowledge. Employee information stays separate."]);
  sheet.mergeCells("A1:H1"); sheet.getRow(1).height = 42;
  sheet.getCell("A1").alignment = {wrapText: true, vertical: "middle"};
  sheet.addRow(["ID", "Question", "Language", "Reason", "Times asked", "Answer", "Publish", "Version"]);
  sheet.columns = [{width: 38}, {width: 65}, {width: 12}, {width: 25}, {width: 13}, {width: 85}, {width: 12}, {width: 12}];
  for (const item of rows) sheet.addRow([item.id, item.question, item.language, item.reason, item.occurrences, item.answer || "", "", item.version]);
  sheet.getRow(2).font = {bold: true, color: {argb: "FFFFFFFF"}};
  sheet.getRow(2).fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FF17365D"}};
  sheet.autoFilter = "A2:H2";
  for (let n = 3; n <= sheet.rowCount; n++) {
    sheet.getRow(n).alignment = {wrapText: true, vertical: "top"}; sheet.getRow(n).height = 72;
    sheet.getCell(`F${n}`).fill = {type: "pattern", pattern: "solid", fgColor: {argb: "FFFFF2CC"}};
    sheet.getCell(`G${n}`).dataValidation = {type: "list", allowBlank: true, formulae: ['"YES,NO"']};
  }
  return book.xlsx.writeBuffer();
}
export async function parseReview(buffer: ArrayBuffer) {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(buffer) as never);
  const sheet = book.getWorksheet("Questions");
  if (!sheet || sheet.getCell("A2").text !== "ID" || sheet.getCell("F2").text !== "Answer" || sheet.getCell("H2").text !== "Version") throw new Error("Use the exported Questions workbook without changing its headers.");
  if (sheet.rowCount > 1002) throw new Error("Import at most 1,000 rows at a time.");
  const rows: Array<{id: string; answer: string; version: number}> = []; const ids = new Set<string>();
  sheet.eachRow((row, n) => {
    if (n < 3 || row.getCell(7).text.trim().toUpperCase() !== "YES") return;
    const id = row.getCell(1).text.trim(); const cell = row.getCell(6);
    if (cell.type === ExcelJS.ValueType.Formula) throw new Error(`Row ${n}: use plain text for the answer.`);
    const answer = cell.text.trim(); const version = Number(row.getCell(8).text);
    if (!id || !answer || answer.length > 6000 || !Number.isInteger(version) || version < 1) throw new Error(`Row ${n}: ID, Version and an answer of 1–6,000 characters are required.`);
    if (ids.has(id)) throw new Error(`Row ${n}: duplicate question ID.`);
    ids.add(id); rows.push({id, answer, version});
  });
  if (!rows.length) throw new Error("Fill at least one Answer and set its Publish cell to YES.");
  return rows;
}

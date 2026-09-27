import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
export interface EmployeeRecord {
  name: string; qualification: string; city: string; location: string;
  department: string; designation: string;
}
let cache: {mtime: number; path: string; rows: EmployeeRecord[]} | undefined;
export const employeeWorkbookPath = () => process.env.EMPLOYEE_EXCEL_PATH || path.join(process.cwd(), "private", "employees.xlsx");
export async function loadEmployees(): Promise<EmployeeRecord[]> {
  const filename = employeeWorkbookPath();
  const stat = await fs.stat(filename);
  if (cache?.mtime === stat.mtimeMs && cache.path === filename) return cache.rows;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filename);
  const rows: EmployeeRecord[] = [];
  for (const sheet of workbook.worksheets) {
    let headers: Record<string, number> | undefined;
    sheet.eachRow(row => {
      const cells: Record<string, number> = {};
      row.eachCell((cell, index) => { cells[cell.text.trim().toLowerCase().replace(/[^a-z0-9]/g, "")] = index; });
      if (!headers && (cells.employeename || cells.name)) { headers = cells; return; }
      if (!headers) return;
      const read = (...keys: string[]) => { const key = keys.find(k => headers![k]); return key ? row.getCell(headers![key]).text.trim() : ""; };
      const name = read("employeename", "name");
      if (name) rows.push({name, qualification: read("qualification", "education"), city: read("city"), location: read("location", "plant", "branch"), department: read("department", "dept"), designation: read("designation", "position")});
    });
  }
  if (!rows.length) throw new Error("No employee rows with a Name or Employee Name header found");
  cache = {mtime: stat.mtimeMs, path: filename, rows};
  return rows;
}

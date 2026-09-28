import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
export interface EmployeeRecord {
  name: string; qualification: string; city: string; location: string;
  department: string; designation: string;
}
let cache: {mtime: number; path: string; rows: EmployeeRecord[]} | undefined;
export const employeeWorkbookPath = () => process.env.EMPLOYEE_EXCEL_PATH || path.join(process.cwd(), "private", "employees.xlsx");

// On hr.rdcc.ai the portal's employee master (refreshed nightly from ZingHR and
// Truein) replaces the Excel file. It has no qualification or department, so
// those lines are simply left out of the reply.
let masterCache: {at: number; rows: EmployeeRecord[]} | undefined;
const MASTER_TTL_MS = 30 * 60 * 1000;
async function loadFromMaster(url: string, key: string): Promise<EmployeeRecord[]> {
  if (masterCache && Date.now() - masterCache.at < MASTER_TTL_MS) return masterCache.rows;
  const res = await fetch(`${url.replace(/\/$/, "")}/api/master/employees`, {headers: {"x-master-key": key}, signal: AbortSignal.timeout(30_000), cache: "no-store"});
  if (!res.ok) throw new Error(`The employee master returned ${res.status}`);
  const body = await res.json() as {employees?: Array<{employee_name?: string; designation?: string | null; location?: string | null; city?: string | null}>};
  const rows = (body.employees || []).filter(e => e.employee_name).map(e => ({
    name: e.employee_name!.trim(), qualification: "", city: e.city || "", location: e.location || "", department: "", designation: e.designation || "",
  }));
  masterCache = {at: Date.now(), rows};
  return rows;
}

export async function loadEmployees(): Promise<EmployeeRecord[]> {
  const masterUrl = process.env.MASTER_API_URL, masterKey = process.env.MASTER_API_KEY;
  if (masterUrl && masterKey) return loadFromMaster(masterUrl, masterKey);
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

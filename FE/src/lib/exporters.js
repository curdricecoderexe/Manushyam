// Browser-side exports. CSV needs no library; the Excel writer is downloaded only when used.

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Cells starting with = + - @ get a leading ' so spreadsheet apps don't run them as formulas.
function csvCell(value) {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// columns: [{ header, value: (row) => any }]
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.header)), ...rows.map((r) => columns.map((c) => csvCell(c.value(r))))];
  return `\uFEFF${lines.map((l) => l.join(",")).join("\r\n")}\r\n`;
}

export function downloadCsv(filename, columns, rows) {
  saveBlob(new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" }), filename);
}

// columns: [{ header, value: (row) => any, type?: Number|Date|String, format?, width? }]
export async function downloadExcel(filename, columns, rows) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const schema = columns.map((c) => ({
    header: { value: c.header, fontWeight: "bold" },
    cell: (row) => {
      const value = c.value(row);
      return { value: value === undefined ? null : value, ...(c.type ? { type: c.type } : {}), ...(c.format ? { format: c.format } : {}) };
    },
    width: c.width ?? 16,
  }));
  await writeExcelFile(rows, { columns: schema }).toFile(filename);
}

export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

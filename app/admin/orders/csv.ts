/** CSV helpers for admin exports. Every field is quoted, and quotes inside a field are doubled. */

type CsvValue = string | number | boolean | null | undefined;

function csvField(value: CsvValue): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Stop spreadsheet apps from running a customer-typed value as a formula.
  // Plain numbers and phone numbers such as +233507068918 or -12.50 are left alone.
  const looksLikeFormula =
    /^[=@\t\r]/.test(text) || (/^[+-]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text));
  if (looksLikeFormula) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]): void {
  // The BOM makes Excel read the file as UTF-8 (names, GH₵).
  const blob = new Blob(['﻿' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

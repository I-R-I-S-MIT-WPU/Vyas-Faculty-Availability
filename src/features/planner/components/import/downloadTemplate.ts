import * as XLSX from "xlsx";
import type { ImportEntity, ImportTemplate } from "../../types";

// Build CSV / XLSX templates from the backend's GET /planner/import-templates metadata, and hand
// them to the browser as a download. Everything except `saveBlob` is pure.

export type TemplateFormat = "csv" | "xlsx";

const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** Header keys then sample rows (falls back to one example row built from the column examples). */
export function templateMatrix(template: ImportTemplate): string[][] {
  const keys = template.columns.map((c) => c.key);
  const samples = template.sample_rows?.length
    ? template.sample_rows.map((r) => keys.map((k) => cell(r?.[k])))
    : [template.columns.map((c) => cell(c.example))];
  return [keys, ...samples];
}

function csvField(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens it with the right encoding (the importer tolerates the BOM). */
export function templateToCsv(template: ImportTemplate): string {
  const body = templateMatrix(template)
    .map((row) => row.map(csvField).join(","))
    .join("\r\n");
  return `\uFEFF${body}\r\n`;
}

/** XLSX bytes: first sheet = template (what the importer reads), second sheet = column help. */
export function templateToXlsx(template: ImportTemplate, sheetName = "Template"): Uint8Array {
  const wb = XLSX.utils.book_new();
  const data = templateMatrix(template);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = data[0].map((_, i) => ({ wch: Math.min(40, Math.max(...data.map((r) => (r[i] ?? "").length), 8) + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  const help = [
    ["column", "required", "description", "example"],
    ...template.columns.map((c) => [c.key, c.required ? "yes" : "no", cell(c.description), cell(c.example)]),
  ];
  const helpWs = XLSX.utils.aoa_to_sheet(help);
  helpWs["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 70 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, helpWs, "Columns");

  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

export function templateFilename(entity: ImportEntity, format: TemplateFormat): string {
  return `planner-${entity}-template.${format}`;
}

/** Trigger a browser download of `blob` as `filename`. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTemplate(entity: ImportEntity, template: ImportTemplate, format: TemplateFormat): void {
  if (format === "csv") {
    saveBlob(new Blob([templateToCsv(template)], { type: "text/csv;charset=utf-8" }), templateFilename(entity, "csv"));
  } else {
    saveBlob(
      new Blob([templateToXlsx(template, entity)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      templateFilename(entity, "xlsx"),
    );
  }
}

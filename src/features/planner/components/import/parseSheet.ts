import * as XLSX from "xlsx";

// Pure, React-free spreadsheet parsing for the planner import wizard. Everything runs in the
// browser; nothing here touches the network.

export const MAX_IMPORT_ROWS = 2000;
/** Guard against someone dropping a huge file on the page (the row cap would only trip after parsing it all). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** A problem with the file itself (not with its data). `message` is safe to show to the user. */
export class SheetParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetParseError";
  }
}

export interface ParsedSheet {
  sheetName: string;
  /** Normalised header keys, in file order, without blanks and duplicates. */
  headers: string[];
  /** One object per non-blank data row, keyed by normalised header, every value a trimmed string. */
  rows: Record<string, string>[];
  /** For each entry of `rows`, its 1-based line in the file (header = line 1 unless blank lines precede it). */
  lines: number[];
  /** Fully blank data rows that were dropped. */
  droppedBlank: number;
}

export interface ColumnSpec {
  key: string;
  required?: boolean;
}

export interface ColumnCheck {
  /** Required columns that are not in the file. */
  missingRequired: string[];
  /** File columns the importer does not know (they are ignored). */
  unknown: string[];
}

// ---------------------------------------------------------------- cells and headers

/** "Short Code *" -> "short_code", "  Semester" -> "semester", BOM and NBSP tolerated. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\*+$/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Cell value -> trimmed string. Numbers from Excel become plain strings ("3", not "3.0"). */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/^\uFEFF/, "").replace(/\u00A0/g, " ").trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).trim();
}

// ---------------------------------------------------------------- matrix -> rows

/**
 * Turn a 2D array (first non-blank row = header) into keyed rows. Pure; the SheetJS reading
 * is done by `parseSheetData`. Throws SheetParseError for an empty sheet or too many rows.
 */
export function matrixToSheet(matrix: unknown[][], sheetName = "Sheet1"): ParsedSheet {
  const cells = matrix.map((r) => (Array.isArray(r) ? r.map(cellToString) : []));
  const isBlank = (r: string[]) => r.every((c) => c === "");

  const headerIdx = cells.findIndex((r) => !isBlank(r));
  if (headerIdx === -1) throw new SheetParseError("The file is empty. The first row must be the column headers.");

  const headerCells = cells[headerIdx].map(normalizeHeader);
  const headers: string[] = [];
  headerCells.forEach((h) => {
    if (h && !headers.includes(h)) headers.push(h);
  });
  if (headers.length === 0) throw new SheetParseError("The first row has no column names.");

  const rows: Record<string, string>[] = [];
  const lines: number[] = [];
  let droppedBlank = 0;

  for (let i = headerIdx + 1; i < cells.length; i++) {
    const r = cells[i];
    if (isBlank(r)) {
      droppedBlank++;
      continue;
    }
    const obj: Record<string, string> = {};
    for (const h of headers) obj[h] = "";
    headerCells.forEach((h, c) => {
      if (!h) return;
      const v = r[c] ?? "";
      // Duplicate column names: first non-blank value wins.
      if (obj[h] === "" && v !== "") obj[h] = v;
    });
    rows.push(obj);
    lines.push(i + 1);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new SheetParseError(
        `This file has more than ${MAX_IMPORT_ROWS} rows. Split it into smaller files (at most ${MAX_IMPORT_ROWS} rows each) and import them one after another.`,
      );
    }
  }

  if (rows.length === 0) throw new SheetParseError("The file has a header row but no data rows.");

  return { sheetName, headers, rows, lines, droppedBlank };
}

// ---------------------------------------------------------------- SheetJS reading

const isCsvName = (filename: string) => /\.(csv|txt)$/i.test(filename);

/** Pick the delimiter of a CSV from its first non-empty line (ignoring quoted text): comma, semicolon or tab. */
export function detectDelimiter(text: string): string {
  const line =
    text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .find((l) => l.trim() !== "") ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  let best = ",";
  for (const d of [";", "\t"]) if (counts[d] > counts[best]) best = d;
  return best;
}

function decodeText(data: ArrayBuffer | Uint8Array | string): string {
  if (typeof data === "string") return data.replace(/^\uFEFF/, "");
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // utf-8 (default) strips a BOM itself unless ignoreBOM is set; the replace is a belt and braces.
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

/**
 * Parse CSV text or an Excel buffer (first sheet only). `filename` decides which: .csv/.txt are
 * read as text, anything else as a workbook. CSV cells are kept as raw strings, so "007" and
 * "3.10" survive unchanged; Excel numbers become strings.
 */
export function parseSheetData(data: ArrayBuffer | Uint8Array | string, filename: string): ParsedSheet {
  let workbook: XLSX.WorkBook;
  try {
    if (typeof data === "string" || isCsvName(filename)) {
      const text = decodeText(data);
      workbook = XLSX.read(text, { type: "string", raw: true, FS: detectDelimiter(text) });
    } else {
      workbook = XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: "array" });
    }
  } catch {
    throw new SheetParseError("Could not read this file. Check that it is a valid .csv, .xlsx or .xls file.");
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new SheetParseError("The file has no sheets.");

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true });
  return matrixToSheet(matrix, sheetName);
}

/** Browser entry point: read a File picked or dropped by the user. */
export async function parseSheetFile(file: File): Promise<ParsedSheet> {
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
    throw new SheetParseError("Unsupported file type. Use a .csv, .xlsx or .xls file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new SheetParseError(`This file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files.`);
  }
  const buffer = await file.arrayBuffer();
  return parseSheetData(buffer, file.name);
}

// ---------------------------------------------------------------- column checks

/** Compare file headers with the template's columns. */
export function checkColumns(headers: string[], columns: ColumnSpec[]): ColumnCheck {
  const known = new Set(columns.map((c) => c.key));
  return {
    missingRequired: columns.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key),
    unknown: headers.filter((h) => !known.has(h)),
  };
}

/** Keep only the importer's columns (extra columns would make a strict server reject the body). */
export function pickColumns(rows: Record<string, string>[], keys: string[]): Record<string, string>[] {
  return rows.map((r) => {
    const out: Record<string, string> = {};
    for (const k of keys) if (k in r) out[k] = r[k];
    return out;
  });
}

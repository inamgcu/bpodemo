import ExcelJS from "exceljs";
import type { BankAccount, Property, Transaction } from "../domain/types";

type Row = Record<string, unknown>;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const pick = (row: Row, candidates: string[]) => {
  const entries = new Map(Object.entries(row).map(([key, value]) => [normalize(key), value]));
  for (const candidate of candidates) {
    const value = entries.get(normalize(candidate));
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return undefined;
};

const text = (value: unknown, fallback = "") =>
  value === undefined || value === null ? fallback : String(value).trim();

const number = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const date = (value: unknown, fallback: string) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
};

const cellValue = (value: ExcelJS.CellValue): unknown => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value !== "object") return value;
  if ("text" in value) return value.text;
  if ("result" in value) return value.result;
  if ("richText" in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join("");
  }
  return String(value);
};

async function readWorkbookRows(file: File): Promise<Row[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const headers = (worksheet.getRow(1).values as ExcelJS.CellValue[])
    .slice(1)
    .map((value) => text(cellValue(value)));
  const rows: Row[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as ExcelJS.CellValue[]).slice(1);
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cellValue(values[index])])));
  });
  return rows;
}

export async function importPropertyBankWorkbook(file: File) {
  const rows = await readWorkbookRows(file);
  const properties = new Map<string, Property>();
  const banks = new Map<string, BankAccount>();
  const invalidRows: { rowNumber: number; reason: string }[] = [];

  rows.forEach((row, index) => {
    const propertyCode = text(pick(row, ["propertyCode", "property code", "property"]));
    const propertyName = text(pick(row, ["propertyName", "property name", "name"]));
    const bankName = text(pick(row, ["bankName", "bank name", "bank"]));
    const accountNumber = text(pick(row, ["accountNumber", "account number", "account"]));
    const yardiCode = text(pick(row, ["yardiCode", "yardi code", "yardi"]));
    if (!propertyCode || !propertyName || !bankName || !accountNumber) {
      invalidRows.push({ rowNumber: index + 2, reason: "Property, bank, and account fields are required." });
      return;
    }
    const propertyId = `prop-${propertyCode.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const bankId = `bank-${accountNumber.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    properties.set(propertyId, { id: propertyId, code: propertyCode, name: propertyName, status: "active" });
    banks.set(bankId, {
      id: bankId,
      propertyId,
      name: bankName,
      accountNumber,
      yardiCode: yardiCode || propertyCode,
      status: "active",
    });
  });

  return {
    properties: [...properties.values()],
    banks: [...banks.values()],
    validRows: rows.length - invalidRows.length,
    invalidRows,
  };
}

export async function importLedgerWorkbook(file: File, input: {
  runId: string;
  propertyId: string;
  bankId: string;
  month: string;
}): Promise<Transaction[]> {
  const rows = await readWorkbookRows(file);
  return rows.map((row, index) => {
    const debit = number(pick(row, ["debit", "withdrawal", "payment"]));
    const credit = number(pick(row, ["credit", "deposit", "receipt"]));
    const amount = number(pick(row, ["amount"]), Math.max(debit, credit));
    return {
      id: `ledger-import-${crypto.randomUUID()}`,
      runId: input.runId,
      propertyId: input.propertyId,
      bankId: text(pick(row, ["bankId", "bank", "account"]), input.bankId),
      source: "ledger",
      date: date(pick(row, ["ledgerDate", "date", "ledger date"]), `${input.month}-01`),
      description: text(pick(row, ["description", "memo", "details"]), "Imported Yardi ledger item"),
      reference: text(pick(row, ["reference", "ref", "check"]), undefined),
      debit,
      credit,
      amount,
      yardiId: text(pick(row, ["yardiId", "yardi source id"]), `Y-${index + 1}`),
      sourceFile: file.name,
      sourceRow: index + 2,
    };
  });
}

import type { BankAccount, Transaction, UploadedFile } from "../domain/types";

const now = () => new Date().toISOString();

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function uploadedFile(name: string, kind: UploadedFile["kind"], rowCount: number, bankId?: string): UploadedFile {
  return {
    id: `file-${crypto.randomUUID()}`,
    name,
    kind,
    status: "parsed",
    rowCount,
    bankId,
    uploadedAt: now(),
  };
}

export function mockBankStatementTransactions(input: {
  runId: string;
  propertyId: string;
  bank: BankAccount;
  month: string;
  fileName?: string;
}): Transaction[] {
  const [year, month] = input.month.split("-");
  const sourceFile = input.fileName ?? `${slug(input.bank.name)}-${input.month}.pdf`;
  const prefix = `${input.runId}-${input.bank.id}`;
  const rows = [
    [`${year}-${month}-04`, `${year}-${month}-05`, "Rent deposit A102", "DEP-778", 0, 1500, 11500],
    [`${year}-${month}-08`, `${year}-${month}-09`, "Rent deposit B210", "DEP-881", 0, 1375, 12875],
    [`${year}-${month}-12`, `${year}-${month}-12`, "Maintenance vendor payment", "CHK-404", 420, 0, 12455],
    [`${year}-${month}-18`, `${year}-${month}-19`, "Utility refund city water", "REF-17", 0, 210, 12665],
  ] as const;

  return rows.map(([date, postedDate, description, reference, debit, credit, runningBalance], index) => ({
    id: `bank-${slug(prefix)}-${index}`,
    runId: input.runId,
    propertyId: input.propertyId,
    bankId: input.bank.id,
    source: "bank",
    date,
    postedDate,
    description,
    reference,
    debit,
    credit,
    amount: Math.max(debit, credit),
    runningBalance,
    sourceFile,
    sourceRow: index + 2,
  }));
}

export function mockLedgerTransactions(input: {
  runId: string;
  propertyId: string;
  bank: BankAccount;
  month: string;
  fileName?: string;
}): Transaction[] {
  const [year, month] = input.month.split("-");
  const sourceFile = input.fileName ?? `yardi-ledger-${input.month}.xlsx`;
  const prefix = `${input.runId}-${input.bank.id}`;
  const rows = [
    [`${year}-${month}-04`, "Rent deposit A102", "DEP-778", 0, 1500, "Y-9001"],
    [`${year}-${month}-08`, "Rent deposit B210", "DEP-881", 0, 1375, "Y-9002"],
    [`${year}-${month}-15`, "Maintenance vendor payment", "CHK-404", 420, 0, "Y-9003"],
    [`${year}-${month}-19`, "Utility refund city water", "REF-17", 0, 211, "Y-9004"],
    [`${year}-${month}-22`, "Bank interest income", "INT-22", 0, 18, "Y-9005"],
  ] as const;

  return rows.map(([date, description, reference, debit, credit, yardiId], index) => ({
    id: `ledger-${slug(prefix)}-${index}`,
    runId: input.runId,
    propertyId: input.propertyId,
    bankId: input.bank.id,
    source: "ledger",
    date,
    description,
    reference,
    debit,
    credit,
    amount: Math.max(debit, credit),
    yardiId,
    sourceFile,
    sourceRow: index + 2,
  }));
}

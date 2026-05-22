import type { BankAccount, MatchResult, Transaction, UploadedFile } from "../domain/types";

export type UploadSectionRow = {
  id: string;
  title: string;
  detail: string;
  uploaded: boolean;
  bankId?: string;
  fileName?: string;
};

export type UploadSection = {
  id: "bank-statements" | "yardi-ledger";
  title: string;
  eyebrow: string;
  rows: UploadSectionRow[];
};

export type ReconciliationFlag = "matched" | "unmatched" | "pending";

export type EvidenceRow = {
  transactionId: string;
  source: Transaction["source"];
  date: string;
  postedDate?: string;
  description: string;
  reference?: string;
  debit: number;
  credit: number;
  amount: number;
  sourceFile: string;
  sourceRow?: number;
  bankId: string;
  flag: ReconciliationFlag;
  counterpartId?: string;
  confidence?: number;
  explanation?: string;
};

export type ReconciliationEvidence = {
  bankRows: EvidenceRow[];
  ledgerRows: EvidenceRow[];
  reportRows: EvidenceRow[];
};

export function getInitialExpandedPropertyId(_selectedPropertyId: string) {
  return "";
}

export function getReconciliationUploadSections(input: {
  banks: BankAccount[];
  files: UploadedFile[];
  ledgerUploaded: boolean;
}): UploadSection[] {
  const bankRows = input.banks.map((bank) => {
    const uploadedFile = input.files.find((file) => file.kind === "bank-statement" && file.bankId === bank.id);
    return {
      id: `bank-row-${bank.id}`,
      bankId: bank.id,
      title: bank.name,
      detail: `${bank.accountNumber} / ${bank.yardiCode}`,
      uploaded: Boolean(uploadedFile),
      fileName: uploadedFile?.name,
    };
  });

  const ledgerFile = input.files.find((file) => file.kind === "yardi-ledger");

  return [
    {
      id: "bank-statements",
      eyebrow: "Bank source files",
      title: "Bank statements",
      rows: bankRows,
    },
    {
      id: "yardi-ledger",
      eyebrow: "Yardi source file",
      title: "Yardi ledger",
      rows: [
        {
          id: "yardi-ledger-row",
          title: "Yardi Ledger",
          detail: "Excel export from Yardi",
          uploaded: input.ledgerUploaded,
          fileName: ledgerFile?.name,
        },
      ],
    },
  ];
}

function findTransactionMatch(transaction: Transaction, matches: MatchResult[]) {
  return matches.find((match) =>
    transaction.source === "bank"
      ? match.bankTransactionId === transaction.id
      : match.ledgerTransactionId === transaction.id,
  );
}

function counterpartId(transaction: Transaction, match?: MatchResult) {
  if (!match) return undefined;
  return transaction.source === "bank" ? match.ledgerTransactionId : match.bankTransactionId;
}

function reconciliationFlag(match: MatchResult | undefined, hasReconciliationRun: boolean): ReconciliationFlag {
  if (!hasReconciliationRun) return "pending";
  return match && match.bankTransactionId && match.ledgerTransactionId ? "matched" : "unmatched";
}

function toEvidenceRow(transaction: Transaction, matches: MatchResult[], hasReconciliationRun: boolean): EvidenceRow {
  const match = findTransactionMatch(transaction, matches);
  return {
    transactionId: transaction.id,
    source: transaction.source,
    date: transaction.date,
    postedDate: transaction.postedDate,
    description: transaction.description,
    reference: transaction.reference,
    debit: transaction.debit,
    credit: transaction.credit,
    amount: transaction.amount,
    sourceFile: transaction.sourceFile,
    sourceRow: transaction.sourceRow,
    bankId: transaction.bankId,
    flag: reconciliationFlag(match, hasReconciliationRun),
    counterpartId: counterpartId(transaction, match),
    confidence: match?.confidence,
    explanation: match?.explanation,
  };
}

export function getReconciliationEvidence(input: {
  transactions: Transaction[];
  matches: MatchResult[];
}): ReconciliationEvidence {
  const hasReconciliationRun = input.matches.length > 0;
  const reportRows = input.transactions.map((transaction) =>
    toEvidenceRow(transaction, input.matches, hasReconciliationRun),
  );

  return {
    bankRows: reportRows.filter((row) => row.source === "bank"),
    ledgerRows: reportRows.filter((row) => row.source === "ledger"),
    reportRows,
  };
}

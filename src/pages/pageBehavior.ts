import type { BankAccount, ExceptionRecord, MatchResult, Transaction, UploadedFile } from "../domain/types";

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

export type ExtractionSplitPane = {
  id: "bank" | "ledger";
  title: string;
  rows: EvidenceRow[];
};

export type ReportMatchRow = {
  id: string;
  status: MatchResult["status"];
  displayStatus: MatchResult["status"] | "partial match";
  type: MatchResult["type"];
  confidence: number;
  bankSummary: string;
  ledgerSummary: string;
  amountSummary: string;
  explanation: string;
  exceptionId?: string;
  reasonFeedback?: string;
  reasonDecision?: string;
  isMismatch: boolean;
};

export type ReportMatchGroups = {
  matchedRows: ReportMatchRow[];
  mismatchRows: ReportMatchRow[];
};

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function getYardiLedgerAutomationButtonState(running: boolean) {
  return {
    disabled: running,
    label: running ? "Getting Ledger from Yardi Voyager" : "Get Ledger from Yardi Voyager",
  };
}

export function getAgentProcessingLogs() {
  return [
    "Financial Data Parsing Agent: validating uploaded files...",
    "Extracting transactions...",
    "Saving to database...",
    "Reconciliation Agent: matching transactions...",
    "Detecting exceptions...",
    "Calculating balances...",
    "Calculation completed.",
  ];
}

export function getAgentCompletionNavigationView(): "report" {
  return "report";
}

export function getInitialExpandedPropertyId(selectedPropertyId: string) {
  void selectedPropertyId;
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

export function getExtractionSplitPanes(evidence?: ReconciliationEvidence): ExtractionSplitPane[] {
  return [
    {
      id: "bank",
      title: "Bank Extract",
      rows: evidence?.bankRows ?? [],
    },
    {
      id: "ledger",
      title: "Ledger Extract",
      rows: evidence?.ledgerRows ?? [],
    },
  ];
}

function transactionSummary(transaction: Transaction | undefined, missingText: string) {
  if (!transaction) return missingText;
  const reference = transaction.reference ? `Ref ${transaction.reference}` : "No reference";
  const sourceRow = transaction.sourceRow ? `row ${transaction.sourceRow}` : "row unknown";
  return `${transaction.description} | ${money(transaction.amount)} | ${transaction.date} | ${reference} | ${transaction.sourceFile} ${sourceRow}`;
}

function amountSummary(bank: Transaction | undefined, ledger: Transaction | undefined) {
  const bankAmount = bank ? `${money(bank.amount)} bank` : "no bank amount";
  const ledgerAmount = ledger ? `${money(ledger.amount)} ledger` : "no ledger amount";
  const variance = bank && ledger ? Math.abs(bank.amount - ledger.amount) : 0;
  const varianceText = variance > 0 ? ` (${money(variance)} variance)` : "";
  return `${bankAmount} / ${ledgerAmount}${varianceText}`;
}

function fallbackMismatchReason(match: MatchResult) {
  if (match.type === "amount-mismatch") {
    return "Amount discrepancy detected. Review tolerance or possible split transaction.";
  }
  if (match.type === "date-mismatch") {
    return "Transaction date mismatch. The amount/reference align, but the transaction dates differ.";
  }
  if (match.status !== "matched") {
    return match.bankTransactionId
      ? "No ledger transaction met the medium confidence threshold."
      : "Yardi ledger transaction has no matching bank statement item.";
  }
  return "";
}

export function getReportMatchRows(input: {
  transactions: Transaction[];
  matches: MatchResult[];
  exceptions?: ExceptionRecord[];
}): ReportMatchRow[] {
  return input.matches.map((match) => {
    const bank = input.transactions.find((transaction) => transaction.id === match.bankTransactionId);
    const ledger = input.transactions.find((transaction) => transaction.id === match.ledgerTransactionId);
    const exception = input.exceptions?.find((item) => item.matchId === match.id);
    const actualDateMismatch = Boolean(bank && ledger && bank.date !== ledger.date);
    const isMismatch = match.type === "amount-mismatch" || (match.type === "date-mismatch" && actualDateMismatch) || match.status !== "matched";
    const hasCounterpartPair = Boolean(match.bankTransactionId && match.ledgerTransactionId);
    const displayStatus = isMismatch && hasCounterpartPair ? "partial match" : match.status;
    const shouldShowReason = isMismatch;
    const explanation = exception?.aiReasoning || match.explanation || fallbackMismatchReason(match);
    return {
      id: match.id,
      status: match.status,
      displayStatus,
      type: match.type,
      confidence: match.confidence,
      bankSummary: transactionSummary(bank, "No bank transaction matched"),
      ledgerSummary: transactionSummary(ledger, "No ledger transaction matched"),
      amountSummary: amountSummary(bank, ledger),
      explanation: shouldShowReason ? explanation : "",
      exceptionId: exception?.id,
      reasonFeedback: exception?.userFeedback,
      reasonDecision: exception?.userDecision,
      isMismatch,
    };
  });
}

function isMismatchRow(row: ReportMatchRow) {
  return row.isMismatch;
}

export function getReportMatchGroups(input: {
  transactions: Transaction[];
  matches: MatchResult[];
  exceptions?: ExceptionRecord[];
}): ReportMatchGroups {
  const rows = getReportMatchRows(input);
  return {
    matchedRows: rows.filter((row) => row.status === "matched" && !row.isMismatch),
    mismatchRows: rows.filter(isMismatchRow),
  };
}

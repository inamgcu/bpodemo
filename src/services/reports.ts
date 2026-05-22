import ExcelJS from "exceljs";
import { summarizeRun } from "../domain/reconciliation";
import type { BankAccount, Property, ReconciliationRun } from "../domain/types";

export function reportFileName(run: ReconciliationRun, property?: Property) {
  const propertyName = property?.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") ?? run.propertyId;
  return `${propertyName}-${run.month}-reconciliation-report.xlsx`;
}

export async function createReportWorkbook(run: ReconciliationRun, property?: Property, banks: BankAccount[] = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BPO Yardi Reconciliation";
  const summary = summarizeRun(run);
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRows([
    ["Property", property?.name ?? run.propertyId],
    ["Month", run.month],
    ["Status", run.status],
    ["Matched", summary.matched],
    ["Ambiguous", summary.ambiguous],
    ["Unmatched", summary.unmatched],
    ["Exceptions", summary.exceptions],
    ["Resolved Exceptions", summary.resolved],
    ["Closing Balance", run.closingBalance ?? 0],
    ["Closing Variance", summary.closingVariance],
  ]);

  const matchSheet = workbook.addWorksheet("Matches");
  matchSheet.columns = ["Status", "Type", "Confidence", "Bank Txn", "Ledger Txn", "Explanation"].map((header) => ({ header, key: header, width: 24 }));
  run.matches.forEach((match) => matchSheet.addRow([match.status, match.type, match.confidence, match.bankTransactionId, match.ledgerTransactionId, match.explanation]));

  const exceptionSheet = workbook.addWorksheet("Exceptions");
  exceptionSheet.columns = ["Category", "Status", "Confidence", "AI Reasoning", "User Decision", "Feedback"].map((header) => ({ header, key: header, width: 28 }));
  run.exceptions.forEach((exception) => exceptionSheet.addRow([exception.category, exception.status, exception.confidence, exception.aiReasoning, exception.userDecision ?? "", exception.userFeedback ?? ""]));

  const transactionSheet = workbook.addWorksheet("Transactions");
  transactionSheet.columns = ["Source", "Bank", "Date", "Description", "Reference", "Debit", "Credit", "Amount", "File"].map((header) => ({ header, key: header, width: 20 }));
  run.transactions.forEach((transaction) => {
    const bank = banks.find((item) => item.id === transaction.bankId);
    transactionSheet.addRow([transaction.source, bank?.name ?? transaction.bankId, transaction.date, transaction.description, transaction.reference ?? "", transaction.debit, transaction.credit, transaction.amount, transaction.sourceFile]);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

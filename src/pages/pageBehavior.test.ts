import { describe, expect, it } from "vitest";
import type { BankAccount, ExceptionRecord, MatchResult, Transaction, UploadedFile } from "../domain/types";
import {
  getExtractionSplitPanes,
  getAgentCompletionNavigationView,
  getAgentProcessingLogs,
  getInitialExpandedPropertyId,
  getReconciliationEvidence,
  getReportMatchGroups,
  getReportMatchRows,
  getReconciliationUploadSections,
  getYardiLedgerAutomationButtonState,
} from "./pageBehavior";

const bank = (id: string, name: string): BankAccount => ({
  id,
  propertyId: "prop-1",
  name,
  accountNumber: `100-${id}`,
  yardiCode: `Y-${id}`,
  status: "active",
});

const file = (bankId: string): UploadedFile => ({
  id: `file-${bankId}`,
  name: `${bankId}.pdf`,
  kind: "bank-statement",
  status: "parsed",
  rowCount: 3,
  uploadedAt: "2026-05-22T00:00:00.000Z",
  bankId,
});

const transaction = (input: Partial<Transaction> & Pick<Transaction, "id" | "source" | "amount">): Transaction => ({
  runId: "run-1",
  propertyId: "prop-1",
  bankId: "bank-1",
  date: "2026-04-04",
  postedDate: "2026-04-04",
  description: `${input.source} transaction`,
  reference: `REF-${input.id}`,
  debit: input.source === "bank" ? input.amount : 0,
  credit: input.source === "ledger" ? input.amount : 0,
  sourceFile: `${input.source}.pdf`,
  sourceRow: 2,
  ...input,
});

const match = (input: Partial<MatchResult>): MatchResult => ({
  id: "match-1",
  runId: "run-1",
  bankTransactionId: "bank-1",
  ledgerTransactionId: "ledger-1",
  status: "matched",
  type: "exact",
  confidence: 0.98,
  explanation: "Amount, date, reference, and direction align.",
  ...input,
});

const exception = ({ matchId, ...input }: Partial<ExceptionRecord> & Pick<ExceptionRecord, "matchId">): ExceptionRecord => ({
  id: `ex-${matchId}`,
  runId: "run-1",
  matchId,
  category: "amount-mismatch",
  status: "open",
  severity: "high",
  aiReasoning: "Amount discrepancy detected.",
  confidence: 0.86,
  updatedAt: "2026-05-22T00:00:00.000Z",
  ...input,
});

describe("page behavior", () => {
  it("does not auto-expand property bank details on page load", () => {
    expect(getInitialExpandedPropertyId("prop-1")).toBe("");
  });

  it("builds separate bank statement and Yardi ledger upload sections", () => {
    const sections = getReconciliationUploadSections({
      banks: [bank("bank-1", "Operating"), bank("bank-2", "Depository")],
      files: [file("bank-1")],
      ledgerUploaded: false,
    });

    expect(sections.map((section) => section.id)).toEqual(["bank-statements", "yardi-ledger"]);
    expect(sections[0].rows).toEqual([
      expect.objectContaining({ bankId: "bank-1", title: "Operating", uploaded: true }),
      expect.objectContaining({ bankId: "bank-2", title: "Depository", uploaded: false }),
    ]);
    expect(sections[1].rows).toEqual([
      expect.objectContaining({ title: "Yardi Ledger", uploaded: false }),
    ]);
  });

  it("describes the Yardi Voyager ledger automation action", () => {
    expect(getYardiLedgerAutomationButtonState(false)).toEqual({
      disabled: false,
      label: "Get Ledger from Yardi Voyager",
    });
    expect(getYardiLedgerAutomationButtonState(true)).toEqual({
      disabled: true,
      label: "Getting Ledger from Yardi Voyager",
    });
  });

  it("logs calculation completion and routes completed agents to the report", () => {
    expect(getAgentProcessingLogs()).toContain("Calculation completed.");
    expect(getAgentCompletionNavigationView()).toBe("report");
  });

  it("builds extracted bank, ledger, and transaction-level reconciliation rows", () => {
    const evidence = getReconciliationEvidence({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500 }),
        transaction({ id: "bank-2", source: "bank", amount: 420 }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500 }),
      ],
      matches: [match({ bankTransactionId: "bank-1", ledgerTransactionId: "ledger-1" })],
    });

    expect(evidence.bankRows).toHaveLength(2);
    expect(evidence.ledgerRows).toHaveLength(1);
    expect(evidence.reportRows).toEqual([
      expect.objectContaining({ transactionId: "bank-1", source: "bank", flag: "matched", counterpartId: "ledger-1" }),
      expect.objectContaining({ transactionId: "bank-2", source: "bank", flag: "unmatched" }),
      expect.objectContaining({ transactionId: "ledger-1", source: "ledger", flag: "matched", counterpartId: "bank-1" }),
    ]);
  });

  it("treats ambiguous counterpart pairs as matched for the binary report flag", () => {
    const evidence = getReconciliationEvidence({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500 }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500 }),
      ],
      matches: [match({ status: "ambiguous", type: "date-mismatch", confidence: 0.88 })],
    });

    expect(evidence.reportRows).toEqual([
      expect.objectContaining({ transactionId: "bank-1", flag: "matched", counterpartId: "ledger-1" }),
      expect.objectContaining({ transactionId: "ledger-1", flag: "matched", counterpartId: "bank-1" }),
    ]);
  });

  it("marks true no-counterpart matches as unmatched", () => {
    const evidence = getReconciliationEvidence({
      transactions: [transaction({ id: "bank-1", source: "bank", amount: 1500 })],
      matches: [match({ bankTransactionId: "bank-1", ledgerTransactionId: undefined, status: "unmatched", type: "unmatched" })],
    });

    expect(evidence.reportRows).toEqual([
      expect.objectContaining({ transactionId: "bank-1", flag: "unmatched", counterpartId: undefined }),
    ]);
  });

  it("marks extracted transactions as pending before reconciliation runs", () => {
    const evidence = getReconciliationEvidence({
      transactions: [transaction({ id: "bank-1", source: "bank", amount: 1500 })],
      matches: [],
    });

    expect(evidence.reportRows).toEqual([
      expect.objectContaining({ transactionId: "bank-1", flag: "pending" }),
    ]);
  });

  it("builds a split extraction view without a reconciliation report pane", () => {
    const evidence = getReconciliationEvidence({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500 }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500 }),
      ],
      matches: [],
    });

    expect(getExtractionSplitPanes(evidence)).toEqual([
      expect.objectContaining({ id: "bank", title: "Bank Extract", rows: [expect.objectContaining({ source: "bank" })] }),
      expect.objectContaining({ id: "ledger", title: "Ledger Extract", rows: [expect.objectContaining({ source: "ledger" })] }),
    ]);
    expect(getExtractionSplitPanes(evidence).map((pane) => pane.id)).not.toContain("report");
  });

  it("builds human-readable report rows that show what matched with what", () => {
    const rows = getReportMatchRows({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500, description: "Bank rent deposit", sourceFile: "bank.pdf" }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500, description: "Ledger rent receipt", sourceFile: "ledger.xlsx" }),
        transaction({ id: "bank-2", source: "bank", amount: 420, description: "Bank utility draft", sourceFile: "bank.pdf" }),
      ],
      matches: [
        match({ id: "match-1", bankTransactionId: "bank-1", ledgerTransactionId: "ledger-1" }),
        match({ id: "match-2", bankTransactionId: "bank-2", ledgerTransactionId: undefined, status: "unmatched", type: "unmatched", confidence: 0 }),
      ],
    });

    expect(rows[0]).toEqual(expect.objectContaining({
      bankSummary: expect.stringContaining("Bank rent deposit"),
      ledgerSummary: expect.stringContaining("Ledger rent receipt"),
      amountSummary: "$1,500.00 bank / $1,500.00 ledger",
    }));
    expect(rows[1]).toEqual(expect.objectContaining({
      bankSummary: expect.stringContaining("Bank utility draft"),
      ledgerSummary: "No ledger transaction matched",
      amountSummary: "$420.00 bank / no ledger amount",
    }));
  });

  it("moves amount mismatches to the mismatch table as partial matches", () => {
    const groups = getReportMatchGroups({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500, description: "Exact bank deposit", sourceFile: "bank.pdf" }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500, description: "Exact ledger receipt", sourceFile: "ledger.xlsx" }),
        transaction({ id: "bank-2", source: "bank", amount: 420, description: "Bank fee", sourceFile: "bank.pdf" }),
        transaction({ id: "ledger-2", source: "ledger", amount: 421, description: "Ledger fee", sourceFile: "ledger.xlsx" }),
      ],
      matches: [
        match({ id: "match-exact", bankTransactionId: "bank-1", ledgerTransactionId: "ledger-1", type: "exact", explanation: "Should not show" }),
        match({ id: "match-amount", bankTransactionId: "bank-2", ledgerTransactionId: "ledger-2", type: "amount-mismatch", explanation: "Mock AI reasoning: amount tolerance." }),
      ],
      exceptions: [
        exception({ id: "ex-match-amount", matchId: "match-amount", aiReasoning: "Amount discrepancy detected.", userFeedback: "Reviewer accepted tolerance." }),
      ],
    });

    expect(groups.matchedRows).toEqual([
      expect.objectContaining({ id: "match-exact", displayStatus: "matched", explanation: "", reasonFeedback: undefined }),
    ]);
    expect(groups.mismatchRows).toEqual([
      expect.objectContaining({
        id: "match-amount",
        displayStatus: "partial match",
        exceptionId: "ex-match-amount",
        explanation: "Amount discrepancy detected.",
        reasonFeedback: "Reviewer accepted tolerance.",
      }),
    ]);
  });

  it("moves actual date mismatches to the mismatch table as partial matches", () => {
    const groups = getReportMatchGroups({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500, date: "2026-04-04" }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500, date: "2026-04-06" }),
      ],
      matches: [
        match({ id: "match-date", bankTransactionId: "bank-1", ledgerTransactionId: "ledger-1", type: "date-mismatch", explanation: "Mock AI reasoning: date differs." }),
      ],
      exceptions: [
        exception({ id: "ex-match-date", matchId: "match-date", category: "date-mismatch", aiReasoning: "Transaction date mismatch." }),
      ],
    });

    expect(groups.matchedRows).toEqual([]);
    expect(groups.mismatchRows).toEqual([
      expect.objectContaining({
        id: "match-date",
        displayStatus: "partial match",
        exceptionId: "ex-match-date",
        explanation: "Transaction date mismatch.",
      }),
    ]);
  });

  it("provides fallback reasoning for mismatch rows when older runs have no exception record", () => {
    const groups = getReportMatchGroups({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 420 }),
        transaction({ id: "ledger-1", source: "ledger", amount: 421 }),
      ],
      matches: [
        match({ id: "match-amount", bankTransactionId: "bank-1", ledgerTransactionId: "ledger-1", type: "amount-mismatch", explanation: "" }),
      ],
      exceptions: [],
    });

    expect(groups.mismatchRows).toEqual([
      expect.objectContaining({
        id: "match-amount",
        explanation: "Amount discrepancy detected. Review tolerance or possible split transaction.",
      }),
    ]);
  });

  it("does not show stale date-mismatch rows as mismatches when transaction dates match", () => {
    const groups = getReportMatchGroups({
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500, date: "2026-04-04", postedDate: "2026-04-06" }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500, date: "2026-04-04" }),
      ],
      matches: [
        match({ id: "match-date", bankTransactionId: "bank-1", ledgerTransactionId: "ledger-1", type: "date-mismatch", explanation: "Old posted-date mismatch reason." }),
      ],
      exceptions: [
        exception({ id: "ex-match-date", matchId: "match-date", category: "date-mismatch", aiReasoning: "Transaction date mismatch." }),
      ],
    });

    expect(groups.matchedRows).toEqual([
      expect.objectContaining({ id: "match-date", explanation: "" }),
    ]);
    expect(groups.mismatchRows).toEqual([]);
  });
});

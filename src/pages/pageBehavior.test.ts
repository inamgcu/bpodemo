import { describe, expect, it } from "vitest";
import type { BankAccount, MatchResult, Transaction, UploadedFile } from "../domain/types";
import {
  getInitialExpandedPropertyId,
  getReconciliationEvidence,
  getReconciliationUploadSections,
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
});

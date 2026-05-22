import { describe, expect, it } from "vitest";
import { reconcileRun, summarizeRun } from "./reconciliation";
import type { ReconciliationRun, Transaction } from "./types";

const transaction = (input: Partial<Transaction> & Pick<Transaction, "id" | "source" | "amount">): Transaction => ({
  runId: "run-1",
  propertyId: "prop-cedar",
  bankId: "bank-cedar-operating",
  date: "2026-04-04",
  description: "Rent deposit A102",
  reference: "DEP-778",
  debit: 0,
  credit: input.amount,
  sourceFile: "sample",
  ...input,
});

const baseRun: ReconciliationRun = {
  id: "run-1",
  propertyId: "prop-cedar",
  month: "2026-04",
  status: "processing",
  closingBalance: 1500,
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
  files: [],
  transactions: [],
  matches: [],
  exceptions: [],
  automationLogs: [],
};

describe("reconciliation engine", () => {
  it("matches exact bank and ledger transactions without exceptions", () => {
    const run = reconcileRun({
      ...baseRun,
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500 }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500 }),
      ],
    });

    expect(run.matches).toHaveLength(1);
    expect(run.matches[0].status).toBe("matched");
    expect(run.matches[0].explanation).toBe("");
    expect(run.exceptions).toHaveLength(0);
    expect(summarizeRun(run).matched).toBe(1);
  });

  it("marks amount-tolerant deterministic counterparts as matched mismatch exceptions with AI reasoning", () => {
    const run = reconcileRun({
      ...baseRun,
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500 }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1501 }),
      ],
    });

    expect(run.matches[0]).toEqual(expect.objectContaining({
      status: "matched",
      type: "amount-mismatch",
      explanation: expect.stringContaining("Mock AI reasoning"),
    }));
    expect(run.exceptions).toEqual([
      expect.objectContaining({
        matchId: run.matches[0].id,
        category: "amount-mismatch",
        aiReasoning: expect.stringContaining("Amount discrepancy detected"),
      }),
    ]);
  });

  it("does not mark a date mismatch when transaction dates match but posted date differs", () => {
    const run = reconcileRun({
      ...baseRun,
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500, postedDate: "2026-04-06" }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500, date: "2026-04-04" }),
      ],
    });

    expect(run.matches[0]).toEqual(expect.objectContaining({
      bankTransactionId: "bank-1",
      ledgerTransactionId: "ledger-1",
      status: "matched",
      type: "exact",
    }));
    expect(run.matches[0].explanation).toBe("");
    expect(run.exceptions).toHaveLength(0);
  });

  it("marks an actual transaction date mismatch when bank and ledger transaction dates differ", () => {
    const run = reconcileRun({
      ...baseRun,
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500, date: "2026-04-06" }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1500, date: "2026-04-04" }),
      ],
    });

    expect(run.matches[0]).toEqual(expect.objectContaining({
      bankTransactionId: "bank-1",
      ledgerTransactionId: "ledger-1",
      status: "matched",
      type: "date-mismatch",
    }));
    expect(run.matches[0].explanation).toContain("Mock AI reasoning");
    expect(run.exceptions).toEqual([
      expect.objectContaining({
        matchId: run.matches[0].id,
        category: "date-mismatch",
      }),
    ]);
  });
});

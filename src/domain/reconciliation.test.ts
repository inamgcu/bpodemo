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
    expect(run.exceptions).toHaveLength(0);
    expect(summarizeRun(run).matched).toBe(1);
  });

  it("routes amount discrepancies to exception review", () => {
    const run = reconcileRun({
      ...baseRun,
      transactions: [
        transaction({ id: "bank-1", source: "bank", amount: 1500 }),
        transaction({ id: "ledger-1", source: "ledger", amount: 1501 }),
      ],
    });

    expect(run.matches[0].status).toBe("ambiguous");
    expect(run.exceptions[0].category).toBe("amount-mismatch");
  });
});

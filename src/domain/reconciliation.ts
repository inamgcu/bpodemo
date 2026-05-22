import type {
  ExceptionRecord,
  MatchResult,
  ReconciliationRun,
  Transaction,
} from "./types";

const now = () => new Date().toISOString();

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const daysBetween = (left: string, right: string) => {
  const leftTime = new Date(`${left}T00:00:00Z`).getTime();
  const rightTime = new Date(`${right}T00:00:00Z`).getTime();
  return Math.abs(leftTime - rightTime) / 86_400_000;
};

const direction = (transaction: Transaction) =>
  transaction.debit > transaction.credit ? "debit" : "credit";

function scorePair(bank: Transaction, ledger: Transaction) {
  const amountDelta = Math.abs(bank.amount - ledger.amount);
  const dateDelta = daysBetween(bank.date, ledger.date);
  let score = 0;
  const reasons: string[] = [];

  if (amountDelta === 0) {
    score += 0.35;
    reasons.push("amount");
  } else if (amountDelta <= 1) {
    score += 0.22;
    reasons.push("amount tolerance");
  }
  if (dateDelta === 0) {
    score += 0.25;
    reasons.push("transaction date");
  } else if (dateDelta <= 3) {
    score += 0.13;
    reasons.push("transaction date shift");
  }
  if (bank.reference && ledger.reference && bank.reference === ledger.reference) {
    score += 0.25;
    reasons.push("reference");
  }
  if (direction(bank) === direction(ledger)) {
    score += 0.15;
    reasons.push("direction");
  }

  return {
    confidence: Math.min(1, Number(score.toFixed(2))),
    amountDelta,
    dateDelta,
    reasons,
  };
}

function makeException(match: MatchResult): ExceptionRecord {
  const category =
    match.type === "date-mismatch"
      ? "date-mismatch"
      : match.type === "amount-mismatch"
        ? "amount-mismatch"
        : match.bankTransactionId
          ? "unmatched-bank-transaction"
          : "unmatched-ledger-transaction";

  const aiReasoning =
    category === "date-mismatch"
      ? "Transaction date mismatch. The amount/reference align, but the transaction dates differ."
      : category === "amount-mismatch"
        ? "Amount discrepancy detected. Review tolerance or possible split transaction."
        : "No confident counterpart was found in the selected property/bank/month scope.";

  return {
    id: `ex-${match.id}`,
    runId: match.runId,
    matchId: match.id,
    category,
    status: "open",
    severity: category.includes("unmatched") ? "medium" : "high",
    aiReasoning,
    confidence: match.confidence,
    updatedAt: now(),
  };
}

function mockAiReasoning(type: MatchResult["type"], reasons: string[], confidence: number) {
  if (type === "exact") {
    return "";
  }
  if (type === "probable") return "";
  if (type === "date-mismatch") {
    return `Mock AI reasoning: deterministic match found by ${reasons.join(", ")}. Transaction date differs, but the counterpart is reconciled.`;
  }
  if (type === "amount-mismatch") {
    return `Mock AI reasoning: deterministic match found by ${reasons.join(", ")} with ${Math.round(confidence * 100)}% confidence. Amount difference is within tolerance.`;
  }
  return `Mock AI reasoning: deterministic counterpart found by ${reasons.join(", ")} with ${Math.round(confidence * 100)}% confidence.`;
}

export function reconcileRun(run: ReconciliationRun): ReconciliationRun {
  const bankTransactions = run.transactions.filter((item) => item.source === "bank");
  const ledgerTransactions = run.transactions.filter((item) => item.source === "ledger");
  const usedLedgerIds = new Set<string>();
  const matches: MatchResult[] = [];
  const exceptions: ExceptionRecord[] = [];

  for (const bank of bankTransactions) {
    const ranked = ledgerTransactions
      .filter((ledger) => ledger.bankId === bank.bankId && !usedLedgerIds.has(ledger.id))
      .map((ledger) => ({ ledger, ...scorePair(bank, ledger) }))
      .sort((left, right) => right.confidence - left.confidence);
    const best = ranked[0];

    if (!best || best.confidence < 0.68) {
      const match: MatchResult = {
        id: `match-${slug(bank.id)}-unmatched`,
        runId: run.id,
        bankTransactionId: bank.id,
        status: "unmatched",
        type: "unmatched",
        confidence: 0,
        explanation: "No ledger transaction met the medium confidence threshold.",
      };
      matches.push(match);
      exceptions.push(makeException(match));
      continue;
    }

    usedLedgerIds.add(best.ledger.id);
    const type =
      best.amountDelta > 0
        ? "amount-mismatch"
        : best.dateDelta > 0
          ? "date-mismatch"
          : best.confidence >= 0.95
            ? "exact"
            : "probable";
    const match: MatchResult = {
      id: `match-${slug(bank.id)}-${slug(best.ledger.id)}`,
      runId: run.id,
      bankTransactionId: bank.id,
      ledgerTransactionId: best.ledger.id,
      status: "matched",
      type,
      confidence: best.confidence,
      explanation: mockAiReasoning(type, best.reasons, best.confidence),
    };
    matches.push(match);
    if (type === "date-mismatch" || type === "amount-mismatch") {
      exceptions.push(makeException(match));
    }
  }

  for (const ledger of ledgerTransactions.filter((item) => !usedLedgerIds.has(item.id))) {
    const match: MatchResult = {
      id: `match-${slug(ledger.id)}-unmatched`,
      runId: run.id,
      ledgerTransactionId: ledger.id,
      status: "unmatched",
      type: "unmatched",
      confidence: 0,
      explanation: "Yardi ledger transaction has no matching bank statement item.",
    };
    matches.push(match);
    exceptions.push(makeException(match));
  }

  return {
    ...run,
    status: exceptions.length ? "review" : "approved",
    matches,
    exceptions,
    updatedAt: now(),
  };
}

export function summarizeRun(run: ReconciliationRun) {
  const matched = run.matches.filter((match) => match.status === "matched").length;
  const ambiguous = run.matches.filter((match) => match.status === "ambiguous").length;
  const unmatched = run.matches.filter((match) => match.status === "unmatched").length;
  const resolved = run.exceptions.filter((exception) => exception.status === "resolved").length;
  const ledgerTotal = run.transactions
    .filter((item) => item.source === "ledger")
    .reduce((sum, item) => sum + item.credit - item.debit, 0);
  const bankTotal = run.transactions
    .filter((item) => item.source === "bank")
    .reduce((sum, item) => sum + item.credit - item.debit, 0);

  return {
    matched,
    ambiguous,
    unmatched,
    exceptions: run.exceptions.length,
    resolved,
    unresolved: run.exceptions.length - resolved,
    ledgerTotal,
    bankTotal,
    closingVariance: (run.closingBalance ?? 0) - bankTotal,
  };
}

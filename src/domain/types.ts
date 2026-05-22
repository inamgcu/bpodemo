export type EntityStatus = "active" | "inactive";

export type BankAccount = {
  id: string;
  propertyId: string;
  name: string;
  accountNumber: string;
  yardiCode: string;
  status: EntityStatus;
};

export type Property = {
  id: string;
  code: string;
  name: string;
  status: EntityStatus;
};

export type UploadedFileKind = "property-bank-config" | "bank-statement" | "yardi-ledger";
export type UploadedFileStatus = "uploaded" | "parsed" | "error";

export type UploadedFile = {
  id: string;
  name: string;
  kind: UploadedFileKind;
  status: UploadedFileStatus;
  rowCount: number;
  uploadedAt: string;
  bankId?: string;
  error?: string;
};

export type TransactionSource = "bank" | "ledger";

export type Transaction = {
  id: string;
  runId: string;
  propertyId: string;
  bankId: string;
  source: TransactionSource;
  date: string;
  postedDate?: string;
  description: string;
  reference?: string;
  debit: number;
  credit: number;
  amount: number;
  runningBalance?: number;
  sourceFile: string;
  sourceRow?: number;
  yardiId?: string;
};

export type MatchStatus = "matched" | "unmatched" | "ambiguous";
export type MatchType = "exact" | "probable" | "date-mismatch" | "amount-mismatch" | "unmatched";

export type MatchResult = {
  id: string;
  runId: string;
  bankTransactionId?: string;
  ledgerTransactionId?: string;
  status: MatchStatus;
  type: MatchType;
  confidence: number;
  explanation: string;
};

export type ExceptionStatus = "open" | "resolved";
export type UserDecision = "approve" | "reject" | "edit" | "manual-link" | "unresolved";

export type ExceptionRecord = {
  id: string;
  runId: string;
  matchId: string;
  category:
    | "unmatched-bank-transaction"
    | "unmatched-ledger-transaction"
    | "date-mismatch"
    | "amount-mismatch"
    | "possible-duplicate"
    | "human-review-required";
  status: ExceptionStatus;
  severity: "low" | "medium" | "high";
  aiReasoning: string;
  confidence: number;
  userDecision?: UserDecision;
  userFeedback?: string;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  runId?: string;
  actor: string;
  action: string;
  detail: string;
  timestamp: string;
};

export type RunStatus =
  | "setup"
  | "uploads"
  | "processing"
  | "review"
  | "approved"
  | "automation"
  | "complete";

export type ReconciliationRun = {
  id: string;
  propertyId: string;
  month: string;
  status: RunStatus;
  closingBalance?: number;
  createdAt: string;
  updatedAt: string;
  files: UploadedFile[];
  transactions: Transaction[];
  matches: MatchResult[];
  exceptions: ExceptionRecord[];
  automationLogs: string[];
  approvedBy?: string;
  approvedAt?: string;
  finalReportPath?: string;
};

export type AppData = {
  properties: Property[];
  banks: BankAccount[];
  runs: ReconciliationRun[];
  selectedPropertyId: string;
  activeRunId?: string;
  auditLogs: AuditLog[];
};

export type DashboardMetrics = {
  properties: number;
  banks: number;
  runs: number;
  exceptions: number;
};

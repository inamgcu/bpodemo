CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE properties (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT,
  name TEXT,
  status TEXT,
  raw_payload TEXT NOT NULL
);

CREATE TABLE banks (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT,
  name TEXT,
  account_number TEXT,
  yardi_code TEXT,
  status TEXT,
  raw_payload TEXT NOT NULL
);

CREATE TABLE reconciliation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT,
  month TEXT,
  status TEXT,
  closing_balance REAL,
  created_at TEXT,
  updated_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  final_report_path TEXT,
  raw_payload TEXT NOT NULL
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT,
  property_id TEXT,
  bank_id TEXT,
  source TEXT,
  transaction_date TEXT,
  posted_date TEXT,
  description TEXT,
  reference TEXT,
  debit REAL,
  credit REAL,
  amount REAL,
  source_file TEXT,
  yardi_id TEXT,
  raw_payload TEXT NOT NULL
);

CREATE TABLE exceptions (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT,
  match_id TEXT,
  category TEXT,
  status TEXT,
  severity TEXT,
  confidence REAL,
  updated_at TEXT,
  raw_payload TEXT NOT NULL
);

CREATE TABLE ai_reasoning (
  id TEXT PRIMARY KEY NOT NULL,
  exception_id TEXT,
  run_id TEXT,
  reasoning TEXT,
  confidence REAL,
  raw_payload TEXT NOT NULL
);

CREATE TABLE user_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  exception_id TEXT,
  run_id TEXT,
  decision TEXT,
  feedback TEXT,
  updated_at TEXT,
  raw_payload TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT,
  actor TEXT,
  action TEXT,
  detail TEXT,
  event_timestamp TEXT,
  raw_payload TEXT NOT NULL
);

CREATE TABLE uploaded_files_metadata (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT,
  bank_id TEXT,
  name TEXT,
  kind TEXT,
  status TEXT,
  row_count INTEGER,
  uploaded_at TEXT,
  error TEXT,
  raw_payload TEXT NOT NULL
);

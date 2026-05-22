# Architecture

## Frontend

- `src/pages`: workflow screens for dashboard, property configuration, reconciliation, report, exceptions, approval, and history.
- `src/components`: reusable UI primitives and navigation metadata.
- `src/state/AppStateContext.tsx`: reducer-driven application state, hydration, local persistence, active run selection, and audit actions.
- `src/domain`: pure business logic, seed data, month guardrails, reconciliation matching, summaries, and shared types.
- `src/services`: Tauri bridge, Excel import, mock PDF/ledger data, and Excel report export.

## Backend

- `src-tauri/src/lib.rs`: Tauri commands, SQLite persistence, normalized projection tables, report file export, and Python/Node automation wrappers.
- `src-tauri/tests`: storage/projection tests.

## Data Flow

User actions update reducer state. The state provider persists a snapshot through Tauri `save_app_state`; the Rust backend writes the JSON snapshot and refreshes normalized SQLite projection tables. Reports are generated in the frontend as XLSX bytes and written through Tauri to the local app-data reports folder.

## Agent Model

- Financial Data Parsing Agent: mocked PDF/Excel extraction, provenance, and logs.
- Reconciliation Agent: deterministic matching by amount, date, reference, and direction.
- Exception Review Agent: generates explanations and stores reviewer feedback.
- Yardi Posting Automation: runs `Yardi-Automation.ts` from the Tauri backend through a local Node/Stagehand runtime, drives the local mock Yardi app, waits for completion, and refocuses the desktop app.
- Summary Report Agent: exports an Excel report with summary, matches, exceptions, and transactions.

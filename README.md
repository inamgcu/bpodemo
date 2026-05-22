# BPO Yardi Reconciliation App

Standalone Tauri + React + TypeScript desktop reconciliation application for the BPO/Yardi PRD workflow.

## Stack

- Frontend: React + TypeScript + Vite
- Desktop: Tauri v2
- Local persistence: SQLite through the Tauri backend
- Reports and sample workbooks: ExcelJS
- Browser automation hook: `C:\Users\inamul.haq\Downloads\Gmail-Agent.ts` for packaged desktop runs

## Run Locally

```powershell
cd C:\Work\Trainings\bpo-yardi-reconciliation-app
npm install
npm run samples:generate
npm run dev
```

Full desktop dev shell:

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri dev
```

## Verify

```powershell
npm run test:run
npm run build
cd src-tauri
& "$env:USERPROFILE\.cargo\bin\cargo.exe" test
```

## Build Windows Installer

```powershell
cd C:\Work\Trainings\bpo-yardi-reconciliation-app
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri build
```

Generated artifacts:

- `src-tauri\target\release\bpo_yardi_reconciliation.exe`
- `src-tauri\target\release\bundle\nsis\BPO Yardi Reconciliation_0.1.0_x64-setup.exe`
- `src-tauri\target\release\bundle\msi\BPO Yardi Reconciliation_0.1.0_x64_en-US.msi`

## Included Workflow

1. Dashboard with property, bank, run, and exception metrics.
2. Property configuration with accordion rows, single-property selection, bank CRUD, delete confirmation, and Excel import.
3. Reconciliation wizard with M-1 month guardrail, closing balance, one bank-statement upload lane per bank, ledger Excel upload, and sample files.
4. Mock financial parsing and reconciliation agents with live logs.
5. Report screen with matched, unmatched, ambiguous, and closing-balance metrics.
6. Exception review with AI reasoning, confidence, reviewer approval/rejection/edit feedback, and local learning trail.
7. Human approval gate before Yardi marking.
8. Tauri command that runs the provided TypeScript Stagehand automation script, shows live logs, waits for completion, refocuses the desktop app, and shows the final report.
9. Audit history with previous runs, statuses, exception counts, user actions, reopen, and export.

## SQLite Schema

See `docs/sqlite-schema.sql`.

The packaged app stores `reconciliation.db` under the platform app-data directory. Vite-only browser development uses `localStorage` fallback.

## Assumptions and Mock Implementations

- V1 data ingestion is import-based. No external bank/Yardi APIs are called.
- PDF parsing is deterministic mock OCR for demo use.
- Reconciliation is deterministic and explainable rather than an external LLM call.
- In the packaged Tauri app, browser automation runs `C:\Users\inamul.haq\Downloads\Gmail-Agent.ts`. The backend copies the script into an app-data Node runtime, installs `tsx` and `@browserbasehq/stagehand` there when missing, streams script output to the approval screen, waits for the script to finish, returns focus to the desktop window, records output logs, and navigates to the report. Node.js/npm must be available on the Windows machine for this external TypeScript automation hook.
- Exception feedback is stored locally and represented as reusable reviewer memory.
- All financial data, reports, audit logs, and uploaded-file metadata remain local.

# File Map

- `src/domain/types.ts`: shared TypeScript data contracts.
- `src/domain/seed.ts`: 5-property / 20-bank starter data.
- `src/domain/month.ts`: M-1 month validation.
- `src/domain/reconciliation.ts`: deterministic mock reconciliation engine and report summary math.
- `src/state/AppStateContext.tsx`: reducer state, persistence, active run helpers.
- `src/services/desktop.ts`: Tauri command bridge and browser fallback.
- `src/services/fileImport.ts`: Excel import parsing.
- `src/services/mockFiles.ts`: mock PDF OCR and ledger transaction generation.
- `src/services/reports.ts`: Excel report workbook export.
- `src/pages/*.tsx`: workflow screens.
- `src-tauri/src/lib.rs`: SQLite schema/projection, report file writer, visible browser automation command, and Node/Stagehand script runner.
- `scripts/generate-samples.mjs`: sample workbook/PDF generator.
- `public/samples`: generated test/demo files.

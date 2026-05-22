import { Calendar, CheckCircle2, FileText, FileUp, ListChecks, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, MetricCard, StatusBadge, type ViewId } from "../components/Ui";
import { getMaxReconciliationMonth, isAllowedReconciliationMonth } from "../domain/month";
import { importLedgerWorkbook } from "../services/fileImport";
import { ledgerAutomationScript, listenToAutomationLogs, prewarmBrowserAutomation, runBrowserAutomation } from "../services/desktop";
import { mockBankStatementTransactions, mockLedgerTransactions, uploadedFile } from "../services/mockFiles";
import { useAppState } from "../state/AppStateContext";
import {
  type EvidenceRow,
  getAgentCompletionNavigationView,
  getAgentProcessingLogs,
  getExtractionSplitPanes,
  getReconciliationEvidence,
  getReconciliationStartReadiness,
  getReconciliationUploadSections,
  getSelectedReconciliationBanks,
  getYardiLedgerAutomationButtonState,
} from "./pageBehavior";

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function ReconcilePage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, activeRun, dispatch } = useAppState();
  const [step, setStep] = useState(1);
  const [propertyId, setPropertyId] = useState(state.selectedPropertyId);
  const [bankId, setBankId] = useState(() => state.banks.find((bank) => bank.propertyId === state.selectedPropertyId)?.id ?? "");
  const [month, setMonth] = useState(getMaxReconciliationMonth());
  const [closingBalance, setClosingBalance] = useState("");
  const [processing, setProcessing] = useState(false);
  const [ledgerAutomationRunning, setLedgerAutomationRunning] = useState(false);
  const prewarmedRunIds = useRef(new Set<string>());
  const maxMonth = getMaxReconciliationMonth();
  const selectedBanks = useMemo(() => state.banks.filter((bank) => bank.propertyId === propertyId), [propertyId, state.banks]);
  const runBanks = useMemo(
    () => activeRun
      ? getSelectedReconciliationBanks({ banks: state.banks, propertyId: activeRun.propertyId, bankId: activeRun.bankId })
      : getSelectedReconciliationBanks({ banks: state.banks, propertyId, bankId }),
    [activeRun, bankId, propertyId, state.banks],
  );
  const selectedRunBankId = activeRun?.bankId ?? runBanks[0]?.id;
  const bankUploadCount = activeRun?.files.filter((file) =>
    file.kind === "bank-statement" && (!selectedRunBankId || file.bankId === selectedRunBankId)
  ).length ?? 0;
  const ledgerUploaded = Boolean(activeRun?.files.some((file) => file.kind === "yardi-ledger"));
  const uploadSections = useMemo(
    () => getReconciliationUploadSections({
      banks: runBanks,
      files: activeRun?.files ?? [],
      ledgerUploaded,
    }),
    [activeRun?.files, ledgerUploaded, runBanks],
  );
  const bankSection = uploadSections.find((section) => section.id === "bank-statements");
  const ledgerSection = uploadSections.find((section) => section.id === "yardi-ledger");
  const activeRunId = activeRun?.id;
  const evidence = useMemo(
    () => activeRun
      ? getReconciliationEvidence({ transactions: activeRun.transactions, matches: activeRun.matches })
      : undefined,
    [activeRun],
  );
  const extractionPanes = useMemo(() => getExtractionSplitPanes(evidence), [evidence]);
  const ledgerAutomationButton = getYardiLedgerAutomationButtonState(ledgerAutomationRunning);

  useEffect(() => {
    if (step !== 2 || !activeRunId || prewarmedRunIds.current.has(activeRunId)) return;
    prewarmedRunIds.current.add(activeRunId);
    let cancelled = false;
    dispatch({
      type: "append-run-log",
      runId: activeRunId,
      line: "Preparing browser automation runtime in the background...",
    });
    prewarmBrowserAutomation(ledgerAutomationScript)
      .then((lines) => {
        if (cancelled) return;
        for (const line of lines) {
          dispatch({ type: "append-run-log", runId: activeRunId, line });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Unable to prepare browser automation runtime.";
        dispatch({ type: "append-run-log", runId: activeRunId, line: `Browser automation runtime preparation skipped: ${message}` });
      });
    return () => {
      cancelled = true;
    };
  }, [activeRunId, dispatch, step]);

  function closingBalanceCandidate() {
    return closingBalance.trim() || (activeRun?.closingBalance !== undefined ? String(activeRun.closingBalance) : "");
  }

  function validateAndSaveBalance(ledgerReady = ledgerUploaded) {
    if (!activeRun) return false;
    const value = closingBalanceCandidate();
    const readiness = getReconciliationStartReadiness({
      selectedBankCount: runBanks.length,
      bankUploadCount,
      ledgerUploaded: ledgerReady,
      closingBalanceValue: value,
    });
    if (!readiness.ready) {
      dispatch({ type: "toast", tone: "warning", message: readiness.message ?? "Reconciliation inputs are incomplete." });
      return false;
    }
    dispatch({ type: "set-closing-balance", runId: activeRun.id, closingBalance: Number(value) });
    return true;
  }

  function startRun() {
    if (!isAllowedReconciliationMonth(month)) {
      dispatch({ type: "toast", tone: "danger", message: `Month must be ${maxMonth} or earlier.` });
      return;
    }
    if (!bankId) {
      dispatch({ type: "toast", tone: "danger", message: "Select a bank before starting reconciliation." });
      return;
    }
    dispatch({ type: "start-run", propertyId, month, bankId });
    setStep(2);
  }

  function changeProperty(nextPropertyId: string) {
    setPropertyId(nextPropertyId);
    setBankId(state.banks.find((bank) => bank.propertyId === nextPropertyId)?.id ?? "");
  }

  function saveBalance() {
    const value = closingBalanceCandidate();
    const parsed = Number(value);
    if (!activeRun || !value || !Number.isFinite(parsed)) {
      dispatch({ type: "toast", tone: "danger", message: "Enter a valid closing balance." });
      return false;
    }
    dispatch({ type: "set-closing-balance", runId: activeRun.id, closingBalance: parsed });
    return true;
  }

  function loadBankSample(bankId: string, fileName?: string) {
    if (!activeRun) return;
    const bank = state.banks.find((item) => item.id === bankId);
    if (!bank) return;
    const transactions = mockBankStatementTransactions({
      runId: activeRun.id,
      propertyId: activeRun.propertyId,
      bank,
      month: activeRun.month,
      fileName,
    });
    dispatch({
      type: "attach-file",
      runId: activeRun.id,
      file: uploadedFile(fileName ?? `${bank.name}-${activeRun.month}.pdf`, "bank-statement", transactions.length, bank.id),
      transactions,
      log: `Parsing ${bank.name} statement... extracted ${transactions.length} transactions and saved to SQLite.`,
    });
  }

  async function uploadLedger(file?: File) {
    if (!file || !activeRun) return;
    try {
      const transactions = await importLedgerWorkbook(file, {
        runId: activeRun.id,
        propertyId: activeRun.propertyId,
        bankId: runBanks[0]?.id ?? "",
        month: activeRun.month,
      });
      dispatch({
        type: "attach-file",
        runId: activeRun.id,
        file: uploadedFile(file.name, "yardi-ledger", transactions.length),
        transactions,
        log: "Ledger uploaded successfully. Parsed rows saved to local SQLite.",
      });
    } catch (error) {
      dispatch({ type: "toast", tone: "danger", message: error instanceof Error ? error.message : "Unable to upload ledger." });
    }
  }

  function attachLedgerSample(fileName?: string, log?: string) {
    if (!activeRun) return;
    const ledgerFileName = fileName ?? `yardi-ledger-${activeRun.month}.xlsx`;
    const transactions = runBanks.flatMap((bank) =>
      mockLedgerTransactions({ runId: activeRun.id, propertyId: activeRun.propertyId, bank, month: activeRun.month, fileName: ledgerFileName }),
    );
    dispatch({
      type: "attach-file",
      runId: activeRun.id,
      file: uploadedFile(ledgerFileName, "yardi-ledger", transactions.length),
      transactions,
      log: log ?? "Ledger uploaded successfully. Mock Yardi export normalized and saved to database.",
    });
  }

  function loadLedgerSample() {
    attachLedgerSample();
  }

  async function runAgentPipeline(runId: string) {
    setStep(3);
    setProcessing(true);
    const logs = getAgentProcessingLogs();
    for (const line of logs.slice(0, -1)) {
      dispatch({ type: "append-run-log", runId, line });
      await delay(180);
    }
    dispatch({ type: "process-run", runId });
    dispatch({ type: "append-run-log", runId, line: logs.at(-1) ?? "Calculation completed." });
    setProcessing(false);
    onNavigate(getAgentCompletionNavigationView());
  }

  async function getLedgerFromYardiVoyager() {
    if (!activeRun) return;
    setLedgerAutomationRunning(true);
    dispatch({
      type: "append-run-log",
      runId: activeRun.id,
      line: "Launching automation-scripts\\Gmail-Agent.ts to retrieve Yardi Voyager ledger...",
    });
    let unlisten: (() => void) | undefined;
    let streamedLineCount = 0;
    try {
      unlisten = await listenToAutomationLogs((line) => {
        streamedLineCount += 1;
        dispatch({ type: "append-run-log", runId: activeRun.id, line });
      });
      const result = await runBrowserAutomation(ledgerAutomationScript);
      const lines = [
        `Gmail-Agent.ts finished with exit code ${result.exitCode ?? "unknown"}.`,
        ...(streamedLineCount ? [`Captured ${streamedLineCount} live automation log line(s).`] : result.lines),
        "Browser automation completed. Browser closed. Auto-populating sample Yardi ledger.",
      ];
      for (const line of lines) {
        dispatch({ type: "append-run-log", runId: activeRun.id, line });
      }
      attachLedgerSample(
        `yardi-voyager-ledger-${activeRun.month}.xlsx`,
        "Yardi Voyager ledger retrieved by browser automation. Sample ledger normalized and saved to database.",
      );
      const readiness = getReconciliationStartReadiness({
        selectedBankCount: runBanks.length,
        bankUploadCount,
        ledgerUploaded: true,
        closingBalanceValue: closingBalanceCandidate(),
      });
      if (readiness.ready && validateAndSaveBalance(true)) {
        dispatch({ type: "append-run-log", runId: activeRun.id, line: "Yardi ledger retrieval completed. Auto-starting reconciliation." });
        dispatch({
          type: "toast",
          tone: result.exitCode === 0 ? "success" : "warning",
          message: result.exitCode === 0
            ? "Yardi Voyager ledger retrieved. Reconciliation started automatically."
            : "Browser automation returned a non-zero exit code. Sample ledger loaded and reconciliation started for review.",
        });
        await runAgentPipeline(activeRun.id);
      } else {
        dispatch({
          type: "toast",
          tone: "warning",
          message: `Yardi Voyager ledger loaded. ${readiness.message ?? "Complete the remaining inputs to start reconciliation."}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to retrieve ledger from Yardi Voyager.";
      dispatch({ type: "append-run-log", runId: activeRun.id, line: `Gmail-Agent.ts failed to launch: ${message}` });
      dispatch({ type: "toast", tone: "danger", message });
    } finally {
      unlisten?.();
      setLedgerAutomationRunning(false);
    }
  }

  async function processRun() {
    if (!activeRun) return;
    if (!validateAndSaveBalance()) return;
    await runAgentPipeline(activeRun.id);
  }

  function renderExtractionRows(rows: EvidenceRow[], mode: "bank" | "ledger") {
    if (!rows.length) {
      return (
        <EmptyState
          title={mode === "bank" ? "No bank rows extracted yet" : "No ledger rows extracted yet"}
          detail="Upload a file or load a sample to preview parsed transactions."
        />
      );
    }

    return (
      <div className="transaction-table-wrap">
        <table className="transaction-table transaction-table--extract">
          <thead>
            <tr>
              <th>Description</th>
              <th>Reference</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Amount</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${mode}-${row.transactionId}`}>
                <td className="transaction-description">{row.description}</td>
                <td>{row.reference ?? "-"}</td>
                <td>{row.debit ? money(row.debit) : "-"}</td>
                <td>{row.credit ? money(row.credit) : "-"}</td>
                <td>{money(row.amount)}</td>
                <td>{row.sourceFile}{row.sourceRow ? ` #${row.sourceRow}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <main className="page">
      <section className="stepper">
        {["Setup", "Uploads", "Agents"].map((label, index) => (
          <button className={step === index + 1 ? "active" : ""} key={label} type="button" onClick={() => setStep(index + 1)}>
            <span>{index + 1}</span>{label}
          </button>
        ))}
      </section>

      <section className="summary-grid">
        <MetricCard label="Selected bank" value={runBanks[0]?.name ?? "None"} detail="one upload lane" />
        <MetricCard label="Statements" value={bankUploadCount} detail="PDF uploads or samples" />
        <MetricCard label="Ledger" value={ledgerUploaded ? "Ready" : "Missing"} detail="Excel upload required" />
        <MetricCard label="Month max" value={maxMonth} detail="M-1 guardrail" />
      </section>

      {step === 1 ? (
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Step 1</p><h2>Reconciliation setup</h2></div>
            <Calendar size={22} />
          </div>
          <div className="form-grid">
            <select value={propertyId} onChange={(event) => changeProperty(event.target.value)}>
              {state.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <select value={bankId} disabled={!selectedBanks.length} onChange={(event) => setBankId(event.target.value)}>
              {selectedBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.name} / {bank.accountNumber}</option>)}
            </select>
            <input type="month" value={month} max={maxMonth} onChange={(event) => setMonth(event.target.value)} />
            <button className="primary-button" type="button" disabled={!bankId || !isAllowedReconciliationMonth(month)} onClick={startRun}>
              <CheckCircle2 size={16} />Next
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 && activeRun ? (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Step 2</p><h2>Closing balance</h2></div>
              <FileUp size={22} />
            </div>
            <div className="form-grid compact-form">
              <input inputMode="decimal" placeholder="Closing balance" value={closingBalance} onChange={(event) => setClosingBalance(event.target.value)} />
              <button className="secondary-button" type="button" onClick={saveBalance}>Save Balance</button>
            </div>
          </section>

          <section className="panel upload-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">{bankSection?.eyebrow}</p><h2>{bankSection?.title}</h2></div>
              <StatusBadge tone={bankUploadCount === runBanks.length && runBanks.length ? "success" : "warning"}>{bankUploadCount}/{runBanks.length}</StatusBadge>
            </div>
            <div className="upload-list">
              {bankSection?.rows.map((row) => (
                <div className="upload-row" key={row.id}>
                  <div className="upload-row-main">
                    <StatusBadge tone={row.uploaded ? "success" : "neutral"}>{row.uploaded ? "ready" : "missing"}</StatusBadge>
                    <div>
                      <strong>{row.title}</strong>
                      <span>{row.fileName ?? row.detail}</span>
                    </div>
                  </div>
                  <div className="upload-row-actions">
                    <button className="secondary-button" type="button" onClick={() => row.bankId && loadBankSample(row.bankId)}><FileText size={16} />Sample PDF</button>
                    <label className="file-button"><FileUp size={16} />Upload PDF<input type="file" accept=".pdf" onChange={(event) => row.bankId && loadBankSample(row.bankId, event.target.files?.[0]?.name)} /></label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel upload-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">{ledgerSection?.eyebrow}</p><h2>{ledgerSection?.title}</h2></div>
              <StatusBadge tone={ledgerUploaded ? "success" : "warning"}>{ledgerUploaded ? "ready" : "missing"}</StatusBadge>
            </div>
            <div className="upload-list">
              {ledgerSection?.rows.map((row) => (
                <div className="upload-row" key={row.id}>
                  <div className="upload-row-main">
                    <StatusBadge tone={row.uploaded ? "success" : "neutral"}>{row.uploaded ? "ready" : "missing"}</StatusBadge>
                    <div>
                      <strong>{row.title}</strong>
                      <span>{row.fileName ?? row.detail}</span>
                    </div>
                  </div>
                  <div className="upload-row-actions">
                    <button className="secondary-button" type="button" disabled={ledgerAutomationButton.disabled} onClick={getLedgerFromYardiVoyager}>
                      <Play size={16} />{ledgerAutomationButton.label}
                    </button>
                    <button className="secondary-button" type="button" onClick={loadLedgerSample}><FileText size={16} />Sample Excel</button>
                    <label className="file-button"><FileUp size={16} />Upload Excel<input type="file" accept=".xlsx,.xls" onChange={(event) => uploadLedger(event.target.files?.[0])} /></label>
                  </div>
                </div>
              ))}
            </div>
            <div className="sample-links">
              <a href="/samples/property-bank-import-sample.xlsx" target="_blank">Property-bank Excel</a>
              <a href="/samples/yardi-ledger-sample.xlsx" target="_blank">Ledger Excel</a>
              <a href="/samples/cedar-heights-operating-bank-2026-04.pdf" target="_blank">Sample PDF</a>
            </div>
          </section>

          <section className="panel evidence-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Extracted data</p><h2>Bank and ledger extract</h2></div>
              <ListChecks size={22} />
            </div>
            <div className="evidence-summary evidence-summary--split">
              <span><strong>{evidence?.bankRows.length ?? 0}</strong> bank transaction(s) extracted</span>
              <span><strong>{evidence?.ledgerRows.length ?? 0}</strong> ledger transaction(s) extracted</span>
            </div>
            <div className="extraction-split">
              {extractionPanes.map((pane) => (
                <section className="extraction-pane" key={pane.id} aria-label={pane.title}>
                  <div className="extraction-pane-heading">
                    <h3>{pane.title}</h3>
                    <StatusBadge tone={pane.rows.length ? "success" : "neutral"}>{pane.rows.length}</StatusBadge>
                  </div>
                  {renderExtractionRows(pane.rows, pane.id)}
                </section>
              ))}
            </div>
          </section>

          <div className="action-strip action-strip--end">
            <button className="primary-button" type="button" onClick={processRun}><Play size={16} />Start Reconciliation</button>
          </div>
        </>
      ) : null}

      {step === 3 && activeRun ? (
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">AI / Agent processing</p><h2>Live logs</h2></div>
            <StatusBadge tone={processing ? "info" : "success"}>{processing ? "running" : activeRun.status}</StatusBadge>
          </div>
          <div className="log-box">
            {activeRun.automationLogs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
          </div>
          <div className="action-strip action-strip--end">
            <button className="secondary-button" type="button" onClick={() => onNavigate("report")}><ListChecks size={16} />Open Reconciliation Report</button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

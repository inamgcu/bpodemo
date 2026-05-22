import { Calendar, CheckCircle2, FileText, FileUp, Play, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard, StatusBadge, type ViewId } from "../components/Ui";
import { getMaxReconciliationMonth, isAllowedReconciliationMonth } from "../domain/month";
import { importLedgerWorkbook } from "../services/fileImport";
import { mockBankStatementTransactions, mockLedgerTransactions, uploadedFile } from "../services/mockFiles";
import { useAppState } from "../state/AppStateContext";
import { getReconciliationUploadSections } from "./pageBehavior";

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function ReconcilePage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, activeRun, dispatch } = useAppState();
  const [step, setStep] = useState(1);
  const [propertyId, setPropertyId] = useState(state.selectedPropertyId);
  const [month, setMonth] = useState(getMaxReconciliationMonth());
  const [closingBalance, setClosingBalance] = useState("");
  const [processing, setProcessing] = useState(false);
  const maxMonth = getMaxReconciliationMonth();
  const selectedBanks = useMemo(() => state.banks.filter((bank) => bank.propertyId === propertyId), [propertyId, state.banks]);
  const runBanks = activeRun ? state.banks.filter((bank) => bank.propertyId === activeRun.propertyId) : selectedBanks;
  const bankUploadCount = activeRun?.files.filter((file) => file.kind === "bank-statement").length ?? 0;
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

  function startRun() {
    if (!isAllowedReconciliationMonth(month)) {
      dispatch({ type: "toast", tone: "danger", message: `Month must be ${maxMonth} or earlier.` });
      return;
    }
    dispatch({ type: "start-run", propertyId, month });
    setStep(2);
  }

  function saveBalance() {
    const parsed = Number(closingBalance);
    if (!activeRun || !Number.isFinite(parsed)) {
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

  function loadLedgerSample() {
    if (!activeRun) return;
    const transactions = runBanks.flatMap((bank) =>
      mockLedgerTransactions({ runId: activeRun.id, propertyId: activeRun.propertyId, bank, month: activeRun.month }),
    );
    dispatch({
      type: "attach-file",
      runId: activeRun.id,
      file: uploadedFile(`yardi-ledger-${activeRun.month}.xlsx`, "yardi-ledger", transactions.length),
      transactions,
      log: "Ledger uploaded successfully. Mock Yardi export normalized and saved to database.",
    });
  }

  async function processRun() {
    if (!activeRun) return;
    if (!saveBalance()) return;
    if (!bankUploadCount || !ledgerUploaded) {
      dispatch({ type: "toast", tone: "warning", message: "Upload bank statements and a ledger before starting reconciliation." });
      return;
    }
    setStep(3);
    setProcessing(true);
    const logs = [
      "Financial Data Parsing Agent: validating uploaded files...",
      "Extracting transactions...",
      "Saving to database...",
      "Reconciliation Agent: matching transactions...",
      "Detecting exceptions...",
      "Calculating balances...",
    ];
    for (const line of logs) {
      dispatch({ type: "append-run-log", runId: activeRun.id, line });
      await delay(180);
    }
    dispatch({ type: "process-run", runId: activeRun.id });
    setProcessing(false);
    onNavigate("report");
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
        <MetricCard label="Bank sections" value={runBanks.length} detail="one upload lane per bank" />
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
            <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
              {state.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <input type="month" value={month} max={maxMonth} onChange={(event) => setMonth(event.target.value)} />
            <button className="primary-button" type="button" disabled={!isAllowedReconciliationMonth(month)} onClick={startRun}>
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

          <div className="action-strip action-strip--end">
            <button className="secondary-button" type="button" onClick={() => dispatch({ type: "append-run-log", runId: activeRun.id, line: "Approval captured before Yardi ledger sync." })}>
              <ShieldCheck size={16} />Approve Yardi Sync
            </button>
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
        </section>
      ) : null}
    </main>
  );
}

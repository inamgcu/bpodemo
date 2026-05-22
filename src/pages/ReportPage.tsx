import { Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { EmptyState, MetricCard, StatusBadge, type ViewId } from "../components/Ui";
import { summarizeRun } from "../domain/reconciliation";
import type { UserDecision } from "../domain/types";
import { exportBinaryFile } from "../services/desktop";
import { bytesToBase64, createReportWorkbook, reportFileName } from "../services/reports";
import { useAppState } from "../state/AppStateContext";
import { getReportMatchGroups, type ReportMatchRow } from "./pageBehavior";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const statusTone = (status: ReportMatchRow["displayStatus"]) =>
  status === "matched" ? "success" : status === "unmatched" ? "danger" : "warning";

export function ReportPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { activeRun, activeProperty, propertyBanks, dispatch } = useAppState();
  const summary = activeRun ? summarizeRun(activeRun) : undefined;
  const reportGroups = activeRun
    ? getReportMatchGroups({ transactions: activeRun.transactions, matches: activeRun.matches, exceptions: activeRun.exceptions })
    : { matchedRows: [], mismatchRows: [] };
  const [feedbackTarget, setFeedbackTarget] = useState<ReportMatchRow | undefined>();
  const [feedbackDecision, setFeedbackDecision] = useState<UserDecision>("approve");
  const [feedback, setFeedback] = useState("");

  async function exportReport() {
    if (!activeRun) return;
    const bytes = await createReportWorkbook(activeRun, activeProperty, propertyBanks);
    const path = await exportBinaryFile(reportFileName(activeRun, activeProperty), bytesToBase64(bytes));
    dispatch({ type: "set-report-path", runId: activeRun.id, path });
    dispatch({ type: "toast", tone: "success", message: `Report exported: ${path}` });
  }

  function openFeedback(row: ReportMatchRow) {
    if (!row.exceptionId) {
      dispatch({ type: "toast", tone: "warning", message: "No exception record is available for this reason." });
      return;
    }
    setFeedbackTarget(row);
    setFeedbackDecision((row.reasonDecision as UserDecision | undefined) ?? "approve");
    setFeedback(row.reasonFeedback ?? row.explanation);
  }

  function saveFeedback() {
    if (!activeRun || !feedbackTarget?.exceptionId) return;
    dispatch({
      type: "resolve-exception",
      runId: activeRun.id,
      exceptionId: feedbackTarget.exceptionId,
      decision: feedbackDecision,
      feedback,
    });
    dispatch({ type: "toast", tone: "success", message: "Reason feedback saved." });
    setFeedbackTarget(undefined);
  }

  if (!activeRun || !summary) {
    return <main className="page"><section className="panel padded">Start a reconciliation run to view a report.</section></main>;
  }

  return (
    <main className="page">
      <section className="summary-grid">
        <MetricCard label="Matches" value={reportGroups.matchedRows.length} detail="no reason required" />
        <MetricCard label="Mismatches" value={reportGroups.mismatchRows.length} detail="reason provided" />
        <MetricCard label="Unmatched Items" value={summary.unmatched} detail="bank or ledger without counterpart" />
        <MetricCard label="Exceptions" value={summary.exceptions} detail={`${summary.unresolved} open / ${summary.resolved} resolved`} />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Reconciliation report</p><h2>{activeProperty?.name ?? activeRun.propertyId} / {activeRun.month}</h2></div>
          <FileSpreadsheet size={22} />
        </div>
        <div className="action-strip">
          <button className="secondary-button" type="button" onClick={() => onNavigate("exceptions")}>Review Exceptions</button>
          <button className="secondary-button" type="button" onClick={() => onNavigate("approval")}>Approval Gate</button>
          <button className="primary-button" type="button" onClick={exportReport}><Download size={16} />Export Report</button>
        </div>
        {activeRun.finalReportPath ? <p className="success-text padded">Exported: {activeRun.finalReportPath}</p> : null}
        <div className="report-summary-heading">
          <p className="eyebrow">Human-readable match summary</p>
          <h3>Matches and mismatches are listed separately</h3>
          <span>Closing variance: {money(summary.closingVariance)}</span>
        </div>
        <div className="report-section-heading">
          <h3>Matches</h3>
          <StatusBadge tone="success">{reportGroups.matchedRows.length}</StatusBadge>
        </div>
        {reportGroups.matchedRows.length ? (
          <table className="report-match-table">
            <thead><tr><th>Status</th><th>Type</th><th>Bank statement transaction</th><th>Yardi ledger transaction</th><th>Amount check</th><th>Confidence</th></tr></thead>
            <tbody>
              {reportGroups.matchedRows.map((row) => (
                <tr key={row.id}>
                  <td><StatusBadge tone={statusTone(row.displayStatus)}>{row.displayStatus}</StatusBadge></td>
                  <td>{row.type}</td>
                  <td className="report-match-cell">{row.bankSummary}</td>
                  <td className="report-match-cell">{row.ledgerSummary}</td>
                  <td>{row.amountSummary}</td>
                  <td>{Math.round(row.confidence * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No clean matches yet" detail="Run reconciliation after uploading bank and ledger files to see matched transactions." />
        )}
        <div className="report-section-heading">
          <h3>Mismatches</h3>
          <StatusBadge tone={reportGroups.mismatchRows.length ? "warning" : "success"}>{reportGroups.mismatchRows.length}</StatusBadge>
        </div>
        {reportGroups.mismatchRows.length ? (
          <table className="report-match-table">
            <thead><tr><th>Status</th><th>Mismatch Type</th><th>Bank statement transaction</th><th>Yardi ledger transaction</th><th>Amount check</th><th>Reasoning</th><th>Feedback</th><th>Action</th></tr></thead>
            <tbody>
              {reportGroups.mismatchRows.map((row) => (
                <tr key={row.id}>
                  <td><StatusBadge tone={statusTone(row.displayStatus)}>{row.displayStatus}</StatusBadge></td>
                  <td>{row.type}</td>
                  <td className="report-match-cell">{row.bankSummary}</td>
                  <td className="report-match-cell">{row.ledgerSummary}</td>
                  <td>{row.amountSummary}</td>
                  <td className="report-match-cell">{row.explanation}</td>
                  <td className="report-match-cell">{row.reasonFeedback ?? "No feedback saved"}</td>
                  <td><button className="secondary-button" type="button" onClick={() => openFeedback(row)}>Feedback</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No mismatches or exceptions" detail="All reconciled rows are clean matches." />
        )}
      </section>
      {feedbackTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section className="feedback-modal" role="dialog" aria-modal="true" aria-label="Reason feedback">
            <div className="panel-heading">
              <div><p className="eyebrow">Reason feedback</p><h2>{feedbackTarget.type}</h2></div>
              <StatusBadge tone={statusTone(feedbackTarget.displayStatus)}>{feedbackTarget.displayStatus}</StatusBadge>
            </div>
            <div className="feedback-modal-body">
              <p>{feedbackTarget.explanation}</p>
              <select value={feedbackDecision} onChange={(event) => setFeedbackDecision(event.target.value as UserDecision)}>
                <option value="approve">Approve reasoning</option>
                <option value="reject">Reject reasoning</option>
                <option value="edit">Edit reasoning</option>
                <option value="manual-link">Manual link</option>
                <option value="unresolved">Keep unresolved</option>
              </select>
              <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} />
            </div>
            <div className="action-strip action-strip--end feedback-modal-actions">
              <button className="secondary-button" type="button" onClick={() => setFeedbackTarget(undefined)}>Cancel</button>
              <button className="primary-button" type="button" onClick={saveFeedback}>Save Feedback</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

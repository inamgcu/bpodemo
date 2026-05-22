import { Download, FileSpreadsheet } from "lucide-react";
import { MetricCard, StatusBadge, type ViewId } from "../components/Ui";
import { summarizeRun } from "../domain/reconciliation";
import { exportBinaryFile } from "../services/desktop";
import { bytesToBase64, createReportWorkbook, reportFileName } from "../services/reports";
import { useAppState } from "../state/AppStateContext";

export function ReportPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { activeRun, activeProperty, propertyBanks, dispatch } = useAppState();
  const summary = activeRun ? summarizeRun(activeRun) : undefined;

  async function exportReport() {
    if (!activeRun) return;
    const bytes = await createReportWorkbook(activeRun, activeProperty, propertyBanks);
    const path = await exportBinaryFile(reportFileName(activeRun, activeProperty), bytesToBase64(bytes));
    dispatch({ type: "set-report-path", runId: activeRun.id, path });
    dispatch({ type: "toast", tone: "success", message: `Report exported: ${path}` });
  }

  if (!activeRun || !summary) {
    return <main className="page"><section className="panel padded">Start a reconciliation run to view a report.</section></main>;
  }

  return (
    <main className="page">
      <section className="summary-grid">
        <MetricCard label="Matched" value={summary.matched} detail="exact high-confidence" />
        <MetricCard label="Unmatched" value={summary.unmatched} detail="requires review" />
        <MetricCard label="Ambiguous" value={summary.ambiguous} detail="AI suggested review" />
        <MetricCard label="Variance" value={summary.closingVariance.toLocaleString()} detail="closing balance comparison" />
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
        <table>
          <thead><tr><th>Status</th><th>Type</th><th>Confidence</th><th>Bank Txn</th><th>Ledger Txn</th><th>Explanation</th></tr></thead>
          <tbody>
            {activeRun.matches.map((match) => (
              <tr key={match.id}>
                <td><StatusBadge tone={match.status === "matched" ? "success" : match.status === "ambiguous" ? "warning" : "danger"}>{match.status}</StatusBadge></td>
                <td>{match.type}</td>
                <td>{Math.round(match.confidence * 100)}%</td>
                <td>{match.bankTransactionId ?? "none"}</td>
                <td>{match.ledgerTransactionId ?? "none"}</td>
                <td>{match.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

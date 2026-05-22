import { Download, FolderOpen } from "lucide-react";
import { StatusBadge, type ViewId } from "../components/Ui";
import { summarizeRun } from "../domain/reconciliation";
import { exportBinaryFile } from "../services/desktop";
import { bytesToBase64, createReportWorkbook, reportFileName } from "../services/reports";
import { useAppState } from "../state/AppStateContext";

export function HistoryPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, dispatch } = useAppState();

  async function exportRun(runId: string) {
    const run = state.runs.find((item) => item.id === runId);
    const property = state.properties.find((item) => item.id === run?.propertyId);
    const banks = state.banks.filter((bank) => bank.propertyId === run?.propertyId);
    if (!run) return;
    const bytes = await createReportWorkbook(run, property, banks);
    const path = await exportBinaryFile(reportFileName(run, property), bytesToBase64(bytes));
    dispatch({ type: "set-report-path", runId, path });
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Audit history / pipeline runs</p><h2>Historical reconciliation runs</h2></div>
          <StatusBadge tone="info">{state.runs.length} runs</StatusBadge>
        </div>
        <table>
          <thead><tr><th>Property</th><th>Month</th><th>Run timestamp</th><th>Status</th><th>Exceptions</th><th>User actions</th><th>Actions</th></tr></thead>
          <tbody>
            {state.runs.map((run) => {
              const property = state.properties.find((item) => item.id === run.propertyId);
              const summary = summarizeRun(run);
              return (
                <tr key={run.id}>
                  <td>{property?.name ?? run.propertyId}</td>
                  <td>{run.month}</td>
                  <td>{new Date(run.createdAt).toLocaleString()}</td>
                  <td><StatusBadge tone={run.status === "complete" ? "success" : run.status === "review" ? "warning" : "info"}>{run.status}</StatusBadge></td>
                  <td>{summary.exceptions}</td>
                  <td>{run.approvedBy ? `${run.approvedBy} approved` : "No final approval yet"}</td>
                  <td className="table-actions">
                    <button type="button" title="Open run" onClick={() => { dispatch({ type: "open-run", runId: run.id }); onNavigate("report"); }}><FolderOpen size={15} /></button>
                    <button type="button" title="Export report" onClick={() => exportRun(run.id)}><Download size={15} /></button>
                  </td>
                </tr>
              );
            })}
            {!state.runs.length ? <tr><td colSpan={7}>No pipeline runs yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Audit log</p><h2>Traceable user and system actions</h2></div>
        </div>
        <table>
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {state.auditLogs.map((log) => <tr key={log.id}><td>{new Date(log.timestamp).toLocaleString()}</td><td>{log.actor}</td><td>{log.action}</td><td>{log.detail}</td></tr>)}
          </tbody>
        </table>
      </section>
    </main>
  );
}

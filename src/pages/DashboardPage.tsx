import { ArrowRight, Bot, FileSpreadsheet, Settings2 } from "lucide-react";
import { MetricCard, type ViewId } from "../components/Ui";
import { summarizeRun } from "../domain/reconciliation";
import { useAppState } from "../state/AppStateContext";

export function DashboardPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, activeRun } = useAppState();
  const conflictCount = state.runs.reduce((sum, run) => sum + run.exceptions.filter((item) => item.status === "open").length, 0);
  const latestSummary = activeRun ? summarizeRun(activeRun) : undefined;

  return (
    <main className="page">
      <section className="summary-grid">
        <MetricCard label="Properties" value={state.properties.length} detail="configured local portfolio" />
        <MetricCard label="Banks" value={state.banks.length} detail="linked operating accounts" />
        <MetricCard label="Runs" value={state.runs.length} detail="historical pipelines" />
        <MetricCard label="Conflicts" value={conflictCount} detail="open exceptions" />
      </section>

      <section className="dashboard-tiles">
        <button type="button" onClick={() => onNavigate("properties")}>
          <Settings2 size={22} />
          <strong>Configure Properties</strong>
          <span>Maintain properties, bank accounts, Yardi codes, and Excel imports.</span>
          <ArrowRight size={18} />
        </button>
        <button type="button" onClick={() => onNavigate("reconcile")}>
          <Bot size={22} />
          <strong>Initiate Reconciliation</strong>
          <span>Run the guided setup, uploads, agent processing, and report workflow.</span>
          <ArrowRight size={18} />
        </button>
        <button type="button" onClick={() => onNavigate("history")}>
          <FileSpreadsheet size={22} />
          <strong>Audit History</strong>
          <span>Open previous pipelines, inspect user actions, and export reports.</span>
          <ArrowRight size={18} />
        </button>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Current run</p>
            <h2>{activeRun ? `${activeRun.month} pipeline` : "No active pipeline yet"}</h2>
          </div>
        </div>
        {activeRun && latestSummary ? (
          <div className="run-snapshot">
            <span>Matched: {latestSummary.matched}</span>
            <span>Ambiguous: {latestSummary.ambiguous}</span>
            <span>Unmatched: {latestSummary.unmatched}</span>
            <span>Closing variance: {latestSummary.closingVariance.toLocaleString()}</span>
          </div>
        ) : (
          <div className="empty-state">Start a reconciliation to populate the live run snapshot.</div>
        )}
      </section>
    </main>
  );
}

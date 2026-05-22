import { BarChart3, ListChecks, Play } from "lucide-react";
import { EmptyState, MetricCard, StatusBadge, type ViewId } from "../components/Ui";
import { summarizeRun } from "../domain/reconciliation";
import { useAppState } from "../state/AppStateContext";
import { getMockSummaryNarrative, getReportMatchGroups } from "./pageBehavior";

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function SummaryPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { activeRun, activeProperty } = useAppState();
  const summary = activeRun ? summarizeRun(activeRun) : undefined;
  const reportGroups = activeRun
    ? getReportMatchGroups({ transactions: activeRun.transactions, matches: activeRun.matches, exceptions: activeRun.exceptions })
    : { matchedRows: [], mismatchRows: [] };

  if (!activeRun || !summary) {
    return (
      <main className="page">
        <section className="panel padded">No completed reconciliation run is selected.</section>
      </main>
    );
  }

  const aiSummary = getMockSummaryNarrative({
    status: activeRun.status,
    matched: reportGroups.matchedRows.length,
    mismatches: reportGroups.mismatchRows.length,
    unresolved: summary.unresolved,
    closingVariance: summary.closingVariance,
  });
  const latestLogs = activeRun.automationLogs.slice(-8);

  return (
    <main className="page">
      <section className="summary-grid">
        <MetricCard label="Final Status" value={activeRun.status} detail="pipeline state" />
        <MetricCard label="Matches" value={reportGroups.matchedRows.length} detail="clean ledger-bank pairs" />
        <MetricCard label="Mismatches" value={reportGroups.mismatchRows.length} detail={`${summary.unresolved} unresolved`} />
        <MetricCard label="Closing Variance" value={money(summary.closingVariance)} detail="bank vs ledger close" />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Completion summary</p>
            <h2>{activeProperty?.name ?? activeRun.propertyId} / {activeRun.month}</h2>
          </div>
          <BarChart3 size={22} />
        </div>
        <div className="summary-narrative">
          <StatusBadge tone={summary.unresolved ? "warning" : "success"}>{summary.unresolved ? "follow-up" : "ready"}</StatusBadge>
          <p>{aiSummary}</p>
        </div>
        <div className="summary-detail-grid">
          <article>
            <span>Transactions reviewed</span>
            <strong>{activeRun.transactions.length}</strong>
          </article>
          <article>
            <span>Exceptions resolved</span>
            <strong>{summary.resolved}</strong>
          </article>
          <article>
            <span>Automation log entries</span>
            <strong>{activeRun.automationLogs.length}</strong>
          </article>
          <article>
            <span>Approved by</span>
            <strong>{activeRun.approvedBy ?? "Pending"}</strong>
          </article>
        </div>
        <div className="action-strip">
          <button className="secondary-button" type="button" onClick={() => onNavigate("report")}><ListChecks size={16} />Open Report</button>
          <button className="primary-button" type="button" onClick={() => onNavigate("reconcile")}><Play size={16} />Start New Reconciliation</button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Automation trail</p>
            <h2>Latest activity</h2>
          </div>
          <StatusBadge tone={activeRun.status === "complete" ? "success" : "info"}>{activeRun.status}</StatusBadge>
        </div>
        {latestLogs.length ? (
          <div className="log-box">
            {latestLogs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
          </div>
        ) : (
          <EmptyState title="No automation logs yet" detail="Run approval automation from the report to populate this summary." />
        )}
      </section>
    </main>
  );
}

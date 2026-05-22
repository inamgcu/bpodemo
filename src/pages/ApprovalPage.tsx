import { Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { MetricCard, StatusBadge, type ViewId } from "../components/Ui";
import { summarizeRun } from "../domain/reconciliation";
import { listenToAutomationLogs, runBrowserAutomation } from "../services/desktop";
import { useAppState } from "../state/AppStateContext";

export function ApprovalPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { activeRun, dispatch } = useAppState();
  const [note, setNote] = useState("Approved after match and exception review.");
  const [running, setRunning] = useState(false);
  const summary = activeRun ? summarizeRun(activeRun) : undefined;

  async function approveAndMark() {
    if (!activeRun) return;
    dispatch({ type: "approve-run", runId: activeRun.id, actor: "Senior Reviewer", note });
    dispatch({ type: "append-run-log", runId: activeRun.id, line: "Initiating Yardi automation..." });
    setRunning(true);
    let unlisten: (() => void) | undefined;
    let streamedLineCount = 0;
    try {
      unlisten = await listenToAutomationLogs((line) => {
        streamedLineCount += 1;
        dispatch({ type: "append-run-log", runId: activeRun.id, line });
      });
      const result = await runBrowserAutomation();
      const lines = streamedLineCount
        ? [`Captured ${streamedLineCount} live automation log line(s).`]
        : result.lines;
      dispatch({ type: "complete-automation", runId: activeRun.id, lines });
      if (result.exitCode !== 0) {
        dispatch({ type: "toast", tone: "warning", message: "Yardi automation finished with errors. Review the automation logs in the report." });
      }
      onNavigate("report");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run browser automation.";
      dispatch({ type: "append-run-log", runId: activeRun.id, line: `Yardi automation failed to launch: ${message}` });
      dispatch({ type: "toast", tone: "danger", message });
      onNavigate("report");
    } finally {
      unlisten?.();
      setRunning(false);
    }
  }

  if (!activeRun || !summary) return <main className="page"><section className="panel padded">No active run.</section></main>;

  return (
    <main className="page">
      <section className="summary-grid">
        <MetricCard label="Matched" value={summary.matched} detail="ready for approval" />
        <MetricCard label="Open exceptions" value={summary.unresolved} detail="reviewer controlled" />
        <MetricCard label="Status" value={activeRun.status} detail="pipeline state" />
        <MetricCard label="Automation logs" value={activeRun.automationLogs.length} detail="Yardi progress" />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Human approval boundary</p><h2>Approve and mark in Yardi</h2></div>
          <ShieldCheck size={22} />
        </div>
        <div className="approval-grid">
          <div><StatusBadge tone={summary.unresolved ? "warning" : "success"}>{summary.unresolved ? "review" : "clear"}</StatusBadge><span>{summary.unresolved} unresolved exception(s)</span></div>
          <div><StatusBadge tone="info">local</StatusBadge><span>Financial data stays in SQLite/local reports</span></div>
          <div><StatusBadge tone="success">guarded</StatusBadge><span>No Yardi update runs before this action</span></div>
        </div>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} />
        <div className="action-strip">
          <button className="primary-button" type="button" disabled={running} onClick={approveAndMark}><Play size={16} />{running ? "Running Yardi automation" : "Approve & Mark in Yardi"}</button>
        </div>
        <div className="log-box">
          {activeRun.automationLogs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
        </div>
      </section>
    </main>
  );
}

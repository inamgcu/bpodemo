import { useState } from "react";
import { StatusBadge } from "../components/Ui";
import type { ExceptionRecord, UserDecision } from "../domain/types";
import { useAppState } from "../state/AppStateContext";

function ExceptionEditor({ exception, runId }: { exception: ExceptionRecord; runId: string }) {
  const { dispatch } = useAppState();
  const [decision, setDecision] = useState<UserDecision>("approve");
  const [feedback, setFeedback] = useState(exception.userFeedback ?? exception.aiReasoning);

  return (
    <article className="exception-card">
      <div>
        <StatusBadge tone={exception.status === "resolved" ? "success" : "warning"}>{exception.category}</StatusBadge>
        <h3>{exception.aiReasoning}</h3>
        <p>Confidence: {Math.round(exception.confidence * 100)}%</p>
      </div>
      <div className="review-grid">
        <select value={decision} onChange={(event) => setDecision(event.target.value as UserDecision)}>
          <option value="approve">Approve reasoning</option>
          <option value="reject">Reject reasoning</option>
          <option value="edit">Edit reasoning</option>
          <option value="manual-link">Manual link</option>
          <option value="unresolved">Keep unresolved</option>
        </select>
        <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        <button className="primary-button" type="button" onClick={() => dispatch({ type: "resolve-exception", runId, exceptionId: exception.id, decision, feedback })}>Save Feedback</button>
      </div>
    </article>
  );
}

export function ExceptionsPage() {
  const { activeRun } = useAppState();
  if (!activeRun) return <main className="page"><section className="panel padded">No active run.</section></main>;
  const open = activeRun.exceptions.filter((item) => item.status === "open");
  const resolved = activeRun.exceptions.filter((item) => item.status === "resolved");

  return (
    <main className="page">
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Exception review agent</p><h2>AI reasoning and reviewer feedback</h2></div>
          <StatusBadge tone={open.length ? "warning" : "success"}>{open.length} open</StatusBadge>
        </div>
        <div className="exception-list">
          {[...open, ...resolved].map((exception) => <ExceptionEditor key={exception.id} exception={exception} runId={activeRun.id} />)}
          {!activeRun.exceptions.length ? <p className="success-text">No exceptions in this run.</p> : null}
        </div>
      </section>
    </main>
  );
}

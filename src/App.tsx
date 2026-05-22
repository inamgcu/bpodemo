import { useMemo, useState } from "react";
import "./App.css";
import { navigation, type ViewId } from "./components/Ui";
import { useAppState } from "./state/AppStateContext";
import { DashboardPage } from "./pages/DashboardPage";
import { PropertiesPage } from "./pages/PropertiesPage";
import { ReconcilePage } from "./pages/ReconcilePage";
import { ReportPage } from "./pages/ReportPage";
import { ExceptionsPage } from "./pages/ExceptionsPage";
import { ApprovalPage } from "./pages/ApprovalPage";
import { HistoryPage } from "./pages/HistoryPage";

function App() {
  const [view, setView] = useState<ViewId>("dashboard");
  const { state, dispatch } = useAppState();
  const currentTitle = useMemo(() => navigation.find((item) => item.id === view)?.label ?? "Dashboard", [view]);

  const page = {
    dashboard: <DashboardPage onNavigate={setView} />,
    properties: <PropertiesPage onNavigate={setView} />,
    reconcile: <ReconcilePage onNavigate={setView} />,
    report: <ReportPage onNavigate={setView} />,
    exceptions: <ExceptionsPage />,
    approval: <ApprovalPage onNavigate={setView} />,
    history: <HistoryPage onNavigate={setView} />,
  }[view];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <strong>BPO Yardi</strong>
          <span>Reconciliation Platform</span>
        </div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? "active" : ""} type="button" onClick={() => setView(id)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace-shell">
        <header className="topbar">
          <div>
            <p>AI-assisted financial reconciliation</p>
            <h1>{currentTitle}</h1>
          </div>
          <span className="storage-pill">{state.storagePath ?? "Loading local storage..."}</span>
        </header>
        {state.toast ? (
          <div className={`toast toast--${state.toast.tone}`}>
            <span>{state.toast.message}</span>
            <button type="button" onClick={() => dispatch({ type: "clear-toast" })}>Dismiss</button>
          </div>
        ) : null}
        {page}
      </section>
    </div>
  );
}

export default App;

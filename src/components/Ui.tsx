import type { PropsWithChildren, ReactNode } from "react";
import { Activity, BarChart3, Building2, History, Home, ListChecks } from "lucide-react";

export type ViewId = "dashboard" | "properties" | "reconcile" | "report" | "summary" | "history";

export const navigation: { id: ViewId; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "properties", label: "Properties", icon: Building2 },
  { id: "reconcile", label: "Reconcile", icon: Activity },
  { id: "report", label: "Report", icon: ListChecks },
  { id: "summary", label: "Summary", icon: BarChart3 },
  { id: "history", label: "Audit History", icon: History },
];

export function StatusBadge({ tone = "neutral", children }: PropsWithChildren<{ tone?: "neutral" | "success" | "warning" | "danger" | "info" }>) {
  return <span className={`status status--${tone}`}>{children}</span>;
}

export function MetricCard({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

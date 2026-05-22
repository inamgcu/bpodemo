import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { reconcileRun } from "../domain/reconciliation";
import { createInitialData } from "../domain/seed";
import type {
  AppData,
  AuditLog,
  BankAccount,
  ExceptionRecord,
  Property,
  ReconciliationRun,
  Transaction,
  UploadedFile,
  UserDecision,
} from "../domain/types";
import { getStoragePath, loadState, saveState } from "../services/desktop";

type AppState = AppData & {
  hydrated: boolean;
  storagePath?: string;
  toast?: { tone: ToastTone; message: string };
};

type ToastTone = "success" | "warning" | "danger" | "info";

type Action =
  | { type: "hydrate"; data: AppData | null; storagePath?: string }
  | { type: "toast"; tone: ToastTone; message: string }
  | { type: "clear-toast" }
  | { type: "select-property"; propertyId: string }
  | { type: "upsert-property"; property: Property }
  | { type: "delete-property"; propertyId: string }
  | { type: "upsert-bank"; bank: BankAccount }
  | { type: "delete-bank"; bankId: string }
  | { type: "import-properties"; properties: Property[]; banks: BankAccount[]; fileName: string; validRows: number; invalidRows: number }
  | { type: "start-run"; propertyId: string; month: string }
  | { type: "set-closing-balance"; runId: string; closingBalance: number }
  | { type: "attach-file"; runId: string; file: UploadedFile; transactions?: Transaction[]; log?: string }
  | { type: "append-run-log"; runId: string; line: string }
  | { type: "process-run"; runId: string }
  | { type: "resolve-exception"; runId: string; exceptionId: string; decision: UserDecision; feedback: string }
  | { type: "approve-run"; runId: string; actor: string; note: string }
  | { type: "complete-automation"; runId: string; lines: string[] }
  | { type: "set-report-path"; runId: string; path: string }
  | { type: "open-run"; runId: string };

type ContextValue = {
  state: AppState;
  activeRun?: ReconciliationRun;
  activeProperty?: Property;
  propertyBanks: BankAccount[];
  dispatch: React.Dispatch<Action>;
};

const AppContext = createContext<ContextValue | undefined>(undefined);
const initialData = createInitialData();

const now = () => new Date().toISOString();

const audit = (input: Omit<AuditLog, "id" | "timestamp">): AuditLog => ({
  ...input,
  id: `audit-${crypto.randomUUID()}`,
  timestamp: now(),
});

const initialState: AppState = {
  ...initialData,
  hydrated: false,
};

const uniqueById = <T extends { id: string }>(items: T[]) =>
  [...new Map(items.map((item) => [item.id, item])).values()];

function updateRun(state: AppState, runId: string, updater: (run: ReconciliationRun) => ReconciliationRun) {
  return {
    ...state,
    runs: state.runs.map((run) => (run.id === runId ? updater(run) : run)),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        ...(action.data ?? initialData),
        storagePath: action.storagePath,
        hydrated: true,
      };
    case "toast":
      return { ...state, toast: { tone: action.tone, message: action.message } };
    case "clear-toast":
      return { ...state, toast: undefined };
    case "select-property":
      return {
        ...state,
        selectedPropertyId: action.propertyId,
        auditLogs: [...state.auditLogs, audit({ actor: "BPO Operator", action: "Select property", detail: action.propertyId })],
      };
    case "upsert-property":
      return {
        ...state,
        properties: uniqueById([...state.properties, action.property]),
        auditLogs: [...state.auditLogs, audit({ actor: "BPO Operator", action: "Save property", detail: `${action.property.code} / ${action.property.name}` })],
      };
    case "delete-property":
      return {
        ...state,
        properties: state.properties.filter((property) => property.id !== action.propertyId),
        banks: state.banks.filter((bank) => bank.propertyId !== action.propertyId),
        auditLogs: [...state.auditLogs, audit({ actor: "BPO Operator", action: "Delete property", detail: action.propertyId })],
      };
    case "upsert-bank":
      return {
        ...state,
        banks: uniqueById([...state.banks, action.bank]),
        auditLogs: [...state.auditLogs, audit({ actor: "BPO Operator", action: "Save bank", detail: `${action.bank.name} / ${action.bank.accountNumber}` })],
      };
    case "delete-bank":
      return {
        ...state,
        banks: state.banks.filter((bank) => bank.id !== action.bankId),
        auditLogs: [...state.auditLogs, audit({ actor: "BPO Operator", action: "Delete bank", detail: action.bankId })],
      };
    case "import-properties":
      return {
        ...state,
        properties: uniqueById([...state.properties, ...action.properties]),
        banks: uniqueById([...state.banks, ...action.banks]),
        auditLogs: [
          ...state.auditLogs,
          audit({
            actor: "BPO Operator",
            action: "Import property-bank Excel",
            detail: `${action.fileName}: ${action.validRows} valid row(s), ${action.invalidRows} invalid row(s) skipped.`,
          }),
        ],
        toast: {
          tone: action.invalidRows ? "warning" : "success",
          message: `Imported ${action.validRows} row(s). ${action.invalidRows} invalid row(s) skipped.`,
        },
      };
    case "start-run": {
      const run: ReconciliationRun = {
        id: `run-${action.propertyId}-${action.month}-${crypto.randomUUID()}`,
        propertyId: action.propertyId,
        month: action.month,
        status: "uploads",
        createdAt: now(),
        updatedAt: now(),
        files: [],
        transactions: [],
        matches: [],
        exceptions: [],
        automationLogs: ["Run created. Waiting for closing balance and uploads."],
      };
      return {
        ...state,
        activeRunId: run.id,
        selectedPropertyId: action.propertyId,
        runs: [run, ...state.runs],
        auditLogs: [...state.auditLogs, audit({ runId: run.id, actor: "BPO Operator", action: "Start reconciliation", detail: `${action.propertyId} / ${action.month}` })],
      };
    }
    case "set-closing-balance":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        closingBalance: action.closingBalance,
        updatedAt: now(),
        automationLogs: [...run.automationLogs, `Closing balance saved: ${action.closingBalance}.`],
      }));
    case "attach-file":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        status: "uploads",
        files: uniqueById([...run.files, action.file]),
        transactions: action.transactions ? [...run.transactions.filter((item) => item.source !== action.transactions?.[0]?.source || item.bankId !== action.transactions?.[0]?.bankId), ...action.transactions] : run.transactions,
        automationLogs: action.log ? [...run.automationLogs, action.log] : run.automationLogs,
        updatedAt: now(),
      }));
    case "append-run-log":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        automationLogs: [...run.automationLogs, action.line],
        updatedAt: now(),
      }));
    case "process-run":
      return updateRun(state, action.runId, (run) => reconcileRun({ ...run, status: "processing", updatedAt: now() }));
    case "resolve-exception":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        exceptions: run.exceptions.map((exception): ExceptionRecord =>
          exception.id === action.exceptionId
            ? {
                ...exception,
                status: action.decision === "unresolved" ? "open" : "resolved",
                userDecision: action.decision,
                userFeedback: action.feedback,
                updatedAt: now(),
              }
            : exception,
        ),
        automationLogs: [...run.automationLogs, `Reviewer feedback saved: ${action.feedback}`],
        updatedAt: now(),
      }));
    case "approve-run":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        status: "approved",
        approvedBy: action.actor,
        approvedAt: now(),
        automationLogs: [...run.automationLogs, `Approved by ${action.actor}: ${action.note}`],
        updatedAt: now(),
      }));
    case "complete-automation":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        status: "complete",
        automationLogs: [...run.automationLogs, ...action.lines, "Final reconciliation completion recorded."],
        updatedAt: now(),
      }));
    case "set-report-path":
      return updateRun(state, action.runId, (run) => ({
        ...run,
        finalReportPath: action.path,
        updatedAt: now(),
      }));
    case "open-run":
      return { ...state, activeRunId: action.runId };
    default:
      return state;
  }
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const hydrated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const [data, storagePath] = await Promise.all([
        loadState().catch(() => null),
        getStoragePath().catch(() => undefined),
      ]);
      if (!cancelled) {
        hydrated.current = true;
        dispatch({ type: "hydrate", data, storagePath });
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current || !state.hydrated) return;
    const snapshot: AppData = {
      properties: state.properties,
      banks: state.banks,
      runs: state.runs,
      selectedPropertyId: state.selectedPropertyId,
      activeRunId: state.activeRunId,
      auditLogs: state.auditLogs,
    };
    const timeout = window.setTimeout(() => {
      saveState(snapshot).catch((error) => {
        dispatch({ type: "toast", tone: "danger", message: error instanceof Error ? error.message : "Unable to save SQLite state." });
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [state.properties, state.banks, state.runs, state.selectedPropertyId, state.activeRunId, state.auditLogs, state.hydrated]);

  const activeRun = useMemo(
    () => state.runs.find((run) => run.id === state.activeRunId) ?? state.runs[0],
    [state.runs, state.activeRunId],
  );
  const activeProperty = useMemo(
    () => state.properties.find((property) => property.id === (activeRun?.propertyId ?? state.selectedPropertyId)),
    [activeRun?.propertyId, state.properties, state.selectedPropertyId],
  );
  const propertyBanks = useMemo(
    () => state.banks.filter((bank) => bank.propertyId === (activeProperty?.id ?? state.selectedPropertyId)),
    [activeProperty?.id, state.banks, state.selectedPropertyId],
  );
  const value = useMemo(
    () => ({ state, activeRun, activeProperty, propertyBanks, dispatch }),
    [state, activeRun, activeProperty, propertyBanks],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used within AppStateProvider.");
  return context;
}

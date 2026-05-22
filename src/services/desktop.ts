import { invoke } from "@tauri-apps/api/core";
import type { AppData } from "../domain/types";

const storageKey = "bpo-yardi-reconciliation-state";
export const defaultAutomationScript = "automation-script\\Yardi-Automation.ts";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type BrowserAutomationResult = {
  mocked: boolean;
  exitCode?: number | null;
  lines: string[];
};

export async function loadState(): Promise<AppData | null> {
  if (isTauri()) return await invoke<AppData | null>("load_app_state");
  const raw = localStorage.getItem(storageKey);
  return raw ? JSON.parse(raw) as AppData : null;
}

export async function saveState(data: AppData) {
  if (isTauri()) {
    await invoke("save_app_state", { state: data });
    return;
  }
  localStorage.setItem(storageKey, JSON.stringify(data));
}

export async function getStoragePath() {
  if (!isTauri()) return "Browser localStorage fallback";
  return await invoke<string>("get_storage_path");
}

export async function exportBinaryFile(fileName: string, base64Data: string) {
  if (isTauri()) {
    return await invoke<string>("export_report_file", { fileName, base64Data });
  }
  const link = document.createElement("a");
  link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Data}`;
  link.download = fileName;
  link.click();
  return `Downloaded ${fileName}`;
}

export async function runBrowserAutomation(scriptPath = defaultAutomationScript) {
  if (isTauri()) {
    return await invoke<BrowserAutomationResult>("run_browser_automation", {
      scriptPath,
      mock: false,
    });
  }
  const page = window.open("", "yardi-visible-mock-automation", "width=980,height=760");
  page?.document.write(`
    <!doctype html>
    <title>Yardi Browser Automation</title>
    <body style="margin:0;font-family:Segoe UI,Arial,sans-serif;background:#f4f6f8;color:#17202c">
      <main style="max-width:920px;margin:32px auto;border:1px solid #dce3eb;border-radius:10px;background:white;overflow:hidden">
        <header style="background:#101927;color:white;padding:22px 26px">
          <h1 style="margin:0">Yardi Browser Automation</h1>
          <p style="color:#b8c4d6">Visible browser mock launched from Vite development mode.</p>
        </header>
        <section style="padding:22px 26px">
          <p>Automation script: <code>${scriptPath}</code></p>
          <ol id="steps" style="display:grid;gap:12px"></ol>
        </section>
      </main>
      <script>
        const labels = ["Open Yardi reconciliation workspace","Authenticate with restricted demo credentials","Select approved property/month","Mark approved transactions","Capture completion logs"];
        const root = document.getElementById("steps");
        labels.forEach(label => { const li = document.createElement("li"); li.textContent = label; li.style.padding = "12px"; li.style.border = "1px solid #dce3eb"; li.style.borderRadius = "8px"; root.appendChild(li); });
      </script>
    </body>
  `);
  return {
    mocked: true,
    exitCode: 0,
    lines: [
      `Browser fallback validated automation path: ${scriptPath}`,
      "Opened visible mock browser automation window.",
      "MOCK browser opened Yardi reconciliation page.",
      "MOCK selected approved property/month and marked matched transactions.",
      "MOCK captured item-level completion logs.",
    ],
  };
}

export async function listenToAutomationLogs(onLine: (line: string) => void) {
  if (!isTauri()) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return await listen<string>("automation-log", (event) => onLine(event.payload));
}

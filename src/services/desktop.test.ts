import { describe, expect, it } from "vitest";
import {
  defaultAutomationScript,
  ledgerAutomationScript,
  openExportedFile,
  prewarmBrowserAutomation,
  prewarmStartupAutomation,
  startupAutomationScripts,
} from "./desktop";

describe("desktop automation scripts", () => {
  it("uses the automation-scripts folder for approval and ledger automation", () => {
    expect(defaultAutomationScript).toBe("automation-scripts\\Yardi-Automation.ts");
    expect(ledgerAutomationScript).toBe("automation-scripts\\Gmail-Agent.ts");
  });

  it("opens exported reports through the desktop opener", async () => {
    const openedPaths: string[] = [];

    const result = await openExportedFile("C:\\Reports\\reconciliation.xlsx", {
      isDesktop: true,
      openPath: async (path) => {
        openedPaths.push(path);
      },
    });

    expect(openedPaths).toEqual(["C:\\Reports\\reconciliation.xlsx"]);
    expect(result).toBe("Opened C:\\Reports\\reconciliation.xlsx");
  });

  it("falls back to the backend report opener when the plugin opener rejects", async () => {
    const fallbackPaths: string[] = [];

    const result = await openExportedFile("C:\\Reports\\reconciliation.xlsx", {
      isDesktop: true,
      openPath: async () => {
        throw "plugin opener failed";
      },
      openReport: async (path) => {
        fallbackPaths.push(path);
      },
    });

    expect(fallbackPaths).toEqual(["C:\\Reports\\reconciliation.xlsx"]);
    expect(result).toBe("Opened C:\\Reports\\reconciliation.xlsx");
  });

  it("reports browser automation prewarm readiness in browser mode", async () => {
    await expect(prewarmBrowserAutomation(ledgerAutomationScript)).resolves.toEqual([
      "Browser automation runtime ready for automation-scripts\\Gmail-Agent.ts.",
    ]);
  });

  it("prewarms all browser automation scripts at app startup", async () => {
    const calls: string[] = [];

    const lines = await prewarmStartupAutomation({
      prewarm: async (scriptPath) => {
        calls.push(scriptPath);
        return [`ready: ${scriptPath}`];
      },
    });

    expect(startupAutomationScripts()).toEqual([
      "automation-scripts\\Gmail-Agent.ts",
      "automation-scripts\\Yardi-Automation.ts",
    ]);
    expect(calls).toEqual(startupAutomationScripts());
    expect(lines).toEqual([
      "ready: automation-scripts\\Gmail-Agent.ts",
      "ready: automation-scripts\\Yardi-Automation.ts",
    ]);
  });
});

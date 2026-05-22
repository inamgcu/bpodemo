import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const githubPagesUrl = "https://inamgcu.github.io/bpodemo/mock-yardi/";

describe("mock Yardi deployment", () => {
  it("points Yardi automation at the deployed GitHub Pages mock", () => {
    const script = readFileSync("automation-scripts/Yardi-Automation.ts", "utf-8");

    expect(script).toContain(githubPagesUrl);
  });

  it("publishes the selectors used by Yardi automation", () => {
    const html = readFileSync("mock-yardi/index.html", "utf-8");

    for (const testId of [
      "yardi-username",
      "yardi-password",
      "yardi-login",
      "yardi-banking-menu",
      "yardi-bank-reconcile",
      "yardi-clear-checkbox",
      "yardi-save",
      "yardi-save-message",
    ]) {
      expect(html).toContain(`data-testid="${testId}"`);
    }
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tauri packaging config", () => {
  it("allows the bundled Excel parser to initialize inside the desktop WebView", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf-8"));

    expect(config.app.security.csp).toContain("script-src");
    expect(config.app.security.csp).toContain("'unsafe-eval'");
  });

  it("allows the frontend to open exported report files with the Tauri opener plugin", () => {
    const capability = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf-8"));

    expect(capability.permissions).toContain("opener:allow-open-path");
  });
});

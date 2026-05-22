import { describe, expect, it } from "vitest";
import { getMaxReconciliationMonth, isAllowedReconciliationMonth } from "./month";

describe("month guardrail", () => {
  it("allows only M-1 or earlier", () => {
    const current = new Date("2026-05-22T09:00:00+05:00");

    expect(getMaxReconciliationMonth(current)).toBe("2026-04");
    expect(isAllowedReconciliationMonth("2026-04", current)).toBe(true);
    expect(isAllowedReconciliationMonth("2026-05", current)).toBe(false);
  });
});

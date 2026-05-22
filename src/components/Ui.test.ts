import { describe, expect, it } from "vitest";
import { navigation } from "./Ui";

describe("navigation", () => {
  it("uses summary workflow navigation without standalone exception or approval pages", () => {
    const ids = navigation.map((item) => item.id);

    expect(ids).toContain("summary");
    expect(ids).not.toContain("exceptions");
    expect(ids).not.toContain("approval");
  });
});

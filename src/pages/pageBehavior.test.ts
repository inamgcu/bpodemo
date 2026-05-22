import { describe, expect, it } from "vitest";
import type { BankAccount, UploadedFile } from "../domain/types";
import { getInitialExpandedPropertyId, getReconciliationUploadSections } from "./pageBehavior";

const bank = (id: string, name: string): BankAccount => ({
  id,
  propertyId: "prop-1",
  name,
  accountNumber: `100-${id}`,
  yardiCode: `Y-${id}`,
  status: "active",
});

const file = (bankId: string): UploadedFile => ({
  id: `file-${bankId}`,
  name: `${bankId}.pdf`,
  kind: "bank-statement",
  status: "parsed",
  rowCount: 3,
  uploadedAt: "2026-05-22T00:00:00.000Z",
  bankId,
});

describe("page behavior", () => {
  it("does not auto-expand property bank details on page load", () => {
    expect(getInitialExpandedPropertyId("prop-1")).toBe("");
  });

  it("builds separate bank statement and Yardi ledger upload sections", () => {
    const sections = getReconciliationUploadSections({
      banks: [bank("bank-1", "Operating"), bank("bank-2", "Depository")],
      files: [file("bank-1")],
      ledgerUploaded: false,
    });

    expect(sections.map((section) => section.id)).toEqual(["bank-statements", "yardi-ledger"]);
    expect(sections[0].rows).toEqual([
      expect.objectContaining({ bankId: "bank-1", title: "Operating", uploaded: true }),
      expect.objectContaining({ bankId: "bank-2", title: "Depository", uploaded: false }),
    ]);
    expect(sections[1].rows).toEqual([
      expect.objectContaining({ title: "Yardi Ledger", uploaded: false }),
    ]);
  });
});

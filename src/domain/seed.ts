import type { AppData, BankAccount, Property } from "./types";

const propertyRows = [
  ["prop-cedar", "P100", "Cedar Heights", "10"],
  ["prop-maple", "P200", "Maple Court", "20"],
  ["prop-river", "P300", "River Walk Plaza", "30"],
  ["prop-lakeview", "P400", "Lakeview Terrace", "40"],
  ["prop-pinecrest", "P500", "Pinecrest Villas", "50"],
] as const;

const bankTemplates = [
  ["operating", "Operating Bank", "01", "OPER"],
  ["reserve", "Reserve Bank", "02", "RES"],
  ["security", "Security Deposit Bank", "03", "SEC"],
  ["payroll", "Payroll Bank", "04", "PAY"],
] as const;

export const seedProperties: Property[] = propertyRows.map(([id, code, name]) => ({
  id,
  code,
  name,
  status: "active",
}));

export const seedBanks: BankAccount[] = propertyRows.flatMap(([propertyId, code, , prefix]) =>
  bankTemplates.map(([key, name, suffix, yardiSuffix]) => ({
    id: `bank-${propertyId.replace("prop-", "")}-${key}`,
    propertyId,
    name,
    accountNumber: `${prefix}${suffix}`,
    yardiCode: `Y-${code}-${yardiSuffix}`,
    status: "active" as const,
  })),
);

export function createInitialData(): AppData {
  return {
    properties: seedProperties,
    banks: seedBanks,
    runs: [],
    selectedPropertyId: seedProperties[0].id,
    auditLogs: [
      {
        id: "audit-seed",
        actor: "System",
        action: "Seed data loaded",
        detail: "Loaded 5 sample properties and 4 bank accounts per property.",
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

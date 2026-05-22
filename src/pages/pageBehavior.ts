import type { BankAccount, UploadedFile } from "../domain/types";

export type UploadSectionRow = {
  id: string;
  title: string;
  detail: string;
  uploaded: boolean;
  bankId?: string;
  fileName?: string;
};

export type UploadSection = {
  id: "bank-statements" | "yardi-ledger";
  title: string;
  eyebrow: string;
  rows: UploadSectionRow[];
};

export function getInitialExpandedPropertyId(_selectedPropertyId: string) {
  return "";
}

export function getReconciliationUploadSections(input: {
  banks: BankAccount[];
  files: UploadedFile[];
  ledgerUploaded: boolean;
}): UploadSection[] {
  const bankRows = input.banks.map((bank) => {
    const uploadedFile = input.files.find((file) => file.kind === "bank-statement" && file.bankId === bank.id);
    return {
      id: `bank-row-${bank.id}`,
      bankId: bank.id,
      title: bank.name,
      detail: `${bank.accountNumber} / ${bank.yardiCode}`,
      uploaded: Boolean(uploadedFile),
      fileName: uploadedFile?.name,
    };
  });

  const ledgerFile = input.files.find((file) => file.kind === "yardi-ledger");

  return [
    {
      id: "bank-statements",
      eyebrow: "Bank source files",
      title: "Bank statements",
      rows: bankRows,
    },
    {
      id: "yardi-ledger",
      eyebrow: "Yardi source file",
      title: "Yardi ledger",
      rows: [
        {
          id: "yardi-ledger-row",
          title: "Yardi Ledger",
          detail: "Excel export from Yardi",
          uploaded: input.ledgerUploaded,
          fileName: ledgerFile?.name,
        },
      ],
    },
  ];
}

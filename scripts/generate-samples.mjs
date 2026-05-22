import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samplesDir = path.join(root, "public", "samples");

const properties = [
  ["P100", "Cedar Heights", "10"],
  ["P200", "Maple Court", "20"],
  ["P300", "River Walk Plaza", "30"],
  ["P400", "Lakeview Terrace", "40"],
  ["P500", "Pinecrest Villas", "50"],
];

const banks = [
  ["Operating Bank", "01", "OPER"],
  ["Reserve Bank", "02", "RES"],
  ["Security Deposit Bank", "03", "SEC"],
  ["Payroll Bank", "04", "PAY"],
];

function style(worksheet) {
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.columns.forEach((column) => { column.width = 24; });
}

async function propertyWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Property Bank Setup");
  sheet.columns = ["propertyCode", "propertyName", "bankName", "accountNumber", "yardiCode"].map((header) => ({ header, key: header }));
  for (const [code, name, prefix] of properties) {
    for (const [bankName, suffix, yardi] of banks) {
      sheet.addRow({ propertyCode: code, propertyName: name, bankName, accountNumber: `${prefix}${suffix}`, yardiCode: `Y-${code}-${yardi}` });
    }
  }
  style(sheet);
  await workbook.xlsx.writeFile(path.join(samplesDir, "property-bank-import-sample.xlsx"));
}

async function ledgerWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Yardi Ledger");
  sheet.columns = ["ledgerDate", "description", "reference", "debit", "credit", "amount", "status", "yardiId"].map((header) => ({ header, key: header }));
  [
    ["2026-04-04", "Rent deposit A102", "DEP-778", 0, 1500, 1500, "open", "Y-9001"],
    ["2026-04-08", "Rent deposit B210", "DEP-881", 0, 1375, 1375, "open", "Y-9002"],
    ["2026-04-15", "Maintenance vendor payment", "CHK-404", 420, 0, 420, "open", "Y-9003"],
    ["2026-04-19", "Utility refund city water", "REF-17", 0, 211, 211, "open", "Y-9004"],
    ["2026-04-22", "Bank interest income", "INT-22", 0, 18, 18, "open", "Y-9005"],
  ].forEach((row) => sheet.addRow(row));
  style(sheet);
  await workbook.xlsx.writeFile(path.join(samplesDir, "yardi-ledger-sample.xlsx"));
}

const escapePdf = (value) => String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/\n/g, " ");

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const money = (value) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const roundMoney = (value) => Math.round(value * 100) / 100;

const rgb = (hex) => {
  const clean = hex.replace("#", "");
  const parts = [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16) / 255);
  return parts.map((part) => part.toFixed(3)).join(" ");
};

const textWidth = (value, size) => String(value).length * size * 0.52;

const fitText = (value, maxLength) =>
  value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;

function pdfDocument(ops) {
  const content = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { output += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return output;
}

function createPdfBuilder() {
  const ops = [];
  const rect = (x, y, w, h, fill = "#ffffff", stroke = "") => {
    ops.push("q");
    ops.push(`${rgb(fill)} rg`);
    if (stroke) ops.push(`${rgb(stroke)} RG 0.7 w`);
    ops.push(`${x} ${y} ${w} ${h} re ${stroke ? "B" : "f"}`);
    ops.push("Q");
  };
  const line = (x1, y1, x2, y2, color = "#dce3eb", width = 0.6) => {
    ops.push("q");
    ops.push(`${rgb(color)} RG ${width} w`);
    ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
    ops.push("Q");
  };
  const text = (value, x, y, size = 10, font = "F1", color = "#17202c") => {
    ops.push(`BT /${font} ${size} Tf ${rgb(color)} rg ${x} ${y} Td (${escapePdf(value)}) Tj ET`);
  };
  const rightText = (value, rightX, y, size = 10, font = "F1", color = "#17202c") => {
    text(value, roundMoney(rightX - textWidth(value, size)), y, size, font, color);
  };
  return { ops, rect, line, text, rightText, output: () => pdfDocument(ops) };
}

function accountLabel(bankName) {
  return bankName.replace(/\s+Bank$/i, " Account");
}

function statementTransactions(yardiCode, propertyIndex, bankIndex) {
  const operatingRows = [
    ["04/02/2026", "04/02/2026", "ACH CREDIT RENT COLLECTION BATCH 0401", "ACH040126-RC", 0, 48250],
    ["04/03/2026", "04/03/2026", "WIRE OUT INSURANCE PREMIUM APRIL", "WIRE-INS-APR", 12500, 0],
    ["04/05/2026", "04/05/2026", "ACH DEBIT UTILITY PAYMENT CITY POWER", "UTIL-CP-0405", 8425.73, 0],
    ["04/08/2026", "04/08/2026", "CHECK 1208 LANDSCAPE SERVICES", "1208", 3150, 0],
    ["04/10/2026", "04/10/2026", "ACH CREDIT RENT COLLECTION BATCH 0410", "ACH041026-RC", 0, 22675.5],
    ["04/12/2026", "04/12/2026", "BANK SERVICE CHARGE", "SVC-APR", 45, 0],
    ["04/17/2026", "04/16/2026", "ACH DEBIT CLEANING CONTRACTOR", "CLN-APR-884", 2200, 0],
    ["04/18/2026", "04/18/2026", "ACH CREDIT SECURITY DEPOSIT TRANSFERS", "SECDEP-0418", 0, 5400],
    ["04/22/2026", "04/22/2026", "CHECK 1214 ELEVATOR MAINTENANCE", "1214", 1875, 0],
    ["04/25/2026", "04/25/2026", "ACH DEBIT MANAGEMENT FEE", "MGMT-APR", 6250, 0],
    ["04/28/2026", "04/28/2026", "ACH CREDIT RENT COLLECTION BATCH 0428", "ACH042826-RC", 0, 9800],
    ["04/30/2026", "04/30/2026", "TRANSFER TO RESERVE ACCOUNT", "XFER-RES-0430", 63245.6, 0],
  ];
  const reserveRows = [
    ["04/01/2026", "04/01/2026", "OPENING TRANSFER FROM OPERATING", "XFER-OPEN-0401", 0, 18500],
    ["04/04/2026", "04/04/2026", "INTEREST CREDIT RESERVE SWEEP", "INT-RES-0404", 0, 214.55],
    ["04/09/2026", "04/09/2026", "ROOF PROJECT DRAWDOWN", "ROOF-APR-01", 15875, 0],
    ["04/16/2026", "04/16/2026", "CAPITAL REPAIR ESCROW TRANSFER", "CAP-ESC-0416", 0, 7200],
    ["04/24/2026", "04/24/2026", "HVAC REPLACEMENT INVOICE", "HVAC-APR-22", 9350, 0],
    ["04/30/2026", "04/30/2026", "MONTH END OPERATING TRANSFER", "XFER-RES-0430", 0, 12650],
  ];
  const securityRows = [
    ["04/03/2026", "04/03/2026", "SECURITY DEPOSIT RECEIPTS", "SEC-RCPT-0403", 0, 7400],
    ["04/07/2026", "04/07/2026", "TENANT REFUND APT 312", "REF-312-APR", 1250, 0],
    ["04/14/2026", "04/14/2026", "SECURITY DEPOSIT RECEIPTS", "SEC-RCPT-0414", 0, 5250],
    ["04/19/2026", "04/19/2026", "TENANT REFUND APT 118", "REF-118-APR", 975, 0],
    ["04/25/2026", "04/25/2026", "TRANSFER TO OPERATING ACCOUNT", "SECDEP-0418", 5400, 0],
  ];
  const payrollRows = [
    ["04/05/2026", "04/05/2026", "PAYROLL FUNDING TRANSFER", "PR-FUND-0405", 0, 18200],
    ["04/06/2026", "04/06/2026", "PAYROLL ACH BATCH", "PR-ACH-0406", 16750, 0],
    ["04/15/2026", "04/15/2026", "PAYROLL TAX DEBIT", "PR-TAX-0415", 4150.25, 0],
    ["04/20/2026", "04/20/2026", "PAYROLL FUNDING TRANSFER", "PR-FUND-0420", 0, 19100],
    ["04/21/2026", "04/21/2026", "PAYROLL ACH BATCH", "PR-ACH-0421", 17625, 0],
    ["04/30/2026", "04/30/2026", "BENEFITS ADMIN FEE", "BEN-APR", 820, 0],
  ];
  const rowsByType = { OPER: operatingRows, RES: reserveRows, SEC: securityRows, PAY: payrollRows };
  const multiplier = 1 + propertyIndex * 0.07 + bankIndex * 0.035;
  return (rowsByType[yardiCode] ?? operatingRows).map(([date, postedDate, description, reference, debit, credit]) => ({
    date,
    postedDate,
    description,
    reference,
    debit: roundMoney(Number(debit) * multiplier),
    credit: roundMoney(Number(credit) * multiplier),
  }));
}

function sectionBox(pdf, x, y, w, title, lines) {
  pdf.rect(x, y, w, 82, "#f8fafc", "#dce3eb");
  pdf.text(title, x + 12, y + 62, 8, "F2", "#486173");
  lines.forEach((line, index) => {
    const lineY = y + 43 - index * 17;
    if (line.label) {
      pdf.text(line.label, x + 12, lineY, 8, "F2", "#17202c");
      pdf.text(line.value, x + 76, lineY, 8, "F1", "#263447");
    } else {
      pdf.text(line.value, x + 12, lineY, 9, "F2", "#17202c");
    }
  });
}

function metricBox(pdf, x, y, w, title, value, color = "#17202c") {
  pdf.rect(x, y, w, 58, "#ffffff", "#dce3eb");
  pdf.text(title, x + 10, y + 37, 7.5, "F2", "#486173");
  pdf.rightText(value, x + w - 10, y + 15, 12, "F2", color);
}

function bankStatementPdf({ property, bank, propertyIndex, bankIndex, sequence }) {
  const [code, propertyName, prefix] = property;
  const [bankName, suffix, yardiCode] = bank;
  const accountNumber = `${prefix}${suffix}`;
  const accountEnding = accountNumber.padStart(4, "0").slice(-4);
  const statementRows = statementTransactions(yardiCode, propertyIndex, bankIndex);
  const openingBalance = roundMoney(128450.25 + propertyIndex * 17425.8 + bankIndex * 8350.35);
  let runningBalance = openingBalance;
  let totalDebits = 0;
  let totalCredits = 0;
  const rows = statementRows.map((row) => {
    totalDebits = roundMoney(totalDebits + row.debit);
    totalCredits = roundMoney(totalCredits + row.credit);
    runningBalance = roundMoney(runningBalance - row.debit + row.credit);
    return { ...row, balance: runningBalance };
  });
  const closingBalance = runningBalance;
  const pdf = createPdfBuilder();

  pdf.rect(0, 744, 612, 48, "#101927");
  pdf.text("First National Bank", 36, 768, 17, "F2", "#ffffff");
  pdf.text("Commercial Banking Services", 36, 753, 8.5, "F1", "#d4dce8");
  pdf.text("P.O. Box 1000, Atlanta, GA 30301", 36, 741, 8.5, "F1", "#d4dce8");
  pdf.text("Account Statement", 424, 766, 16, "F2", "#ffffff");
  pdf.text("Statement Period: 04/01/2026 - 04/30/2026", 350, 749, 8.5, "F1", "#d4dce8");
  pdf.text(`Account Ending: ${accountEnding}`, 350, 737, 8.5, "F1", "#d4dce8");
  pdf.text("Currency: USD", 350, 725, 8.5, "F1", "#d4dce8");

  sectionBox(pdf, 36, 638, 168, "CUSTOMER", [
    { value: propertyName },
    { label: "Property ID:", value: `PROP-${code.replace("P", "")}-${slug(propertyName).slice(0, 3).toUpperCase()}` },
  ]);
  sectionBox(pdf, 222, 638, 168, "ACCOUNT", [
    { value: accountLabel(bankName) },
    { label: "Account ID:", value: `BANK-${yardiCode}-${accountEnding}` },
  ]);
  sectionBox(pdf, 408, 638, 168, "STATEMENT", [
    { label: "Source File:", value: `FILE-BANK-202604-${String(sequence).padStart(3, "0")}` },
    { label: "Month:", value: "2026-04" },
  ]);

  metricBox(pdf, 36, 558, 126, "OPENING BALANCE", money(openingBalance));
  metricBox(pdf, 174, 558, 126, "TOTAL DEBITS", money(totalDebits), "#9f1d1d");
  metricBox(pdf, 312, 558, 126, "TOTAL CREDITS", money(totalCredits), "#067647");
  metricBox(pdf, 450, 558, 126, "CLOSING BALANCE", money(closingBalance));

  pdf.text(`${propertyName} - ${accountLabel(bankName)}`, 36, 531, 12, "F2", "#17202c");
  pdf.text("Transaction activity", 36, 515, 8.5, "F1", "#607084");
  pdf.rect(36, 486, 540, 22, "#101927");
  pdf.text("DATE", 44, 494, 7.3, "F2", "#ffffff");
  pdf.text("POSTED DATE", 98, 494, 7.3, "F2", "#ffffff");
  pdf.text("DESCRIPTION", 168, 494, 7.3, "F2", "#ffffff");
  pdf.rightText("DEBITS", 452, 494, 7.3, "F2", "#ffffff");
  pdf.rightText("CREDITS", 512, 494, 7.3, "F2", "#ffffff");
  pdf.rightText("BALANCE", 568, 494, 7.3, "F2", "#ffffff");

  let y = 466;
  rows.forEach((row, index) => {
    if (index % 2 === 0) pdf.rect(36, y - 9, 540, 27, "#f8fafc");
    pdf.text(row.date, 44, y, 7.7, "F1", "#17202c");
    pdf.text(row.postedDate, 98, y, 7.7, "F1", "#17202c");
    pdf.text(fitText(row.description, 40), 168, y, 7.7, "F1", "#17202c");
    if (row.debit) pdf.rightText(money(row.debit), 452, y, 7.7, "F1", "#17202c");
    if (row.credit) pdf.rightText(money(row.credit), 512, y, 7.7, "F1", "#17202c");
    pdf.rightText(money(row.balance), 568, y, 7.7, "F1", "#17202c");
    pdf.text(`Reference: ${row.reference}`, 168, y - 11, 7.2, "F1", "#607084");
    pdf.line(36, y - 15, 576, y - 15, "#dce3eb", 0.45);
    y -= 28;
  });

  pdf.rect(36, 36, 540, 48, "#f8fafc", "#dce3eb");
  pdf.text("This source-style statement was generated for the BPO Reconciliation Agent POC", 48, 67, 8, "F1", "#607084");
  pdf.text("from normalized transaction data.", 48, 55, 8, "F1", "#607084");
  pdf.text("Please review debits, credits, references, and running balances before using this file in any demonstration.", 48, 43, 8, "F1", "#607084");

  return pdf.output();
}

async function pdfSamples() {
  let sequence = 1;
  for (const [propertyIndex, property] of properties.entries()) {
    for (const [bankIndex, bank] of banks.entries()) {
      const filename = `${slug(property[1])}-${slug(bank[0])}-2026-04.pdf`;
      await fs.writeFile(
        path.join(samplesDir, filename),
        bankStatementPdf({ property, bank, propertyIndex, bankIndex, sequence }),
        "binary",
      );
      sequence += 1;
    }
  }
}

await fs.mkdir(samplesDir, { recursive: true });
await propertyWorkbook();
await ledgerWorkbook();
await pdfSamples();
await fs.writeFile(path.join(samplesDir, "README.md"), "# Demo Samples\n\nGenerated by `npm run samples:generate`.\n\n- `property-bank-import-sample.xlsx`: 5 properties and 4 banks each.\n- `yardi-ledger-sample.xlsx`: Yardi ledger Excel upload fixture.\n- `*-2026-04.pdf`: 20 FNB-style bank statement PDF fixtures with account blocks, balance summary, transaction table, references, and running balances.\n");
console.log(`Generated samples in ${samplesDir}`);

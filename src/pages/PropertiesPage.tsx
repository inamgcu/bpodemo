import { ChevronDown, ChevronRight, FileUp, Plus, Save, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { StatusBadge, type ViewId } from "../components/Ui";
import type { BankAccount, Property } from "../domain/types";
import { importPropertyBankWorkbook } from "../services/fileImport";
import { useAppState } from "../state/AppStateContext";
import { getInitialExpandedPropertyId } from "./pageBehavior";

const blankBank = (propertyId: string): BankAccount => ({
  id: "",
  propertyId,
  name: "",
  accountNumber: "",
  yardiCode: "",
  status: "active",
});

export function PropertiesPage({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const { state, dispatch } = useAppState();
  const [expanded, setExpanded] = useState(getInitialExpandedPropertyId(state.selectedPropertyId));
  const [propertyDrafts, setPropertyDrafts] = useState<Record<string, Property>>({});
  const [bankDrafts, setBankDrafts] = useState<Record<string, BankAccount>>({});
  const [newBanks, setNewBanks] = useState<Record<string, BankAccount>>({});
  const propertyRows = useMemo(
    () => state.properties.map((property) => ({ property, banks: state.banks.filter((bank) => bank.propertyId === property.id) })),
    [state.banks, state.properties],
  );

  async function importExcel(file?: File) {
    if (!file) return;
    try {
      const result = await importPropertyBankWorkbook(file);
      dispatch({
        type: "import-properties",
        properties: result.properties,
        banks: result.banks,
        fileName: file.name,
        validRows: result.validRows,
        invalidRows: result.invalidRows.length,
      });
    } catch (error) {
      dispatch({ type: "toast", tone: "danger", message: error instanceof Error ? error.message : "Unable to import Excel workbook." });
    }
  }

  function saveProperty(property: Property) {
    const draft = propertyDrafts[property.id] ?? property;
    if (!draft.code.trim() || !draft.name.trim()) {
      dispatch({ type: "toast", tone: "danger", message: "Property code and name are required." });
      return;
    }
    dispatch({ type: "upsert-property", property: draft });
  }

  function saveBank(bank: BankAccount) {
    if (!bank.name.trim() || !bank.accountNumber.trim() || !bank.yardiCode.trim()) {
      dispatch({ type: "toast", tone: "danger", message: "Bank name, account number, and Yardi code are required." });
      return;
    }
    dispatch({ type: "upsert-bank", bank: { ...bank, id: bank.id || `bank-${crypto.randomUUID()}` } });
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Property configuration</p>
            <h2>Properties and bank associations</h2>
          </div>
          <label className="file-button">
            <FileUp size={16} />
            Import Excel
            <input type="file" accept=".xlsx,.xls" onChange={(event) => importExcel(event.target.files?.[0])} />
          </label>
        </div>
        <table>
          <thead><tr><th>Select</th><th>Code</th><th>Name</th><th>Status</th><th>Banks</th><th>Actions</th></tr></thead>
          <tbody>
            {propertyRows.map(({ property, banks }) => {
              const draft = propertyDrafts[property.id] ?? property;
              const selected = state.selectedPropertyId === property.id;
              return (
                <Fragment key={property.id}>
                  <tr className={selected ? "selected-row" : ""}>
                    <td><input className="radio-input" type="radio" checked={selected} onChange={() => dispatch({ type: "select-property", propertyId: property.id })} /></td>
                    <td><input value={draft.code} onChange={(event) => setPropertyDrafts((current) => ({ ...current, [property.id]: { ...draft, code: event.target.value } }))} /></td>
                    <td><input value={draft.name} onChange={(event) => setPropertyDrafts((current) => ({ ...current, [property.id]: { ...draft, name: event.target.value } }))} /></td>
                    <td><select value={draft.status} onChange={(event) => setPropertyDrafts((current) => ({ ...current, [property.id]: { ...draft, status: event.target.value as Property["status"] } }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></td>
                    <td><StatusBadge tone="info">{banks.length} banks</StatusBadge></td>
                    <td className="table-actions">
                      <button type="button" title="Save property" onClick={() => saveProperty(property)}><Save size={15} /></button>
                      <button type="button" title="View bank details" onClick={() => setExpanded(expanded === property.id ? "" : property.id)}>{expanded === property.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
                    </td>
                  </tr>
                  {expanded === property.id ? (
                    <tr><td colSpan={6}>
                      <div className="bank-panel">
                        {banks.map((bank) => {
                          const draftBank = bankDrafts[bank.id] ?? bank;
                          return (
                            <div className="bank-row" key={bank.id}>
                              <input value={draftBank.name} onChange={(event) => setBankDrafts((current) => ({ ...current, [bank.id]: { ...draftBank, name: event.target.value } }))} />
                              <input value={draftBank.accountNumber} onChange={(event) => setBankDrafts((current) => ({ ...current, [bank.id]: { ...draftBank, accountNumber: event.target.value } }))} />
                              <input value={draftBank.yardiCode} onChange={(event) => setBankDrafts((current) => ({ ...current, [bank.id]: { ...draftBank, yardiCode: event.target.value } }))} />
                              <button type="button" className="secondary-button" onClick={() => saveBank(draftBank)}><Save size={15} />Save</button>
                              <button type="button" className="secondary-button danger" onClick={() => window.confirm(`Remove ${bank.name}?`) && dispatch({ type: "delete-bank", bankId: bank.id })}><Trash2 size={15} />Remove</button>
                            </div>
                          );
                        })}
                        <div className="bank-row">
                          <input placeholder="Bank name" value={(newBanks[property.id] ?? blankBank(property.id)).name} onChange={(event) => setNewBanks((current) => ({ ...current, [property.id]: { ...(current[property.id] ?? blankBank(property.id)), name: event.target.value } }))} />
                          <input placeholder="Account number" value={(newBanks[property.id] ?? blankBank(property.id)).accountNumber} onChange={(event) => setNewBanks((current) => ({ ...current, [property.id]: { ...(current[property.id] ?? blankBank(property.id)), accountNumber: event.target.value } }))} />
                          <input placeholder="Yardi code" value={(newBanks[property.id] ?? blankBank(property.id)).yardiCode} onChange={(event) => setNewBanks((current) => ({ ...current, [property.id]: { ...(current[property.id] ?? blankBank(property.id)), yardiCode: event.target.value } }))} />
                          <button type="button" className="primary-button" onClick={() => saveBank(newBanks[property.id] ?? blankBank(property.id))}><Plus size={15} />Add Bank</button>
                        </div>
                      </div>
                    </td></tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="sticky-actions">
        <span>{state.properties.find((property) => property.id === state.selectedPropertyId)?.name ?? "No property selected"}</span>
        <button className="primary-button" type="button" onClick={() => onNavigate("reconcile")}>Initiate Reconciliation</button>
      </div>
    </main>
  );
}

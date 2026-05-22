import { useMemo, useState } from "react";

type YardiItem = {
  id: string;
  control: string;
  date: string;
  memo: string;
  amount: string;
};

const items: YardiItem[] = [
  { id: "yardi-1", control: "DEP-778", date: "02/29/2024", memo: "ACH/XY Deposit", amount: "1,704.50" },
  { id: "yardi-2", control: "DEP-881", date: "02/29/2024", memo: "PL Deposit 3169676", amount: "1,035.00" },
  { id: "yardi-3", control: "CHK-404", date: "02/29/2024", memo: "CHECKscan Deposit", amount: "185.00" },
  { id: "yardi-4", control: "REF-17", date: "02/29/2024", memo: "PL Deposit 3179166", amount: "1,750.00" },
  { id: "yardi-5", control: "INT-22", date: "02/29/2024", memo: "PL Deposit 3195708", amount: "800.00" },
];

const navGroups = [
  "Roles",
  "Reports",
  "Charges",
  "Receivables",
  "Payables",
  "Mortgage",
  "G/L",
  "Residential",
  "Setup",
  "Administration",
  "Purchasing",
];

export function MockYardiPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [bankingOpen, setBankingOpen] = useState(false);
  const [screen, setScreen] = useState<"home" | "reconcile">("home");
  const [cleared, setCleared] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");

  const clearedCount = useMemo(() => Object.values(cleared).filter(Boolean).length, [cleared]);

  function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggedIn(true);
  }

  function selectAll() {
    setCleared(Object.fromEntries(items.map((item) => [item.id, true])));
  }

  function save() {
    setMessage(`${clearedCount} item(s) marked reconciled.`);
  }

  if (!loggedIn) {
    return (
      <main className="yardi-login-page">
        <form className="yardi-login-card" onSubmit={login}>
          <h1>YARDI VOYAGER</h1>
          <label>
            User name
            <input data-testid="yardi-username" name="username" defaultValue="yardi.demo" />
          </label>
          <label>
            Password
            <input data-testid="yardi-password" name="password" defaultValue="password" type="password" />
          </label>
          <button data-testid="yardi-login" type="submit">Sign In</button>
        </form>
      </main>
    );
  }

  return (
    <main className="yardi-shell">
      <header className="yardi-header">
        <div className="yardi-logo"><strong>YARDI</strong><span>VOYAGER</span></div>
        <nav><button type="button">Home</button><button type="button">Help</button><button type="button">Sign Out</button></nav>
        <input aria-label="Site Search" placeholder="Site Search" />
      </header>
      <div className="yardi-body">
        <aside className="yardi-sidebar">
          {navGroups.map((group) => <button key={group} type="button">▸ {group}</button>)}
          <button className={bankingOpen ? "active" : ""} data-testid="yardi-banking-menu" type="button" onClick={() => setBankingOpen((value) => !value)}>
            ▸ Banking
          </button>
          {bankingOpen ? (
            <div className="yardi-submenu">
              <button data-testid="yardi-bank-reconcile" type="button" onClick={() => setScreen("reconcile")}>Bank Reconcile</button>
              <button type="button">Bank Functions</button>
              <button type="button">Bank Adjustment</button>
              <button type="button">Check Book Maintenance</button>
            </div>
          ) : null}
        </aside>
        <section className="yardi-workspace">
          {screen === "home" ? (
            <div className="yardi-empty">
              <h2>Dashboard</h2>
              <p>Select Banking and open Bank Reconcile.</p>
            </div>
          ) : (
            <>
              <h2>Bank Reconcile</h2>
              <section className="yardi-summary">
                <article><h3>G/L Information</h3><p>Bank Account Name <strong>Hawthorne Hills</strong></p><p>G/L Balance <strong>10,003.77</strong></p></article>
                <article><h3>Bank Information</h3><p>Balance Per Bank Statement <strong>13,071.96</strong></p><p>Outstanding Checks <strong>3,068.19</strong></p></article>
                <article><h3>Item Totals</h3><p>Deposits <strong>31,620.00</strong></p><p>Bank Recon Items <strong>{clearedCount}</strong></p></article>
              </section>
              <div className="yardi-grid-toolbar">
                <label>Search <input aria-label="Search Number" /></label>
                <button type="button">Refresh</button>
                <button data-testid="yardi-select-all" type="button" onClick={selectAll}>Select All</button>
                <button type="button" onClick={() => setCleared({})}>Unselect All</button>
                <button data-testid="yardi-save" type="button" onClick={save}>Save</button>
              </div>
              {message ? <p className="yardi-message" data-testid="yardi-save-message">{message}</p> : null}
              <table className="yardi-table">
                <thead>
                  <tr><th>Control</th><th>Date</th><th>Memo</th><th>Amount</th><th>Clear?</th><th>Clear Date</th></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.control}</td>
                      <td>{item.date}</td>
                      <td>{item.memo}</td>
                      <td>{item.amount}</td>
                      <td>
                        <input
                          aria-label={`Clear ${item.control}`}
                          checked={Boolean(cleared[item.id])}
                          data-testid="yardi-clear-checkbox"
                          type="checkbox"
                          onChange={(event) => setCleared((current) => ({ ...current, [item.id]: event.target.checked }))}
                        />
                      </td>
                      <td><input aria-label={`Clear date ${item.control}`} defaultValue="02/29/2024" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

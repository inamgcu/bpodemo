use bpo_yardi_reconciliation_lib::{
    database_path, load_state, run_node_automation_script, run_python_automation_script, save_state,
    visible_mock_browser_html,
};
use rusqlite::Connection;
use serde_json::json;
use tempfile::tempdir;

#[test]
fn persists_snapshot_and_projection_tables() {
    let dir = tempdir().expect("temp dir");
    let state = json!({
        "properties": [{ "id": "prop-1", "code": "P100", "name": "Cedar", "status": "active" }],
        "banks": [{ "id": "bank-1", "propertyId": "prop-1", "name": "Operating", "accountNumber": "1001", "yardiCode": "Y-P100-OPER", "status": "active" }],
        "runs": [{
            "id": "run-1",
            "propertyId": "prop-1",
            "month": "2026-04",
            "status": "complete",
            "closingBalance": 1200,
            "createdAt": "2026-05-22T00:00:00.000Z",
            "updatedAt": "2026-05-22T00:00:00.000Z",
            "files": [{ "id": "file-1", "name": "bank.pdf", "kind": "bank-statement", "status": "parsed", "rowCount": 1, "uploadedAt": "2026-05-22T00:00:00.000Z", "bankId": "bank-1" }],
            "transactions": [{ "id": "txn-1", "runId": "run-1", "propertyId": "prop-1", "bankId": "bank-1", "source": "bank", "date": "2026-04-01", "description": "Deposit", "debit": 0, "credit": 100, "amount": 100, "sourceFile": "bank.pdf" }],
            "matches": [],
            "exceptions": [{ "id": "ex-1", "runId": "run-1", "matchId": "match-1", "category": "amount-mismatch", "status": "resolved", "severity": "high", "aiReasoning": "Amount discrepancy detected.", "confidence": 0.81, "userDecision": "approve", "userFeedback": "Approved tolerance.", "updatedAt": "2026-05-22T00:00:00.000Z" }],
            "automationLogs": []
        }],
        "selectedPropertyId": "prop-1",
        "activeRunId": "run-1",
        "auditLogs": [{ "id": "audit-1", "actor": "System", "action": "Saved", "detail": "Snapshot", "timestamp": "2026-05-22T00:00:00.000Z" }]
    });

    save_state(dir.path(), &state).expect("save");
    assert_eq!(load_state(dir.path()).expect("load"), Some(state));

    let connection = Connection::open(database_path(dir.path())).expect("db");
    assert_eq!(count(&connection, "properties"), 1);
    assert_eq!(count(&connection, "banks"), 1);
    assert_eq!(count(&connection, "reconciliation_runs"), 1);
    assert_eq!(count(&connection, "transactions"), 1);
    assert_eq!(count(&connection, "exceptions"), 1);
    assert_eq!(count(&connection, "ai_reasoning"), 1);
    assert_eq!(count(&connection, "user_feedback"), 1);
    assert_eq!(count(&connection, "audit_logs"), 1);
    assert_eq!(count(&connection, "uploaded_files_metadata"), 1);
}

fn count(connection: &Connection, table: &str) -> i64 {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
        .expect("count")
}

#[test]
fn visible_mock_browser_html_contains_automation_steps() {
    let html = visible_mock_browser_html("automation-script\\Yardi-Automation.ts");

    assert!(html.contains("Yardi Browser Automation"));
    assert!(html.contains("Open Yardi reconciliation workspace"));
    assert!(html.contains("Yardi-Automation.ts"));
}

#[test]
fn real_python_automation_script_is_executed_and_returns_output() {
    let dir = tempdir().expect("temp dir");
    let script_path = dir.path().join("automation_smoke.py");
    std::fs::write(&script_path, "print('attendance script executed')\n").expect("write script");

    let result = run_python_automation_script(script_path.to_str().expect("script path"))
        .expect("run script");

    assert!(!result.mocked);
    assert_eq!(result.exit_code, Some(0));
    assert!(result
        .lines
        .iter()
        .any(|line| line.contains("attendance script executed")));
}

#[test]
fn node_automation_script_is_copied_to_runtime_and_executed() {
    let source_dir = tempdir().expect("source temp dir");
    let runtime_dir = tempdir().expect("runtime temp dir");
    let script_path = source_dir.path().join("Yardi-Automation.ts");
    std::fs::write(
        &script_path,
        r#"
import fs from "node:fs";
import path from "node:path";

const message: string = "yardi automation executed";
fs.writeFileSync(path.join(process.cwd(), "marker.txt"), message);
console.log(message);
"#,
    )
    .expect("write ts script");

    let result = run_node_automation_script(
        script_path.to_str().expect("script path"),
        runtime_dir.path(),
        &[],
    )
    .expect("run ts script");

    assert!(!result.mocked);
    assert_eq!(result.exit_code, Some(0));
    assert!(runtime_dir.path().join("Yardi-Automation.ts").exists());
    assert_eq!(
        std::fs::read_to_string(runtime_dir.path().join("marker.txt")).expect("marker"),
        "yardi automation executed"
    );
    assert!(result
        .lines
        .iter()
        .any(|line| line.contains("yardi automation executed")));
}

use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose, Engine as _};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

const DATABASE_FILE: &str = "reconciliation.db";
const DEFAULT_AUTOMATION_SCRIPT: &str = r"C:\Users\inamul.haq\Downloads\Gmail-Agent.ts";
const NODE_AUTOMATION_PACKAGES: [&str; 2] = ["tsx@4.21.0", "@browserbasehq/stagehand@3.4.0"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserAutomationResult {
    pub mocked: bool,
    #[serde(rename = "exitCode")]
    pub exit_code: Option<i32>,
    pub lines: Vec<String>,
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(to_error)?;
    fs::create_dir_all(&dir).map_err(to_error)?;
    Ok(dir)
}

pub fn database_path(root: impl AsRef<Path>) -> PathBuf {
    root.as_ref().join(DATABASE_FILE)
}

fn open_connection(root: impl AsRef<Path>) -> Result<Connection, String> {
    fs::create_dir_all(root.as_ref()).map_err(to_error)?;
    Connection::open(database_path(root)).map_err(to_error)
}

fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn optional_text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}

fn raw(value: &Value) -> Result<String, String> {
    serde_json::to_string(value).map_err(to_error)
}

fn array(value: Option<&Value>) -> &[Value] {
    value.and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[])
}

pub fn initialize_database(root: impl AsRef<Path>) -> Result<(), String> {
    let connection = open_connection(root)?;
    connection.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS properties (
          id TEXT PRIMARY KEY NOT NULL,
          code TEXT,
          name TEXT,
          status TEXT,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS banks (
          id TEXT PRIMARY KEY NOT NULL,
          property_id TEXT,
          name TEXT,
          account_number TEXT,
          yardi_code TEXT,
          status TEXT,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reconciliation_runs (
          id TEXT PRIMARY KEY NOT NULL,
          property_id TEXT,
          month TEXT,
          status TEXT,
          closing_balance REAL,
          created_at TEXT,
          updated_at TEXT,
          approved_by TEXT,
          approved_at TEXT,
          final_report_path TEXT,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY NOT NULL,
          run_id TEXT,
          property_id TEXT,
          bank_id TEXT,
          source TEXT,
          transaction_date TEXT,
          posted_date TEXT,
          description TEXT,
          reference TEXT,
          debit REAL,
          credit REAL,
          amount REAL,
          source_file TEXT,
          yardi_id TEXT,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exceptions (
          id TEXT PRIMARY KEY NOT NULL,
          run_id TEXT,
          match_id TEXT,
          category TEXT,
          status TEXT,
          severity TEXT,
          confidence REAL,
          updated_at TEXT,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_reasoning (
          id TEXT PRIMARY KEY NOT NULL,
          exception_id TEXT,
          run_id TEXT,
          reasoning TEXT,
          confidence REAL,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_feedback (
          id TEXT PRIMARY KEY NOT NULL,
          exception_id TEXT,
          run_id TEXT,
          decision TEXT,
          feedback TEXT,
          updated_at TEXT,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY NOT NULL,
          run_id TEXT,
          actor TEXT,
          action TEXT,
          detail TEXT,
          event_timestamp TEXT,
          raw_payload TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS uploaded_files_metadata (
          id TEXT PRIMARY KEY NOT NULL,
          run_id TEXT,
          bank_id TEXT,
          name TEXT,
          kind TEXT,
          status TEXT,
          row_count INTEGER,
          uploaded_at TEXT,
          error TEXT,
          raw_payload TEXT NOT NULL
        );
        "#,
    ).map_err(to_error)?;

    connection.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '1', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![timestamp()],
    ).map_err(to_error)?;
    Ok(())
}

fn clear_projection(tx: &Transaction<'_>) -> Result<(), String> {
    for table in [
        "properties",
        "banks",
        "reconciliation_runs",
        "transactions",
        "exceptions",
        "ai_reasoning",
        "user_feedback",
        "audit_logs",
        "uploaded_files_metadata",
    ] {
        tx.execute(&format!("DELETE FROM {table}"), []).map_err(to_error)?;
    }
    Ok(())
}

fn sync_projection(tx: &Transaction<'_>, state: &Value) -> Result<(), String> {
    clear_projection(tx)?;

    for property in array(state.get("properties")) {
        tx.execute(
            "INSERT INTO properties (id, code, name, status, raw_payload) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![text(property, "id"), optional_text(property, "code"), optional_text(property, "name"), optional_text(property, "status"), raw(property)?],
        ).map_err(to_error)?;
    }

    for bank in array(state.get("banks")) {
        tx.execute(
            "INSERT INTO banks (id, property_id, name, account_number, yardi_code, status, raw_payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![text(bank, "id"), optional_text(bank, "propertyId"), optional_text(bank, "name"), optional_text(bank, "accountNumber"), optional_text(bank, "yardiCode"), optional_text(bank, "status"), raw(bank)?],
        ).map_err(to_error)?;
    }

    for run in array(state.get("runs")) {
        tx.execute(
            "INSERT INTO reconciliation_runs (id, property_id, month, status, closing_balance, created_at, updated_at, approved_by, approved_at, final_report_path, raw_payload)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![text(run, "id"), optional_text(run, "propertyId"), optional_text(run, "month"), optional_text(run, "status"), number(run, "closingBalance"), optional_text(run, "createdAt"), optional_text(run, "updatedAt"), optional_text(run, "approvedBy"), optional_text(run, "approvedAt"), optional_text(run, "finalReportPath"), raw(run)?],
        ).map_err(to_error)?;

        for file in array(run.get("files")) {
            tx.execute(
                "INSERT INTO uploaded_files_metadata (id, run_id, bank_id, name, kind, status, row_count, uploaded_at, error, raw_payload)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![text(file, "id"), text(run, "id"), optional_text(file, "bankId"), optional_text(file, "name"), optional_text(file, "kind"), optional_text(file, "status"), file.get("rowCount").and_then(Value::as_i64), optional_text(file, "uploadedAt"), optional_text(file, "error"), raw(file)?],
            ).map_err(to_error)?;
        }

        for transaction in array(run.get("transactions")) {
            tx.execute(
                "INSERT INTO transactions (id, run_id, property_id, bank_id, source, transaction_date, posted_date, description, reference, debit, credit, amount, source_file, yardi_id, raw_payload)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                params![text(transaction, "id"), optional_text(transaction, "runId"), optional_text(transaction, "propertyId"), optional_text(transaction, "bankId"), optional_text(transaction, "source"), optional_text(transaction, "date"), optional_text(transaction, "postedDate"), optional_text(transaction, "description"), optional_text(transaction, "reference"), number(transaction, "debit"), number(transaction, "credit"), number(transaction, "amount"), optional_text(transaction, "sourceFile"), optional_text(transaction, "yardiId"), raw(transaction)?],
            ).map_err(to_error)?;
        }

        for exception in array(run.get("exceptions")) {
            tx.execute(
                "INSERT INTO exceptions (id, run_id, match_id, category, status, severity, confidence, updated_at, raw_payload)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![text(exception, "id"), optional_text(exception, "runId"), optional_text(exception, "matchId"), optional_text(exception, "category"), optional_text(exception, "status"), optional_text(exception, "severity"), number(exception, "confidence"), optional_text(exception, "updatedAt"), raw(exception)?],
            ).map_err(to_error)?;
            tx.execute(
                "INSERT INTO ai_reasoning (id, exception_id, run_id, reasoning, confidence, raw_payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![format!("ai-{}", text(exception, "id")), text(exception, "id"), optional_text(exception, "runId"), optional_text(exception, "aiReasoning"), number(exception, "confidence"), raw(exception)?],
            ).map_err(to_error)?;
            if exception.get("userDecision").is_some() || exception.get("userFeedback").is_some() {
                tx.execute(
                    "INSERT INTO user_feedback (id, exception_id, run_id, decision, feedback, updated_at, raw_payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![format!("feedback-{}", text(exception, "id")), text(exception, "id"), optional_text(exception, "runId"), optional_text(exception, "userDecision"), optional_text(exception, "userFeedback"), optional_text(exception, "updatedAt"), raw(exception)?],
                ).map_err(to_error)?;
            }
        }
    }

    for log in array(state.get("auditLogs")) {
        tx.execute(
            "INSERT INTO audit_logs (id, run_id, actor, action, detail, event_timestamp, raw_payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![text(log, "id"), optional_text(log, "runId"), optional_text(log, "actor"), optional_text(log, "action"), optional_text(log, "detail"), optional_text(log, "timestamp"), raw(log)?],
        ).map_err(to_error)?;
    }

    Ok(())
}

pub fn save_state(root: impl AsRef<Path>, state: &Value) -> Result<(), String> {
    initialize_database(&root)?;
    let mut connection = open_connection(root)?;
    let tx = connection.transaction().map_err(to_error)?;
    tx.execute(
        "INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at",
        params![serde_json::to_string(state).map_err(to_error)?, timestamp()],
    ).map_err(to_error)?;
    sync_projection(&tx, state)?;
    tx.commit().map_err(to_error)
}

pub fn load_state(root: impl AsRef<Path>) -> Result<Option<Value>, String> {
    initialize_database(&root)?;
    let connection = open_connection(root)?;
    let payload: Option<String> = connection
        .query_row("SELECT payload FROM app_state WHERE id = 1", [], |row| row.get(0))
        .optional()
        .map_err(to_error)?;
    payload.map(|value| serde_json::from_str(&value).map_err(to_error)).transpose()
}

#[tauri::command]
fn load_app_state(app: AppHandle) -> Result<Option<Value>, String> {
    load_state(storage_dir(&app)?)
}

#[tauri::command]
fn save_app_state(app: AppHandle, state: Value) -> Result<(), String> {
    save_state(storage_dir(&app)?, &state)
}

#[tauri::command]
fn get_storage_path(app: AppHandle) -> Result<String, String> {
    Ok(database_path(storage_dir(&app)?).to_string_lossy().to_string())
}

#[tauri::command]
fn export_report_file(app: AppHandle, file_name: String, base64_data: String) -> Result<String, String> {
    let dir = storage_dir(&app)?.join("reports");
    fs::create_dir_all(&dir).map_err(to_error)?;
    let safe_name = file_name
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') { character } else { '_' })
        .collect::<String>();
    let target = dir.join(safe_name);
    let bytes = general_purpose::STANDARD.decode(base64_data).map_err(to_error)?;
    fs::write(&target, bytes).map_err(to_error)?;
    Ok(target.to_string_lossy().to_string())
}

fn command_output(program: &str, args: &[&str]) -> Result<(Option<i32>, String), String> {
    let output = Command::new(program).args(args).output().map_err(to_error)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok((output.status.code(), if stderr.is_empty() { stdout } else { stderr }))
}

fn command_output_lines_from_command(mut command: Command, empty_message: &str) -> Result<BrowserAutomationResult, String> {
    let output = command.output().map_err(to_error)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let mut lines = Vec::new();

    if !stdout.is_empty() {
        lines.extend(stdout.lines().map(str::to_string));
    }
    if !stderr.is_empty() {
        lines.extend(stderr.lines().map(|line| format!("stderr: {line}")));
    }
    if lines.is_empty() {
        lines.push(empty_message.to_string());
    }

    Ok(BrowserAutomationResult {
        mocked: false,
        exit_code: output.status.code(),
        lines,
    })
}

fn emit_automation_log(app: &AppHandle, line: &str) {
    let _ = app.emit("automation-log", line.to_string());
}

fn command_output_lines_with_events(
    app: &AppHandle,
    mut command: Command,
    empty_message: &str,
) -> Result<BrowserAutomationResult, String> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(to_error)?;
    let lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let mut readers = Vec::new();

    if let Some(stdout) = child.stdout.take() {
        let app = app.clone();
        let lines = Arc::clone(&lines);
        readers.push(thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                emit_automation_log(&app, &line);
                if let Ok(mut guard) = lines.lock() {
                    guard.push(line);
                }
            }
        }));
    }

    if let Some(stderr) = child.stderr.take() {
        let app = app.clone();
        let lines = Arc::clone(&lines);
        readers.push(thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let line = format!("stderr: {line}");
                emit_automation_log(&app, &line);
                if let Ok(mut guard) = lines.lock() {
                    guard.push(line);
                }
            }
        }));
    }

    let status = child.wait().map_err(to_error)?;
    for reader in readers {
        let _ = reader.join();
    }

    let mut lines = lines.lock().map_err(|_| "Unable to read automation logs.".to_string())?.clone();
    if lines.is_empty() {
        lines.push(empty_message.to_string());
        emit_automation_log(app, empty_message);
    }

    Ok(BrowserAutomationResult {
        mocked: false,
        exit_code: status.code(),
        lines,
    })
}

fn command_output_lines(program: &str, args: &[&str]) -> Result<BrowserAutomationResult, String> {
    let mut command = Command::new(program);
    command.args(args);
    command_output_lines_from_command(command, "Automation script completed without console output.")
}

pub fn run_python_automation_script(script_path: &str) -> Result<BrowserAutomationResult, String> {
    command_output_lines("python", &[script_path]).or_else(|python_error| {
        command_output_lines("py", &["-3", script_path]).map_err(|py_error| {
            format!(
                "Unable to run Python automation script with python or py launcher. python: {python_error}; py: {py_error}"
            )
        })
    })
}

fn node_package_name(spec: &str) -> &str {
    if let Some(stripped) = spec.strip_prefix('@') {
        if let Some(slash_index) = stripped.find('/') {
            let after_scope = slash_index + 1;
            let rest = &stripped[after_scope..];
            if let Some(version_index) = rest.find('@') {
                return &spec[..1 + after_scope + version_index];
            }
        }
        spec
    } else {
        spec.split('@').next().unwrap_or(spec)
    }
}

fn node_package_dir(runtime_dir: &Path, package_name: &str) -> PathBuf {
    let mut dir = runtime_dir.join("node_modules");
    for segment in package_name.split('/') {
        dir.push(segment);
    }
    dir
}

fn npm_program() -> &'static str {
    if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" }
}

fn ensure_node_manifest(runtime_dir: &Path) -> Result<(), String> {
    let manifest = runtime_dir.join("package.json");
    if manifest.exists() {
        return Ok(());
    }
    fs::write(
        manifest,
        r#"{
  "private": true,
  "type": "module",
  "description": "Runtime dependencies for desktop browser automation"
}
"#,
    )
    .map_err(to_error)
}

fn ensure_node_packages(runtime_dir: &Path, packages: &[&str]) -> Result<Vec<String>, String> {
    fs::create_dir_all(runtime_dir).map_err(to_error)?;
    ensure_node_manifest(runtime_dir)?;

    let missing = packages
        .iter()
        .filter(|package| !node_package_dir(runtime_dir, node_package_name(package)).exists())
        .copied()
        .collect::<Vec<_>>();

    if missing.is_empty() {
        return Ok(vec!["Node automation packages already installed.".to_string()]);
    }

    let mut install = Command::new(npm_program());
    install
        .args(["install", "--no-audit", "--no-fund"])
        .args(&missing)
        .current_dir(runtime_dir);
    let result = command_output_lines_from_command(
        install,
        "Node automation packages installed without console output.",
    )?;

    if result.exit_code != Some(0) {
        return Err(format!(
            "Unable to install Node automation packages: {}",
            result.lines.join("\n")
        ));
    }

    let mut lines = vec![format!("Installed Node automation package(s): {}", missing.join(", "))];
    lines.extend(result.lines);
    Ok(lines)
}

fn script_file_name(source: &Path) -> Result<String, String> {
    source
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| format!("Automation script has no valid file name: {}", source.display()))
}

fn prepare_node_automation_script(script_path: &str, runtime_dir: &Path, packages: &[&str]) -> Result<(String, Vec<String>), String> {
    let source = Path::new(script_path);
    if !source.exists() {
        return Err(format!("Node automation script was not found: {script_path}"));
    }

    fs::create_dir_all(runtime_dir).map_err(to_error)?;
    let file_name = script_file_name(source)?;
    let target = runtime_dir.join(&file_name);
    fs::copy(source, &target).map_err(to_error)?;

    let mut setup_lines = vec![format!("Prepared Node automation script: {}", target.display())];
    setup_lines.extend(ensure_node_packages(runtime_dir, packages)?);
    Ok((file_name, setup_lines))
}

fn node_script_command(runtime_dir: &Path, script_file_name: &str, use_tsx: bool) -> Command {
    let mut command = if use_tsx {
        if cfg!(target_os = "windows") {
            let mut command = Command::new("cmd");
            command.args(["/C", "node_modules\\.bin\\tsx.cmd"]).arg(script_file_name);
            command
        } else {
            let mut command = Command::new(runtime_dir.join("node_modules/.bin/tsx"));
            command.arg(script_file_name);
            command
        }
    } else {
        let mut command = Command::new("node");
        command.arg(script_file_name);
        command
    };
    command.current_dir(runtime_dir);
    command
}

pub fn run_node_automation_script(
    script_path: &str,
    runtime_dir: impl AsRef<Path>,
    packages: &[&str],
) -> Result<BrowserAutomationResult, String> {
    let runtime_dir = runtime_dir.as_ref();
    let (script_file_name, setup_lines) = prepare_node_automation_script(script_path, runtime_dir, packages)?;
    let use_tsx = packages.iter().any(|package| node_package_name(package) == "tsx");
    let mut result = command_output_lines_from_command(
        node_script_command(runtime_dir, &script_file_name, use_tsx),
        "Gmail-Agent.ts completed without console output.",
    )?;
    result.lines = setup_lines.into_iter().chain(result.lines).collect();
    Ok(result)
}

fn run_node_automation_script_with_events(
    app: &AppHandle,
    script_path: &str,
    runtime_dir: impl AsRef<Path>,
    packages: &[&str],
) -> Result<BrowserAutomationResult, String> {
    let runtime_dir = runtime_dir.as_ref();
    emit_automation_log(app, "Preparing Node/Stagehand automation runtime. First run can take a minute while dependencies install...");
    let (script_file_name, setup_lines) = prepare_node_automation_script(script_path, runtime_dir, packages)?;
    for line in &setup_lines {
        emit_automation_log(app, line);
    }
    let use_tsx = packages.iter().any(|package| node_package_name(package) == "tsx");
    let mut result = command_output_lines_with_events(
        app,
        node_script_command(runtime_dir, &script_file_name, use_tsx),
        "Gmail-Agent.ts completed without console output.",
    )?;
    result.lines = setup_lines.into_iter().chain(result.lines).collect();
    Ok(result)
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub fn visible_mock_browser_html(script_path: &str) -> String {
    let script = html_escape(script_path);
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Yardi Browser Automation</title>
  <style>
    body {{ margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #f4f6f8; color: #17202c; }}
    main {{ max-width: 980px; margin: 32px auto; border: 1px solid #dce3eb; border-radius: 10px; background: #fff; overflow: hidden; }}
    header {{ background: #101927; color: #fff; padding: 22px 26px; }}
    h1 {{ margin: 0; font-size: 26px; }}
    header p {{ margin: 6px 0 0; color: #b8c4d6; }}
    section {{ padding: 22px 26px; }}
    .browser-frame {{ border: 1px solid #cdd6e1; border-radius: 8px; overflow: hidden; }}
    .bar {{ display: flex; gap: 8px; align-items: center; background: #eef2f7; padding: 10px; }}
    .dot {{ width: 11px; height: 11px; border-radius: 50%; background: #d14b4b; }}
    .dot:nth-child(2) {{ background: #d9a441; }}
    .dot:nth-child(3) {{ background: #39a96b; }}
    .url {{ flex: 1; border: 1px solid #d0d7e2; border-radius: 999px; background: #fff; padding: 7px 12px; color: #607084; }}
    .content {{ display: grid; gap: 14px; min-height: 360px; padding: 24px; }}
    .step {{ display: flex; gap: 12px; align-items: center; border: 1px solid #dce3eb; border-radius: 8px; padding: 13px; opacity: .45; }}
    .step.active {{ border-color: #1f6feb; background: #eef6ff; opacity: 1; }}
    .step.done {{ background: #ecfdf5; opacity: 1; }}
    .num {{ display: inline-flex; width: 28px; height: 28px; border-radius: 50%; align-items: center; justify-content: center; background: #e7edf3; font-weight: 800; }}
    .active .num {{ background: #1f6feb; color: #fff; }}
    .done .num {{ background: #067647; color: #fff; }}
    code {{ color: #1f6feb; }}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Yardi Browser Automation</h1>
      <p>Visible mock automation launched from the desktop reconciliation approval flow.</p>
    </header>
    <section>
      <p>Automation script: <code>{script}</code></p>
      <div class="browser-frame">
        <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">https://yardi.mock/reconciliation</span></div>
        <div class="content" id="steps"></div>
      </div>
    </section>
  </main>
  <script>
    const labels = [
      "Open Yardi reconciliation workspace",
      "Authenticate with restricted demo credentials",
      "Select approved property and reconciliation month",
      "Locate approved matched transactions",
      "Mark transactions as reconciled",
      "Capture item-level completion log"
    ];
    const root = document.getElementById("steps");
    labels.forEach((label, index) => {{
      const item = document.createElement("div");
      item.className = "step";
      item.innerHTML = `<span class="num">${{index + 1}}</span><strong>${{label}}</strong>`;
      root.appendChild(item);
    }});
    let index = 0;
    const timer = setInterval(() => {{
      [...document.querySelectorAll(".step")].forEach((item, stepIndex) => {{
        item.className = "step" + (stepIndex < index ? " done" : stepIndex === index ? " active" : "");
      }});
      index += 1;
      if (index > labels.length) clearInterval(timer);
    }}, 850);
  </script>
</body>
</html>"#
    )
}

fn open_visible_mock_browser(app: &AppHandle, script_path: &str) -> Result<String, String> {
    let dir = storage_dir(app)?.join("automation");
    fs::create_dir_all(&dir).map_err(to_error)?;
    let page = dir.join("yardi-browser-automation.html");
    fs::write(&page, visible_mock_browser_html(script_path)).map_err(to_error)?;

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&page)
            .spawn()
            .map_err(|error| format!("Unable to open visible browser automation page: {error}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&page)
            .spawn()
            .map_err(|error| format!("Unable to open visible browser automation page: {error}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&page)
            .spawn()
            .map_err(|error| format!("Unable to open visible browser automation page: {error}"))?;
    }

    Ok(page.to_string_lossy().to_string())
}

#[tauri::command]
fn run_browser_automation(app: AppHandle, script_path: Option<String>, mock: Option<bool>) -> Result<BrowserAutomationResult, String> {
    let script = script_path.unwrap_or_else(|| DEFAULT_AUTOMATION_SCRIPT.to_string());
    let script_path = Path::new(&script);
    if !script_path.exists() {
        return Err(format!("Automation script was not found: {script}"));
    }
    if mock.unwrap_or(true) {
        let validation = if script_path.extension().and_then(|value| value.to_str()) == Some("py") {
            command_output("python", &["-m", "py_compile", &script])
                .or_else(|_| command_output("py", &["-3", "-m", "py_compile", &script]))
                .map(|(code, _)| (code, format!("Validated Python automation script: {script}")))
                .unwrap_or((None, format!("Python not available in PATH; script path exists and mock mode continued: {script}")))
        } else {
            (Some(0), format!("Validated Node automation script path: {script}"))
        };
        let page_path = open_visible_mock_browser(&app, &script)?;
        return Ok(BrowserAutomationResult {
            mocked: true,
            exit_code: validation.0,
            lines: vec![
                validation.1,
                format!("Opened visible mock browser automation page: {page_path}"),
                "MOCK browser opened the automation workspace.".to_string(),
                "MOCK selected approved property, bank, and reconciliation month.".to_string(),
                "MOCK marked approved transactions in the target system.".to_string(),
                "MOCK captured completion logs and closed the browser.".to_string(),
            ],
        });
    }
    let extension = script_path.extension().and_then(|value| value.to_str()).unwrap_or_default();
    let runtime_dir = storage_dir(&app)?.join("node-automation-runtime");
    let mut result = match extension.to_ascii_lowercase().as_str() {
        "py" => run_python_automation_script(&script)?,
        "js" | "mjs" | "cjs" | "ts" | "mts" | "cts" => {
            run_node_automation_script_with_events(&app, &script, runtime_dir, &NODE_AUTOMATION_PACKAGES)?
        }
        _ => {
            return Err(format!(
                "Unsupported automation script type '.{extension}'. Use Python, JavaScript, or TypeScript."
            ))
        }
    };
    let script_name = script_file_name(script_path)?;
    let return_line = format!("Returned to BPO Yardi Reconciliation after {script_name} completed.");
    result
        .lines
        .push(return_line.clone());
    emit_automation_log(&app, &return_line);
    focus_main_window(&app);
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            get_storage_path,
            export_report_file,
            run_browser_automation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

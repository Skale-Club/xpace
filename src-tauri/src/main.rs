// Xpace: portable disk space analyzer for Windows, in the spirit of TreeSize.
// Shows which folders and files take the space on a drive. Read-only: it
// never changes or deletes anything. No installer, no administrator rights.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod portable;
mod scan;
mod updater;
mod win;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::{fs, process::Command};
use tauri::{AppHandle, Emitter, Manager, State};

/// Settings kept in Data/xpace.json beside the executable.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Settings {
    language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self { language: "en".into() }
    }
}

struct AppState {
    settings: Mutex<Settings>,
    /// The last finished scan.
    tree: Mutex<Option<Arc<scan::Tree>>>,
    /// The scan in progress, if any.
    scanning: Mutex<Option<Arc<scan::Progress>>>,
    /// A newer release found on GitHub, waiting for the user to install it.
    update: Mutex<Option<updater::Update>>,
}

fn save_settings(settings: &Settings) {
    if let Ok(text) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(portable::data_dir().join("xpace.json"), text);
    }
}

fn load_settings() -> Settings {
    match fs::read_to_string(portable::data_dir().join("xpace.json")) {
        // Some editors save UTF-8 with a BOM, which serde_json rejects.
        Ok(text) => serde_json::from_str(text.trim_start_matches('\u{feff}')).unwrap_or_default(),
        Err(_) => {
            let settings = Settings::default();
            save_settings(&settings);
            settings
        }
    }
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn set_language(state: State<AppState>, language: String) {
    let mut settings = state.settings.lock().unwrap();
    settings.language = language;
    save_settings(&settings);
}

#[tauri::command]
async fn list_drives() -> Vec<win::Drive> {
    tauri::async_runtime::spawn_blocking(win::drives).await.unwrap_or_default()
}

#[tauri::command]
async fn pick_folder(window: tauri::WebviewWindow) -> Result<Option<String>, String> {
    let owner = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    tauri::async_runtime::spawn_blocking(move || win::pick_folder(owner)).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent {
    files: u64,
    folders: u64,
    bytes: u64,
    current: String,
}

/// Scans `path` (a previous scan in progress is cancelled) and sends
/// "progress" events while it runs.
#[tauri::command]
async fn start_scan(app: AppHandle, path: String) -> Result<scan::Summary, String> {
    let root = PathBuf::from(path.trim());
    if !root.is_absolute() || !root.is_dir() {
        return Err("notFolder".into());
    }
    let progress = Arc::new(scan::Progress::default());
    {
        let state = app.state::<AppState>();
        let mut scanning = state.scanning.lock().unwrap();
        if let Some(previous) = scanning.replace(progress.clone()) {
            previous.cancel();
        }
    }
    let done = Arc::new(AtomicBool::new(false));
    let ticker = {
        let (app, progress, done) = (app.clone(), progress.clone(), done.clone());
        std::thread::spawn(move || {
            // A cancelled scan goes quiet, so it can't mix with the next one.
            while !done.load(Ordering::Relaxed) && !progress.cancelled() {
                let _ = app.emit("progress", ProgressEvent {
                    files: progress.files.load(Ordering::Relaxed),
                    folders: progress.folders.load(Ordering::Relaxed),
                    bytes: progress.bytes.load(Ordering::Relaxed),
                    current: progress.current.lock().unwrap().clone(),
                });
                std::thread::sleep(Duration::from_millis(150));
            }
        })
    };
    let worker = progress.clone();
    let tree = tauri::async_runtime::spawn_blocking(move || scan::scan(&root, &worker)).await;
    done.store(true, Ordering::Relaxed);
    let _ = ticker.join();
    let tree = tree.map_err(|e| e.to_string())?;
    let summary = tree.summary.clone();
    let state = app.state::<AppState>();
    let mut scanning = state.scanning.lock().unwrap();
    // A newer scan replaced this one: leave the field to it.
    if scanning.as_ref().is_some_and(|p| Arc::ptr_eq(p, &progress)) {
        *scanning = None;
        *state.tree.lock().unwrap() = Some(Arc::new(tree));
    }
    Ok(summary)
}

#[tauri::command]
fn cancel_scan(state: State<AppState>) {
    if let Some(progress) = state.scanning.lock().unwrap().as_ref() {
        progress.cancel();
    }
}

fn current_tree(state: &State<AppState>) -> Result<Arc<scan::Tree>, String> {
    state.tree.lock().unwrap().clone().ok_or_else(|| "noScan".into())
}

#[tauri::command]
async fn open_folder(state: State<'_, AppState>, id: u32) -> Result<scan::Listing, String> {
    let tree = current_tree(&state)?;
    tauri::async_runtime::spawn_blocking(move || tree.listing(id).ok_or_else(|| "noFolder".to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn largest_files(state: State<AppState>) -> Result<Vec<scan::BigFile>, String> {
    Ok(current_tree(&state)?.top_files().to_vec())
}

#[tauri::command]
fn file_types(state: State<AppState>) -> Result<Vec<scan::TypeStat>, String> {
    Ok(current_tree(&state)?.types().to_vec())
}

/// Shows a file or folder in Explorer; `open` opens a folder instead.
#[tauri::command]
fn reveal(path: String, open: bool) -> Result<(), String> {
    win::reveal(&path, open)
}

/// Opens the Skale Club website in the default browser.
#[tauri::command]
fn open_site() {
    let _ = Command::new("explorer.exe").arg("https://skale.club").spawn();
}

/// Writes the CSV export into Data/exports beside the executable and shows it.
#[tauri::command]
fn save_export(name: String, csv: String) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let dir = portable::data_dir().join("exports");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{safe}.csv"));
    // BOM so Excel reads the names as UTF-8.
    fs::write(&path, format!("\u{feff}{csv}")).map_err(|e| e.to_string())?;
    let shown = path.display().to_string();
    let _ = win::reveal(&shown, false);
    Ok(shown)
}

/// Looks for a newer release; quietly None when offline.
#[tauri::command]
async fn check_update(app: AppHandle) -> Option<updater::Update> {
    tauri::async_runtime::spawn_blocking(move || {
        let update = updater::check().ok().flatten();
        *app.state::<AppState>().update.lock().unwrap() = update.clone();
        update
    })
    .await
    .ok()
    .flatten()
}

/// Downloads and verifies the update, swaps the exe and restarts.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let update = app.state::<AppState>().update.lock().unwrap().clone().ok_or("no update")?;
    tauri::async_runtime::spawn_blocking(move || updater::install(&update))
        .await
        .map_err(|e| e.to_string())??;
    app.exit(0);
    Ok(())
}

fn main() {
    updater::finish_previous();
    portable::sync_appinfo();
    tauri::Builder::default()
        .manage(AppState {
            settings: Mutex::new(load_settings()),
            tree: Mutex::new(None),
            scanning: Mutex::new(None),
            update: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_language,
            list_drives,
            pick_folder,
            start_scan,
            cancel_scan,
            open_folder,
            largest_files,
            file_types,
            reveal,
            save_export,
            open_site,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Xpace");
}

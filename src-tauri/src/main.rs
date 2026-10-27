// Xpace: portable disk space analyzer for Windows, in the spirit of TreeSize.
// Shows which folders and files take the space on a drive, and deletes what
// the user picks: to the Recycle Bin, or for good through the reviewed
// force-delete flow shared with Xcare. No installer, no administrator rights.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod find;
mod force_delete;
mod mcp;
mod mcp_tools;
mod portable;
mod scan;
mod updater;
mod win;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use std::{fs, process::Command};
use tauri::{AppHandle, Emitter, Manager, State};

/// Settings kept in Data/xpace.json beside the executable.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Settings {
    language: String,
    /// Folders and drives scanned lately, newest first.
    recent: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self { language: "en".into(), recent: Vec::new() }
    }
}

const RECENT: usize = 8;

struct AppState {
    settings: Mutex<Settings>,
    /// The last finished scan; deleting from it updates its totals.
    tree: Mutex<Option<Arc<RwLock<scan::Tree>>>>,
    /// The reviewed permanent deletion, and the size of each selected file.
    force: force_delete::Service,
    pending: Mutex<Option<(String, Vec<(PathBuf, u64)>)>>,
    /// The scan in progress, if any.
    scanning: Mutex<Option<Arc<scan::Progress>>>,
    /// Folder names for the search box, indexed on the first search.
    finder: find::Index,
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

/// Windows' folder picker, opened at `start` when that is a folder.
#[tauri::command]
async fn pick_folder(window: tauri::WebviewWindow, start: Option<String>) -> Result<Option<String>, String> {
    let owner = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let start = start.map(|s| find::expand(&s));
    tauri::async_runtime::spawn_blocking(move || win::pick_folder(owner, start.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// What the search box offers for `text`: subfolders of a typed path, or
/// folders whose names match.
#[tauri::command]
async fn find_folders(app: AppHandle, text: String) -> Result<find::Found, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppState>().finder.find(&text, || {
            // The profile first, so the user's own folders turn up first.
            let profile = std::env::var("USERPROFILE").map(PathBuf::from).into_iter();
            let drives = win::drives().into_iter().filter(|d| d.kind != "network").map(|d| PathBuf::from(d.path));
            profile.chain(drives).collect()
        })
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct Place {
    id: &'static str,
    path: String,
}

#[tauri::command]
async fn known_folders() -> Vec<Place> {
    tauri::async_runtime::spawn_blocking(|| win::known_folders().into_iter().map(|(id, path)| Place { id, path }).collect())
        .await
        .unwrap_or_default()
}

#[tauri::command]
fn forget_recent(state: State<AppState>, path: String) -> Vec<String> {
    let mut settings = state.settings.lock().unwrap();
    settings.recent.retain(|p| !p.eq_ignore_ascii_case(&path));
    save_settings(&settings);
    settings.recent.clone()
}

fn remember(state: &AppState, path: &str) {
    let mut settings = state.settings.lock().unwrap();
    settings.recent.retain(|p| !p.eq_ignore_ascii_case(path));
    settings.recent.insert(0, path.to_string());
    settings.recent.truncate(RECENT);
    save_settings(&settings);
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
    let root = find::folder(&path);
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
        *state.tree.lock().unwrap() = Some(Arc::new(RwLock::new(tree)));
    }
    if !summary.cancelled {
        remember(&state, &summary.path);
    }
    Ok(summary)
}

#[tauri::command]
fn cancel_scan(state: State<AppState>) {
    if let Some(progress) = state.scanning.lock().unwrap().as_ref() {
        progress.cancel();
    }
}

fn current_tree(state: &AppState) -> Result<Arc<RwLock<scan::Tree>>, String> {
    state.tree.lock().unwrap().clone().ok_or_else(|| "noScan".into())
}

#[tauri::command]
async fn open_folder(state: State<'_, AppState>, id: u32) -> Result<scan::Listing, String> {
    let tree = current_tree(&state)?;
    tauri::async_runtime::spawn_blocking(move || tree.read().unwrap().listing(id).ok_or_else(|| "noFolder".to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn largest_files(state: State<AppState>) -> Result<Vec<scan::BigFile>, String> {
    Ok(current_tree(&state)?.read().unwrap().top_files().to_vec())
}

#[tauri::command]
fn file_types(state: State<AppState>) -> Result<Vec<scan::TypeStat>, String> {
    Ok(current_tree(&state)?.read().unwrap().types().to_vec())
}

// ---------- deleting ----------

/// Only things inside the scanned folder can be deleted, never the folder
/// itself, nothing protected (Windows, programs, profile folders) and
/// nothing missing. Returns each path with its size if it is a file.
fn checked(tree: &scan::Tree, paths: &[String]) -> Result<Vec<(PathBuf, u64)>, String> {
    if paths.is_empty() {
        return Err("invalidSelection".into());
    }
    paths
        .iter()
        .map(|raw| {
            let path = force_delete::parse_path(raw)?;
            let root = tree.root();
            if !force_delete::under(&path, root) || force_delete::under(root, &path) {
                return Err("outsideScan".to_string());
            }
            if force_delete::protected(&path) {
                return Err("protectedPath".into());
            }
            let meta = fs::symlink_metadata(&path).map_err(|_| "notFound")?;
            Ok((path, if meta.is_dir() { 0 } else { meta.len() }))
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Deleted {
    /// Paths that are gone now.
    removed: Vec<String>,
    /// Paths still there (stopped, failed or scheduled for restart).
    kept: Vec<String>,
    summary: scan::Summary,
    outcome: Option<force_delete::Outcome>,
    /// Why the Recycle Bin stopped, if it did.
    error: Option<String>,
}

/// Takes what is gone out of the scan and says what is gone and what isn't.
fn settle(tree: &RwLock<scan::Tree>, paths: Vec<(PathBuf, u64)>, outcome: Option<force_delete::Outcome>, error: Option<String>) -> Deleted {
    let mut tree = tree.write().unwrap();
    let (mut removed, mut kept) = (Vec::new(), Vec::new());
    for (path, size) in paths {
        if fs::symlink_metadata(&path).is_err() {
            tree.forget(&path, size);
            removed.push(path.display().to_string());
        } else {
            kept.push(path.display().to_string());
        }
    }
    Deleted { removed, kept, summary: tree.summary.clone(), outcome, error }
}

/// Moves the chosen files and folders to the Recycle Bin.
#[tauri::command]
async fn recycle(app: AppHandle, window: tauri::WebviewWindow, paths: Vec<String>) -> Result<Deleted, String> {
    let owner = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let tree = current_tree(&app.state::<AppState>())?;
    let checked = checked(&tree.read().unwrap(), &paths)?;
    tauri::async_runtime::spawn_blocking(move || {
        let list: Vec<PathBuf> = checked.iter().map(|(p, _)| p.clone()).collect();
        let error = win::recycle(owner, &list).err();
        settle(&tree, checked, None, error)
    })
    .await
    .map_err(|e| e.to_string())
}

/// Reviews a permanent deletion: counts, size and the apps holding files.
#[tauri::command]
async fn prepare_delete(app: AppHandle, paths: Vec<String>) -> Result<force_delete::Preview, String> {
    let tree = current_tree(&app.state::<AppState>())?;
    let checked = checked(&tree.read().unwrap(), &paths)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let preview = state.force.prepare(paths)?;
        // The token is private to the shared module; read it from the reply.
        let token = serde_json::to_value(&preview).ok().and_then(|v| v["token"].as_str().map(String::from)).unwrap_or_default();
        *state.pending.lock().unwrap() = Some((token, checked));
        Ok(preview)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Deletes the reviewed selection for good. `mode` is "delete", "terminate"
/// (close the apps holding files first) or "reboot" (at the next restart,
/// administrator only).
#[tauri::command]
async fn execute_delete(app: AppHandle, token: String, mode: String) -> Result<Deleted, String> {
    let tree = current_tree(&app.state::<AppState>())?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let paths = match state.pending.lock().unwrap().take() {
            Some((pending, paths)) if pending == token => paths,
            _ => return Err("expiredSelection".to_string()),
        };
        let outcome = state.force.execute(&token, &mode);
        let (outcome, error) = match outcome {
            Ok(outcome) => (Some(outcome), None),
            Err(error) => (None, Some(error)),
        };
        Ok(settle(&tree, paths, outcome, error))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn is_admin() -> bool {
    win::is_admin()
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
    if mcp::requested() {
        return mcp_tools::serve();
    }
    tauri::Builder::default()
        .manage(AppState {
            settings: Mutex::new(load_settings()),
            tree: Mutex::new(None),
            force: force_delete::Service::default(),
            pending: Mutex::new(None),
            scanning: Mutex::new(None),
            finder: find::Index::default(),
            update: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_language,
            list_drives,
            pick_folder,
            find_folders,
            known_folders,
            forget_recent,
            start_scan,
            cancel_scan,
            open_folder,
            largest_files,
            file_types,
            reveal,
            recycle,
            prepare_delete,
            execute_delete,
            is_admin,
            save_export,
            open_site,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Xpace");
}

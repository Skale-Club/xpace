//! What Xpace offers over MCP (`Xpace.exe --mcp`): the drives, scanning a
//! folder and reading the result. Only reading: deleting stays in the window,
//! where the user reviews it.

use crate::mcp::{self, Tool};
use crate::{scan, win};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::rc::Rc;

const INSTRUCTIONS: &str = "Xpace is a disk space analyzer for Windows (like TreeSize). Scan a folder or \
drive with scan_folder, then read the result with list_folder, largest_files and file_types. Sizes are \
in bytes and times are Unix seconds. A scan of a whole drive can take a few minutes; it is kept until \
the next scan, so the other tools answer at once. Nothing is changed or deleted.";

type Shared = Rc<RefCell<Option<scan::Tree>>>;

fn scan_path(tree: &Shared, path: &Path) -> Result<Value, String> {
    if !path.is_absolute() || !path.is_dir() {
        return Err(format!("{} is not a folder.", path.display()));
    }
    let result = scan::scan(path, &scan::Progress::default());
    let summary = serde_json::to_value(&result.summary).unwrap_or_default();
    *tree.borrow_mut() = Some(result);
    Ok(summary)
}

/// The listing of `path` from the kept scan, scanning `path` first when the
/// scan doesn't cover it.
fn listing(tree: &Shared, path: &Path, limit: usize) -> Result<Value, String> {
    let covered = tree.borrow().as_ref().is_some_and(|t| t.find(path).is_some());
    if !covered {
        scan_path(tree, path)?;
    }
    let tree = tree.borrow();
    let tree = tree.as_ref().ok_or("No scan.")?;
    let id = tree.find(path).ok_or_else(|| format!("{} was not found in the scan.", path.display()))?;
    let mut value = serde_json::to_value(tree.listing(id)).unwrap_or_default();
    mcp::trim_list(&mut value, "folders", limit);
    mcp::trim_list(&mut value, "files", limit);
    Ok(value)
}

fn with_tree(tree: &Shared, read: impl FnOnce(&scan::Tree) -> Value) -> Result<Value, String> {
    tree.borrow().as_ref().map(read).ok_or_else(|| "Nothing scanned yet: call scan_folder first.".into())
}

fn path_input(what: &str) -> Value {
    json!({
        "type": "object",
        "properties": {
            "path": { "type": "string", "description": what },
            "limit": { "type": "integer", "description": "Most folders and files to list (default 50)." },
        },
        "required": ["path"],
    })
}

fn limit_input() -> Value {
    json!({
        "type": "object",
        "properties": { "limit": { "type": "integer", "description": "Most items to return (default 50)." } },
    })
}

pub fn serve() {
    let tree: Shared = Rc::new(RefCell::new(None));
    let tools = vec![
        Tool::new(
            "list_drives",
            "Drives with media in them: letter, label, file system, kind, total and free bytes.",
            mcp::no_input(),
            |_| Ok(json!(win::drives())),
        ),
        Tool::new(
            "scan_folder",
            "Scans a folder or drive (e.g. C:\\) and keeps the result for the other tools. Returns the \
             totals: size, files, folders, unreadable folders and how long it took.",
            path_input("Absolute folder or drive path."),
            {
                let tree = tree.clone();
                move |args| {
                    let mut summary = scan_path(&tree, &PathBuf::from(mcp::text(args, "path")?))?;
                    let root = tree.borrow().as_ref().map(|t| t.root().to_path_buf()).unwrap_or_default();
                    summary["top"] = listing(&tree, &root, mcp::number(args, "limit", 20) as usize)?["folders"].take();
                    Ok(summary)
                }
            },
        ),
        Tool::new(
            "list_folder",
            "A folder's subfolders (largest first, with size, file and folder counts) and its files. \
             Uses the kept scan when it covers the folder, otherwise scans the folder first.",
            path_input("Absolute folder path."),
            {
                let tree = tree.clone();
                move |args| {
                    listing(&tree, &PathBuf::from(mcp::text(args, "path")?), mcp::number(args, "limit", 50) as usize)
                }
            },
        ),
        Tool::new(
            "largest_files",
            "The largest files in the kept scan, largest first, with full paths.",
            limit_input(),
            {
                let tree = tree.clone();
                move |args| {
                    let limit = mcp::number(args, "limit", 50) as usize;
                    with_tree(&tree, |t| json!(t.top_files().iter().take(limit).collect::<Vec<_>>()))
                }
            },
        ),
        Tool::new(
            "file_types",
            "Space taken per file extension in the kept scan, largest first.",
            limit_input(),
            {
                let tree = tree.clone();
                move |args| {
                    let limit = mcp::number(args, "limit", 50) as usize;
                    with_tree(&tree, |t| json!(t.types().iter().take(limit).collect::<Vec<_>>()))
                }
            },
        ),
    ];
    mcp::serve("Xpace", "xpace.json", INSTRUCTIONS, tools);
}

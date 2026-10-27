//! Windows bits: the drive list, the folder picker and showing a path in
//! Explorer.

use serde::Serialize;
use std::ffi::c_void;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::ptr::null;

#[link(name = "kernel32")]
extern "system" {
    fn GetLogicalDrives() -> u32;
    fn GetDriveTypeW(root: *const u16) -> u32;
    fn GetDiskFreeSpaceExW(root: *const u16, available: *mut u64, total: *mut u64, free: *mut u64) -> i32;
    fn GetVolumeInformationW(
        root: *const u16,
        name: *mut u16,
        name_len: u32,
        serial: *mut u32,
        max_component: *mut u32,
        flags: *mut u32,
        fs_name: *mut u16,
        fs_name_len: u32,
    ) -> i32;
    fn SetErrorMode(mode: u32) -> u32;
}

#[repr(C)]
struct BrowseInfo {
    owner: isize,
    root: *const c_void,
    display: *mut u16,
    title: *const u16,
    flags: u32,
    callback: isize,
    data: isize,
    image: i32,
}

#[link(name = "shell32")]
extern "system" {
    fn SHBrowseForFolderW(data: *mut BrowseInfo) -> *mut c_void;
    fn SHGetPathFromIDListEx(id: *const c_void, path: *mut u16, len: u32, flags: u32) -> i32;
}

#[link(name = "ole32")]
extern "system" {
    fn CoInitializeEx(reserved: *const c_void, flags: u32) -> i32;
    fn CoUninitialize();
    fn CoTaskMemFree(data: *const c_void);
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

fn text(buffer: &[u16]) -> String {
    String::from_utf16_lossy(&buffer[..buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len())])
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    path: String,
    label: String,
    file_system: String,
    /// "fixed", "removable", "network" or "other".
    kind: &'static str,
    total: u64,
    free: u64,
}

/// Drives with media in them; empty card readers and DVD drives are left out.
pub fn drives() -> Vec<Drive> {
    // No "insert a disk" dialogs for empty drives.
    unsafe { SetErrorMode(0x0001 | 0x8000) };
    let mask = unsafe { GetLogicalDrives() };
    (0..26u8)
        .filter(|i| mask & (1 << i) != 0)
        .filter_map(|i| {
            let path = format!("{}:\\", (b'A' + i) as char);
            let root = wide(&path);
            let kind = match unsafe { GetDriveTypeW(root.as_ptr()) } {
                2 => "removable",
                3 => "fixed",
                4 => "network",
                _ => "other",
            };
            let (mut available, mut total, mut free) = (0u64, 0u64, 0u64);
            if unsafe { GetDiskFreeSpaceExW(root.as_ptr(), &mut available, &mut total, &mut free) } == 0 || total == 0 {
                return None;
            }
            let (mut name, mut fs_name) = ([0u16; 261], [0u16; 261]);
            let (mut serial, mut max_component, mut flags) = (0u32, 0u32, 0u32);
            unsafe {
                GetVolumeInformationW(
                    root.as_ptr(),
                    name.as_mut_ptr(),
                    name.len() as u32,
                    &mut serial,
                    &mut max_component,
                    &mut flags,
                    fs_name.as_mut_ptr(),
                    fs_name.len() as u32,
                )
            };
            Some(Drive { path, label: text(&name), file_system: text(&fs_name), kind, total, free })
        })
        .collect()
}

/// The classic folder dialog; None when the user cancels.
pub fn pick_folder(owner: isize) -> Result<Option<String>, String> {
    let initialized = unsafe { CoInitializeEx(null(), 2) };
    if initialized < 0 {
        return Err(format!("COM: {initialized}"));
    }
    let mut display = [0u16; 260];
    let mut data = BrowseInfo {
        owner,
        root: null(),
        display: display.as_mut_ptr(),
        title: null(),
        flags: 0x41, // folders only, new dialog style
        callback: 0,
        data: 0,
        image: 0,
    };
    let id = unsafe { SHBrowseForFolderW(&mut data) };
    let result = if id.is_null() {
        Ok(None)
    } else {
        let mut path = vec![0u16; 32768];
        let ok = unsafe { SHGetPathFromIDListEx(id, path.as_mut_ptr(), path.len() as u32, 0) };
        unsafe { CoTaskMemFree(id) };
        if ok == 0 { Err("This place is not a folder on disk.".into()) } else { Ok(Some(text(&path))) }
    };
    unsafe { CoUninitialize() };
    result
}

/// Opens Explorer with `path` selected (or, for a folder, opened).
pub fn reveal(path: &str, open: bool) -> Result<(), String> {
    let path = Path::new(path);
    // A quote can't be in a Windows name, and would break the argument.
    if !path.is_absolute() || path.to_string_lossy().contains('"') || !path.exists() {
        return Err("notFound".into());
    }
    let shown = path.to_string_lossy();
    let mut command = Command::new("explorer.exe");
    if open {
        command.raw_arg(format!("\"{shown}\""));
    } else {
        command.raw_arg(format!("/select,\"{shown}\""));
    }
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

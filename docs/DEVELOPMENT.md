# Development and releases — Xpace

This guide is for maintainers building, checking and publishing Xpace for Windows. For everyday use,
return to the [README](../README.md).

## Build locally

Use Windows with Microsoft Edge WebView2 Runtime, Node.js/npm, Rust's MSVC toolchain and Microsoft
C++ Build Tools with the Windows SDK. Install the **Desktop development with C++** workload. The
repository's release workflow currently selects Node.js 20 and stable Rust. See the [Tauri Windows
prerequisites](https://v2.tauri.app/start/prerequisites/#windows) for setup details.

From a directory where you keep source repositories:

~~~powershell
git clone https://github.com/Skale-Club/xpace.git
cd xpace
npm ci
npm run dev
~~~

Private repositories require an authenticated GitHub account with access. The frontend is plain
HTML, CSS and JavaScript served by Tauri 2; opening the HTML directly in a browser does not provide
the native commands.

To check Rust code, run the included tests and build the executable:

~~~powershell
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --release --locked
npm run build
~~~

The build produces `src-tauri/target/release/xpace.exe`. It does not create an installer or a
PortableApps package. Copy the executable to a writable folder for manual testing. Its `Data` folder
belongs beside that executable, including when running a development build.

## Architecture

Rust walks the chosen folder in parallel (rayon) and keeps every folder, with its size and counts,
in memory; files are only counted, plus the largest files and per-extension totals. The window asks
for one folder at a time (`open_folder`), and that folder's files are read from disk when it is
opened. Junctions and directory symbolic links are listed but never followed. A scan emits
`progress` events while it runs and can be cancelled.

Deleting: `recycle` sends the selection to the Recycle Bin with `SHFileOperationW` (undo allowed,
Windows warns before destroying anything too big for the Bin). Permanent deletion goes through
`force_delete.rs`, a copy of Xcare's reviewed force-delete module without its file pickers:
`prepare_delete` snapshots the selection and lists the apps holding files (Restart Manager), and
`execute_delete` re-checks every entry before deleting, closing those apps, or scheduling deletion at
restart. Keep the two copies in step. Both paths only accept items inside the scanned folder and
reject Xcare's protected locations. Afterwards `Tree::forget` takes what is gone out of the totals,
so the window does not need a rescan.

All the Skale X apps use the same palette: navy surfaces, primary blue `#5173D6` and soft blue
`#8FA9EE`. Keep English, Portuguese and Spanish UI strings consistent. Settings and exports use the
portable data directory; do not commit runtime data or private signing keys.

## Validate a change

Run the checks above when changing application code. Unit tests do not validate real Windows
devices, capture software or external APIs. For documentation-only changes, compare claims with the
implementation and check links and commands.

- Scan a whole drive and compare totals with Explorer's folder properties (expect small
  differences where folders can't be read).
- Scan a folder containing a junction and check it is listed as a link and not counted.
- Cancel a scan midway, then rescan; open folders, the treemap and both lists; export a CSV.
- Check the three languages and the folder dialog.
- Delete a file and a folder to the Recycle Bin and restore them; delete a file that an app has
  open permanently and with "close the apps"; try a protected folder (Documents itself) and check it
  is refused; check the totals after each.
- `cargo test -- --ignored recycles` sends a small temporary file to the real Recycle Bin.

Keep documentation aligned with observed behavior. Update the README's English instructions and
Portuguese/Spanish summaries together. A feature listed in the README should have an implemented
workflow; a release link should not imply that a binary exists before publication succeeds.

## Publish a release

The **Release** GitHub Actions workflow runs when a `v*` tag is pushed. A normal branch push does
not build or publish an executable. Publication needs repository write access, GitHub Actions
enabled and an Actions secret named `TAURI_SIGNING_PRIVATE_KEY` available to this repository. An
organization secret must grant this repository access.

The secret must contain the private signing key matching the app's embedded public update key. Keep
the key outside Git and back it up securely. The current workflow supplies an empty signing-key
password; using a password-protected key requires updating the workflow's secret configuration
first.

Before tagging a release, confirm that the repository has a signing key available through a
repository or permitted organization secret. A normal source push does not publish a binary.

For a reviewed release:

1. Start from a clean checkout of `main`, fetch the remote and confirm `origin`    points to
   `https://github.com/Skale-Club/xpace.git`.
2. Choose an unused semantic version. Set the same version in the npm package,    Rust package and
   Tauri configuration. Refresh the npm lockfile with    `npm install --package-lock-only` and the
   Rust lockfile with    `cargo check --manifest-path src-tauri/Cargo.toml`. Review those changes.
3. Run the tests and build above, then perform the relevant manual checks.
4. Commit the version changes and lockfiles. Create the corresponding `vMAJOR.MINOR.PATCH`    tag on
   that commit, then push `main` and that exact tag to `origin`.
5. Watch the [Actions run](https://github.com/Skale-Club/xpace/actions).    The tag must match the
   Rust package version. The workflow builds the app,    signs it and publishes `Xpace.exe` plus
   `Xpace.exe.sig` in    [Releases](https://github.com/Skale-Club/xpace/releases).
6. Download and smoke-test the release. Confirm both assets are present and    readable by the
   intended users before announcing a download or update.    Replace the dated pre-release notice in
   the README after the first release.

The existing `scripts/release.ps1` helper changes the three version manifests, commits, tags and
pushes immediately. It does not refresh lockfiles, run tests or check that signing secrets exist.
Use the reviewed process above when preparing lockfiles or validating a first release.

The updater queries GitHub without authentication, finds a newer version, verifies its signature and
replaces the executable after the user selects the update. It retains `Data`. Release assets must be
publicly readable for this updater to work; GitHub login in a browser does not authenticate the app.

The update signature is separate from Windows Authenticode signing; this workflow does not configure
an Authenticode certificate.

## Portable distribution

The app creates `Data` next to its executable. Optional PortableApps-style metadata can be supplied
under `App/AppInfo`; the app only refreshes the version when that metadata already exists. Neither
the build nor the release workflow creates a complete PortableApps package.

Close the app before moving or backing up its folder.

## Verify the Windows executable icon

After a normal `npm run build`, the postbuild step checks the icon resources
embedded in the resulting executable against `src-tauri/icons/icon.ico`. You can
repeat the data-only check with `npm run verify:icon`. This uses Node.js, does not
launch the app and fails if any icon frame is stale or missing. Cargo tracks icon
inputs through `build.rs`, so updating artwork rebuilds the Windows resource library.
The icon is still the Xpecs artwork copied as a placeholder; replace `icon-source.png` and run
`make-icon.ps1` before the first release.

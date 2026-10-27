# Xpace

Portable disk space analyzer for Windows, in the spirit of TreeSize. Shows which folders and files
take the space on a drive. One small exe: no installer, no administrator rights. 🇧🇷
[Português](#português) · 🇪🇸 [Español](#español)

Made by **[Skale Club](https://skale.club)**.

## Availability

**Status checked October 27, 2026:** source version 0.1.0. No GitHub Release or
publicly downloadable executable has been published. Build from source using the
[development guide](docs/DEVELOPMENT.md). Future release binaries belong in
[Releases](https://github.com/Skale-Club/xpace/releases).

The app can offer signed updates when a newer release contains both an executable and its signature.
Updates require internet access and are installed when you select the update action; your `Data`
folder is retained.

## Run it

Double-click `Xpace.exe`. It requires Microsoft Edge WebView2 Runtime. Settings (just the language
for now) live in `Data\xpace.json` next to the exe; CSV exports go to `Data\exports`. Keep the
executable in a writable folder.

Language: the selector at the bottom left (English, Português, Español).

## What it shows

| Page | Contents |
|---|---|
| Scan | Every drive with free and used space; scan a drive or choose any folder |
| Folders | Treemap of the selected folder, and a folder tree sorted by size with each item's share of its parent, file and folder counts and last change |
| Largest files | The 250 largest files of the scan, with their folders |
| File types | Space and file count per extension |

Click a folder (in the tree or in the treemap) to open it; the trail above the treemap leads back up.
Double-click a row, or use its arrow button, to show it in Explorer. **Export CSV** saves the current
list. **Rescan** reads the same place again.

## Deleting

Scanning only reads. Deleting happens only for what you select and confirm, in **Folders** and
**Largest files**:

- Tick the box on a row (or several), or use a row's trash button. A bar shows how many items and how
  much space are selected.
- **Move to Recycle Bin** is the default and can be undone from the Bin. If something is too big
  for the Bin, Windows asks before deleting it for good.
- **Delete permanently…** first reviews the selection: files, folders, total size and which apps
  have the files open. Then you choose to delete, to **close those apps and delete** (only apps that
  are safe to close), or to **delete at the next restart** (needs Xpace running as administrator).
  This uses the same reviewed force-delete engine as Xcare: every item is checked again just before
  it is deleted, and anything that changed since the review is kept.
- Protected: the scanned folder itself, drive roots, Windows, Program Files, ProgramData, your
  profile folders themselves (Desktop, Documents, Downloads… but not what is inside them), system
  files such as `pagefile.sys`, junctions and links, and hard-linked files. Only items inside the
  scanned folder can be deleted.
- Permanent deletion takes up to 100 selected items and 5,000 files and folders in total; the
  Recycle Bin has no such limit.
- After deleting, the tree, the treemap and the largest files update without a rescan, and the
  header shows the space freed. File types only drop deleted files until the next scan.

## How it counts

- Scanning only reads; see [Deleting](#deleting) for what you choose to remove.
- Sizes are file sizes, as Explorer's "Size" shows them, not the space allocated on disk. Compressed
  files and OneDrive files that are online-only count at their full size.
- Junctions and symbolic links to folders are listed but not followed, so nothing is counted twice
  and a link can't take the scan outside the chosen folder. OneDrive and other cloud folders are
  scanned.
- Folders Windows doesn't let a normal user read (for example `System Volume Information`) are
  marked and count as empty. Running Xpace as administrator reads more of them.
- Hard links count once per name, as in Explorer.

## Development

Tauri 2, Rust and plain HTML/CSS/JavaScript. See the [development and release
guide](docs/DEVELOPMENT.md) for prerequisites, build, tests and signed releases.

---

## Português

O Xpace mostra o que ocupa espaço no disco, no estilo do TreeSize. É um exe pequeno, sem instalação
e sem precisar de administrador. Ainda não há release publicada (27/10/2026); veja as
[instruções de compilação](docs/DEVELOPMENT.md).

- Abra o `Xpace.exe`, escolha um disco ou uma pasta e espere a análise.
- **Pastas**: treemap da pasta selecionada e árvore ordenada por tamanho. Clique para abrir uma pasta;
  clique duplo mostra no Explorer.
- **Maiores arquivos** e **Tipos de arquivo** mostram para onde o espaço foi. **Exportar CSV** salva a
  lista em `Data/exports`.
- Junções e links simbólicos não são seguidos, para não contar nada duas vezes.
- **Excluir**: marque as linhas (ou use a lixeira da linha) e escolha **Mover para a Lixeira** (dá
  para desfazer) ou **Excluir definitivamente…**, que antes mostra o que será apagado e quais programas
  estão usando os arquivos, e pode fechar esses programas ou excluir ao reiniciar. Pastas do sistema,
  de programas e as pastas do perfil em si são protegidas. A árvore se atualiza sem nova análise.

## Español

Xpace muestra qué ocupa espacio en el disco, al estilo de TreeSize. Es un exe pequeño, sin
instalación y sin necesidad de administrador. Aún no hay release publicada (27/10/2026); consulta las
[instrucciones de compilación](docs/DEVELOPMENT.md).

- Abre `Xpace.exe`, elige un disco o una carpeta y espera el análisis.
- **Carpetas**: treemap de la carpeta seleccionada y árbol ordenado por tamaño. Haz clic para abrir
  una carpeta; doble clic la muestra en el Explorador.
- **Archivos más grandes** y **Tipos de archivo** muestran adónde fue el espacio. **Exportar CSV**
  guarda la lista en `Data/exports`.
- Las uniones y los enlaces simbólicos no se siguen, para no contar nada dos veces.
- **Eliminar**: marca las filas (o usa la papelera de la fila) y elige **Mover a la Papelera** (se
  puede deshacer) o **Eliminar definitivamente…**, que antes muestra qué se borrará y qué programas usan
  los archivos, y puede cerrarlos o eliminar al reiniciar. Las carpetas del sistema, de programas y las
  carpetas del perfil en sí están protegidas. El árbol se actualiza sin volver a analizar.

## Skale Club apps

These Windows apps belong to the [Skale-Club organization](https://github.com/Skale-Club).
They share navy interfaces, blue accents, transparent product symbols, and English,
Portuguese and Spanish UI text. Each app has its own executable and portable Data folder.

| App | Purpose |
| --- | --- |
| [Xink](https://github.com/Skale-Club/xink) | Draw over the screen during presentations or recordings |
| [Xpecs](https://github.com/Skale-Club/xpecs) | Inspect hardware, live sensors and benchmark results |
| [Xcare](https://github.com/Skale-Club/xcare) | Clean selected files, manage startup programs and explicitly remove stubborn files |
| [Xnote](https://github.com/Skale-Club/xnote) | Transcribe meetings and turn notes into summaries and tasks |
| [Xpace](https://github.com/Skale-Club/xpace) | Analyze disk usage with a folder tree, treemap, largest files and file-type totals |

Repository access may be required depending on project visibility. Report problems through the
relevant repository, including app version, Windows version and reproduction steps. Remove
personal information from reports and transcripts before sharing.


---

© 2026 [Skale Club](https://skale.club)

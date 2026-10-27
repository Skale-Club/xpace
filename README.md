# Xpace

Portable disk space analyzer for Windows, in the spirit of TreeSize. Shows which folders and files
take the space on a drive. One small exe: no installer, no administrator rights. 🇧🇷
[Português](#português) · 🇪🇸 [Español](#español)

Made by **[Skale Club](https://skale.club)**.

## Availability

**Status checked October 26, 2026:** version 0.1.0 is in source control only; no GitHub repository
release or downloadable executable has been published. Use the [build instructions](docs/DEVELOPMENT.md)
until a release is available. Future binaries belong in
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

## How it counts

- Xpace only reads. It never changes, moves or deletes anything.
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
e sem precisar de administrador. Ainda não há release publicada (26/10/2026); veja as
[instruções de compilação](docs/DEVELOPMENT.md).

- Abra o `Xpace.exe`, escolha um disco ou uma pasta e espere a análise.
- **Pastas**: treemap da pasta selecionada e árvore ordenada por tamanho. Clique para abrir uma pasta;
  clique duplo mostra no Explorer.
- **Maiores arquivos** e **Tipos de arquivo** mostram para onde o espaço foi. **Exportar CSV** salva a
  lista em `Data/exports`.
- O Xpace só lê: nunca altera nem apaga nada. Junções e links simbólicos não são seguidos, para não
  contar nada duas vezes.

## Español

Xpace muestra qué ocupa espacio en el disco, al estilo de TreeSize. Es un exe pequeño, sin
instalación y sin necesidad de administrador. Aún no hay release publicada (26/10/2026); consulta las
[instrucciones de compilación](docs/DEVELOPMENT.md).

- Abre `Xpace.exe`, elige un disco o una carpeta y espera el análisis.
- **Carpetas**: treemap de la carpeta seleccionada y árbol ordenado por tamaño. Haz clic para abrir
  una carpeta; doble clic la muestra en el Explorador.
- **Archivos más grandes** y **Tipos de archivo** muestran adónde fue el espacio. **Exportar CSV**
  guarda la lista en `Data/exports`.
- Xpace solo lee: nunca cambia ni borra nada. Las uniones y los enlaces simbólicos no se siguen, para
  no contar nada dos veces.

---

© 2026 [Skale Club](https://skale.club)

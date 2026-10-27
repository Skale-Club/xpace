# Changelog

## Unreleased

- Xpace is now the one Skale app for looking after a PC: it includes Xcare (overview with health
  score, cleaner, startup programs, apps, optimize, Force Delete) and Xpecs (hardware information
  with a tab per part, live sensors, benchmarks, HTML report), next to Disk space. The menu groups
  the pages under PC care, Hardware and Tools. Settings stay in `Data\xpace.json`.
- Drivers page: devices with problems, driver updates from Windows Update installed as
  administrator after a restore point, the graphics driver with a link to its maker's app, every
  installed driver, and a backup of all manufacturer drivers. Drivers never come from other sites.
- `Xpace.exe --mcp` covers everything read-only: PC status, junk, startup items, apps, power plans,
  disk space, drivers, Windows Update driver updates, system information, sensors and benchmarks.
- Finding a folder to scan is easier: a search box that completes typed paths and finds folders by
  name on every local drive, your own folders (Desktop, Documents, Downloads...), recent scans,
  Windows' modern folder picker instead of the old tree dialog, and drag and drop from Explorer.
- Delete from Folders and Largest files: select rows, move them to the Recycle Bin, or delete them
  permanently after a review that lists the apps holding the files and can close them or delete at
  restart (Xcare's force-delete engine). Protected locations are refused; totals update without a
  rescan and the header shows the space freed.

## 0.1.0 — 2026-10-27

- Transparent product symbols without navy background tiles or decorative outer rims.
- Build inputs track the ICO/PNG artwork, and every npm build checks embedded Windows icons.
- English documentation now lists the complete five-app Skale Club family.
- Initial disk analyzer: folder tree/treemap, largest files, file-type totals, cancellation and CSV exports.

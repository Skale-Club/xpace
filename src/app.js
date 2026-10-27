'use strict';

// Xpace window: drive picker, scan progress, folder tree with a treemap,
// largest files and file types. The scan lives on the Rust side; folders are
// fetched one at a time as they are opened.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const svg = (body) => `<svg class="i" viewBox="0 0 24 24">${body}</svg>`;
const ICONS = {
  drives: '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
  folders: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  files: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
  types: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  reveal: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  usb: '<path d="M10 2h4v6h-4z"/><rect x="7" y="8" width="10" height="14" rx="2"/>',
  network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>',
};

const NAV = ['drives', '-', 'folders', 'files', 'types'];
/** Treemap colours for folders, largest first; files share one muted tone. */
const PALETTE = ['#5173d6', '#3dd68c', '#c792ea', '#f5c451', '#4fd1e8', '#ff8a4c', '#8fa9ee', '#ff5468'];

const $ = (id) => document.getElementById(id);
const pageEl = $('page');

let current = 'drives';
let drives = null;
let scanning = null;    // { path, files, folders, bytes, current } while a scan runs
let summary = null;     // the last finished scan
const listings = new Map(); // folder id -> listing from open_folder
const expanded = new Set([0]);
let selected = 0;       // folder shown in the treemap and the trail
let largest = null;
let types = null;

// ---------- formatting ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = (n) => n.toLocaleString(locale());

/** Binary units like Explorer. */
function bytes(b) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toLocaleString(locale(), { maximumFractionDigits: i === 0 ? 0 : b < 10 ? 2 : 1 })} ${units[i]}`;
}

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const pctText = (p) => `${p.toLocaleString(locale(), { maximumFractionDigits: p < 10 ? 1 : 0 })}%`;
const date = (s) => (s ? new Date(s * 1000).toLocaleDateString(locale()) : '');

function elapsed(ms) {
  const s = ms / 1000;
  if (s < 60) return `${s.toLocaleString(locale(), { maximumFractionDigits: 1 })} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

const join = (dir, name) => (dir.endsWith('\\') ? dir + name : `${dir}\\${name}`);

function meter(p, cls = '') {
  return `<div class="meter ${cls}"><i style="width:${Math.min(100, p).toFixed(2)}%"></i></div>`;
}

/** Errors from Rust are message keys when we know them. */
const errText = (e) => (I18N.en.ui[String(e)] ? t(String(e)) : String(e));

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- chrome ----------

function renderNav() {
  $('nav').innerHTML = NAV.map((id) => {
    if (id === '-') return '<div class="nav-sep"></div>';
    const off = id !== 'drives' && !summary;
    return `<button class="nav-item${id === current ? ' on' : ''}" data-page="${id}"${off ? ' disabled' : ''}>${svg(ICONS[id])}<span>${esc(t(id))}</span></button>`;
  }).join('');
}

function renderHeader() {
  const busy = scanning !== null;
  $('title').textContent = busy ? t('scanningTitle', { path: scanning.path }) : t(current === 'drives' ? 'drivesTitle' : current);
  $('subtitle').textContent = !busy && summary && current !== 'drives'
    ? `${summary.path} · ${t('scannedIn', { files: count(summary.files), folders: count(summary.folders), time: elapsed(summary.elapsedMs) })}`
    : '';
  const actions = [];
  if (!busy && summary && current !== 'drives') {
    actions.push(`<button class="btn" data-act="rescan">${esc(t('rescan'))}</button>`);
    actions.push(`<button class="btn" data-act="export">${esc(t('exportCsv'))}</button>`);
  }
  $('actions').innerHTML = actions.join('');
}

let pendingUpdate = null; // newer release on GitHub, from check_update

function renderUpdateBar() {
  const bar = $('update-bar');
  bar.hidden = !pendingUpdate;
  if (!pendingUpdate) return;
  bar.innerHTML = `<span>${esc(t('updateAvailable', { v: pendingUpdate.version }))}</span>` +
    `<button class="btn small primary" id="update-now">${esc(t('updateNow'))}</button>`;
  $('update-now').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = t('updating');
    try {
      await invoke('install_update'); // the app restarts on success
    } catch (err) {
      toast(t('updateFailed', { error: err }));
      e.target.disabled = false;
      e.target.textContent = t('updateNow');
    }
  };
}

function render() {
  renderNav();
  renderHeader();
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  if (scanning) return renderScanning();
  if (current !== 'drives' && !summary) current = 'drives';
  ({ drives: renderDrives, folders: renderFolders, files: renderFiles, types: renderTypes })[current]();
}

// ---------- drives ----------

function renderDrives() {
  if (!drives) {
    pageEl.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
    return;
  }
  const cards = drives.map((d) => {
    const used = d.total - d.free;
    const p = pct(used, d.total);
    const icon = d.kind === 'removable' ? ICONS.usb : d.kind === 'network' ? ICONS.network : ICONS.drives;
    const name = d.label ? `${d.label} (${d.path.slice(0, 2)})` : `${t(d.kind)} (${d.path.slice(0, 2)})`;
    return `<button class="drive" data-scan="${esc(d.path)}">
      <div class="drive-top"><div class="ico">${svg(icon)}</div><div><b>${esc(name)}</b><small>${esc(t(d.kind))}${d.fileSystem ? ` · ${esc(d.fileSystem)}` : ''}</small></div></div>
      ${meter(p, p > 95 ? 'full' : p > 85 ? 'warn' : '')}
      <div class="use"><span>${esc(t('free', { free: bytes(d.free), total: bytes(d.total) }))}</span><b>${esc(t('used', { pct: Math.round(p) }))}</b></div>
    </button>`;
  }).join('');
  pageEl.innerHTML = `<p class="note">${esc(t('drivesNote'))}</p>
    <div class="drives">${cards}</div>
    <div class="pick-row"><button class="btn primary" data-act="pick">${svg(ICONS.folder)}${esc(t('chooseFolder'))}</button></div>`;
}

// ---------- scanning ----------

function renderScanning() {
  const s = scanning;
  pageEl.innerHTML = `<div class="scanning">
    <div class="spinner"></div>
    <div class="counts">
      <div><b id="sc-files">${count(s.files)}</b><small>${esc(t('filesCount'))}</small></div>
      <div><b id="sc-folders">${count(s.folders)}</b><small>${esc(t('foldersCount'))}</small></div>
      <div><b id="sc-bytes">${bytes(s.bytes)}</b><small>${esc(t('sizeCount'))}</small></div>
    </div>
    <div class="current" id="sc-current"><bdi>${esc(s.current)}</bdi></div>
    <button class="btn" data-act="cancel">${esc(t('cancel'))}</button>
  </div>`;
}

function updateScanning() {
  if (!scanning || !$('sc-files')) return;
  $('sc-files').textContent = count(scanning.files);
  $('sc-folders').textContent = count(scanning.folders);
  $('sc-bytes').textContent = bytes(scanning.bytes);
  $('sc-current').firstChild.textContent = scanning.current;
}

async function startScan(path) {
  scanning = { path, files: 0, folders: 0, bytes: 0, current: path };
  render();
  try {
    const result = await invoke('start_scan', { path });
    if (scanning?.path !== path) return; // a newer scan took over
    summary = result;
    listings.clear();
    expanded.clear();
    expanded.add(0);
    selected = 0;
    largest = null;
    types = null;
    await loadFolder(0);
    current = 'folders';
  } catch (e) {
    toast(t('failed', { error: errText(e) }));
  }
  scanning = null;
  render();
}

// ---------- folders ----------

async function loadFolder(id) {
  if (!listings.has(id)) listings.set(id, await invoke('open_folder', { id }));
  return listings.get(id);
}

function folderIcon(f) {
  if (f.link) return `<span class="k-link" title="${esc(t('linkTip'))}">${svg(ICONS.link)}</span>`;
  if (f.denied) return `<span class="k-denied" title="${esc(t('deniedTip'))}">${svg(ICONS.lock)}</span>`;
  return `<span class="k-folder">${svg(ICONS.folder)}</span>`;
}

function folderRow(f, parentSize, path, depth) {
  const open = expanded.has(f.id);
  const canOpen = !f.link && !f.denied && (f.files > 0 || f.folders > 0);
  const tag = f.link ? `<span class="tag">${esc(t('link'))}</span>` : f.denied ? `<span class="tag">${esc(t('denied'))}</span>` : '';
  const p = pct(f.size, parentSize);
  return `<tr class="row${f.id === selected ? ' sel' : ''}" data-id="${f.id}" data-path="${esc(path)}">
    <td><div class="name" style="padding-left:${depth * 18}px">
      <button class="tw${open ? ' open' : ''}${canOpen ? '' : ' none'}" data-toggle="${f.id}">${svg(ICONS.chevron)}</button>
      ${folderIcon(f)}<span class="label" title="${esc(path)}">${esc(f.name)}</span>${tag}
      <button class="reveal" data-open="${esc(path)}" title="${esc(t('openFolder'))}">${svg(ICONS.reveal)}</button>
    </div></td>
    <td>${bytes(f.size)}</td>
    <td class="bar">${meter(p)}</td>
    <td class="muted">${pctText(p)}</td>
    <td class="muted">${count(f.files)}</td>
    <td class="muted">${count(f.folders)}</td>
    <td class="muted">${date(f.modified)}</td>
  </tr>`;
}

function fileRow(file, parentSize, path, depth) {
  const p = pct(file.size, parentSize);
  return `<tr class="row" data-path="${esc(path)}">
    <td><div class="name" style="padding-left:${depth * 18}px">
      <span class="tw none"></span><span class="k-file">${svg(ICONS.file)}</span><span class="label" title="${esc(path)}">${esc(file.name)}</span>
      <button class="reveal" data-reveal="${esc(path)}" title="${esc(t('reveal'))}">${svg(ICONS.reveal)}</button>
    </div></td>
    <td>${bytes(file.size)}</td>
    <td class="bar">${meter(p)}</td>
    <td class="muted">${pctText(p)}</td>
    <td></td><td></td>
    <td class="muted">${date(file.modified)}</td>
  </tr>`;
}

/** Rows of an expanded folder, its open subfolders nested below each one. */
function childRows(id, depth) {
  const l = listings.get(id);
  if (!l) return '';
  let out = '';
  for (const f of l.folders) {
    const path = join(l.path, f.name);
    out += folderRow(f, l.folder.size, path, depth);
    if (expanded.has(f.id)) out += childRows(f.id, depth + 1);
  }
  for (const file of l.files) out += fileRow(file, l.folder.size, join(l.path, file.name), depth);
  if (l.moreFiles) {
    out += `<tr><td class="muted"><div class="name" style="padding-left:${depth * 18 + 24}px">${esc(t('moreFiles', { n: count(l.moreFiles) }))}</div></td>
      <td>${bytes(l.moreBytes)}</td><td></td><td class="muted">${pctText(pct(l.moreBytes, l.folder.size))}</td><td></td><td></td><td></td></tr>`;
  }
  return out;
}

function renderFolders() {
  const root = listings.get(0);
  const sel = listings.get(selected) || root;
  if (!root) {
    pageEl.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
    return;
  }
  const notes = [];
  if (summary.cancelled) notes.push(t('cancelled'));
  if (summary.errors) notes.push(t('unreadable', { n: count(summary.errors) }));
  const scroll = pageEl.scrollTop;
  pageEl.innerHTML = `${notes.map((n) => `<div class="warn-note">${esc(n)}</div>`).join('')}
    <div class="trail" id="trail"></div>
    <div class="treemap" id="treemap"></div>
    <table class="grid">
      <colgroup><col><col style="width:96px"><col style="width:100px"><col style="width:96px"><col style="width:90px"><col style="width:76px"><col style="width:96px"></colgroup>
      <thead><tr><th>${esc(t('name'))}</th><th>${esc(t('size'))}</th><th></th><th>${esc(t('share'))}</th><th>${esc(t('filesCol'))}</th><th>${esc(t('foldersCol'))}</th><th>${esc(t('modified'))}</th></tr></thead>
      <tbody>${folderRow(root.folder, root.folder.size, root.path, 0)}${expanded.has(0) ? childRows(0, 1) : ''}</tbody>
    </table>`;
  pageEl.scrollTop = scroll;
  paintSelection(sel);
}

/** The trail, the treemap and the highlighted row for the selected folder. */
function paintSelection(sel) {
  $('trail').innerHTML = sel.trail.map((f, i) => `${i ? '<span>›</span>' : ''}<button data-select="${f.id}">${esc(f.name)}</button>`).join('');
  for (const row of pageEl.querySelectorAll('tr.sel')) row.classList.remove('sel');
  pageEl.querySelector(`tr[data-id="${sel.folder.id}"]`)?.classList.add('sel');
  drawTreemap(sel);
}

/** Squarified treemap (Bruls et al.): rows of blocks kept close to square. */
function squarify(items, x, y, w, h) {
  const out = [];
  const worst = (row, side) => {
    const sum = row.reduce((a, r) => a + r.area, 0);
    const max = row[0].area, min = row[row.length - 1].area;
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const place = (row) => {
    const sum = row.reduce((a, r) => a + r.area, 0);
    if (w >= h) {
      const cw = sum / h;
      let cy = y;
      for (const r of row) { out.push({ ...r, x, y: cy, w: cw, h: r.area / cw }); cy += r.area / cw; }
      x += cw; w -= cw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const r of row) { out.push({ ...r, x: cx, y, w: r.area / rh, h: rh }); cx += r.area / rh; }
      y += rh; h -= rh;
    }
  };
  let row = [];
  for (const item of items) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, item], side) <= worst(row, side)) {
      row.push(item);
    } else {
      place(row);
      row = [item];
    }
  }
  if (row.length) place(row);
  return out;
}

function drawTreemap(l) {
  const box = $('treemap');
  const W = box.clientWidth, H = box.clientHeight;
  const total = l.folder.size;
  if (!total || !W) {
    box.innerHTML = `<div class="tm-empty">${esc(t('emptyFolder'))}</div>`;
    return;
  }
  let items = [
    ...l.folders.filter((f) => f.size > 0).map((f, i) => ({ kind: 'folder', id: f.id, name: f.name, size: f.size, color: PALETTE[i % PALETTE.length] })),
    ...l.files.filter((f) => f.size > 0).map((f) => ({ kind: 'file', name: f.name, size: f.size, path: join(l.path, f.name) })),
  ].sort((a, b) => b.size - a.size);
  // Blocks too small to read are merged into one.
  const minSize = total * 0.004;
  const small = items.filter((i) => i.size < minSize);
  items = items.filter((i) => i.size >= minSize);
  const restSize = small.reduce((a, i) => a + i.size, 0) + l.moreBytes;
  if (restSize > 0) items.push({ kind: 'rest', name: `+${count(small.length + l.moreFiles)}`, size: restSize });
  const scale = (W * H) / items.reduce((a, i) => a + i.size, 0);
  const blocks = squarify(items.map((i) => ({ ...i, area: i.size * scale })), 0, 0, W, H);
  box.innerHTML = blocks.map((b) => {
    const style = `left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;${b.kind === 'folder' ? `background:${b.color}` : b.kind === 'file' ? 'background:#2a3958' : ''}`;
    const label = b.w > 46 && b.h > 30 ? `<b>${esc(b.name)}</b><small>${bytes(b.size)} · ${pctText(pct(b.size, total))}</small>` : '';
    const data = b.kind === 'folder' ? ` data-select="${b.id}"` : b.kind === 'file' ? ` data-path="${esc(b.path)}"` : '';
    return `<div class="tm ${b.kind}" style="${style}"${data} title="${esc(`${b.name} · ${bytes(b.size)}`)}">${label}</div>`;
  }).join('');
}

/** Opens a folder in the treemap and unfolds the tree down to it. */
async function selectFolder(id) {
  const l = await loadFolder(id);
  // Every folder above it must be open for its row to show.
  let unfolded = false;
  for (const f of l.trail.slice(0, -1)) {
    if (!expanded.has(f.id)) {
      expanded.add(f.id);
      unfolded = true;
    }
    await loadFolder(f.id);
  }
  selected = id;
  if (current !== 'folders') return;
  // Redraw only when rows appear, so a double-click still lands on its row.
  if (unfolded || !$('trail')) renderFolders();
  else paintSelection(l);
  pageEl.querySelector(`tr[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
}

async function toggleFolder(id) {
  if (expanded.has(id)) {
    expanded.delete(id);
  } else {
    await loadFolder(id);
    expanded.add(id);
  }
  renderFolders();
}

// ---------- largest files and file types ----------

async function renderFiles() {
  if (!largest) {
    pageEl.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
    largest = await invoke('largest_files');
    if (current !== 'files') return;
  }
  const rows = largest.map((f) => {
    const name = f.path.slice(f.path.lastIndexOf('\\') + 1);
    const dir = f.path.slice(0, f.path.lastIndexOf('\\'));
    return `<tr class="row" data-path="${esc(f.path)}">
      <td><div class="name"><span class="k-file">${svg(ICONS.file)}</span><span class="label" title="${esc(f.path)}">${esc(name)}</span>
        <button class="reveal" data-reveal="${esc(f.path)}" title="${esc(t('reveal'))}">${svg(ICONS.reveal)}</button></div></td>
      <td>${bytes(f.size)}</td>
      <td class="muted path-cell" title="${esc(dir)}"><bdi>${esc(dir)}</bdi></td>
      <td class="muted">${date(f.modified)}</td>
    </tr>`;
  }).join('');
  pageEl.innerHTML = `<table class="grid">
    <colgroup><col style="width:34%"><col style="width:96px"><col><col style="width:96px"></colgroup>
    <thead><tr><th>${esc(t('name'))}</th><th>${esc(t('size'))}</th><th class="left">${esc(t('path'))}</th><th>${esc(t('modified'))}</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

async function renderTypes() {
  if (!types) {
    pageEl.innerHTML = `<div class="loading">${esc(t('loading'))}</div>`;
    types = await invoke('file_types');
    if (current !== 'types') return;
  }
  const total = summary.size;
  const top = types[0]?.size || 1;
  const rows = types.slice(0, 300).map((x) => `<tr class="row">
      <td><div class="name"><span class="k-file">${svg(ICONS.file)}</span><span class="label">${esc(x.ext || t('noExt'))}</span></div></td>
      <td>${bytes(x.size)}</td>
      <td class="bar">${meter(pct(x.size, top))}</td>
      <td class="muted">${pctText(pct(x.size, total))}</td>
      <td class="muted">${count(x.files)}</td>
    </tr>`).join('');
  pageEl.innerHTML = `<div class="stats">
      <div class="stat"><small>${esc(t('sizeCount'))}</small><b>${bytes(summary.size)}</b></div>
      <div class="stat"><small>${esc(t('filesCount'))}</small><b>${count(summary.files)}</b></div>
      <div class="stat"><small>${esc(t('foldersCount'))}</small><b>${count(summary.folders)}</b></div>
      <div class="stat"><small>${esc(t('types'))}</small><b>${count(types.length)}</b></div>
    </div>
    <table class="grid">
    <colgroup><col><col style="width:96px"><col style="width:180px"><col style="width:90px"><col style="width:96px"></colgroup>
    <thead><tr><th>${esc(t('type'))}</th><th>${esc(t('size'))}</th><th></th><th>${esc(t('ofTotal'))}</th><th>${esc(t('filesCol'))}</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

// ---------- CSV export ----------

function csv(rows) {
  const sep = language === 'en' ? ',' : ';';
  const cell = (v) => (typeof v === 'number' ? String(v) : `"${String(v ?? '').replace(/"/g, '""')}"`);
  return rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}

async function exportCsv() {
  let rows;
  if (current === 'files') {
    rows = [[t('path'), t('size'), t('modified')], ...largest.map((f) => [f.path, f.size, date(f.modified)])];
  } else if (current === 'types') {
    rows = [[t('type'), t('size'), t('filesCol')], ...types.map((x) => [x.ext || t('noExt'), x.size, x.files])];
  } else {
    const l = listings.get(selected);
    rows = [[t('path'), t('size'), t('filesCol'), t('foldersCol'), t('modified')],
      ...l.folders.map((f) => [join(l.path, f.name), f.size, f.files, f.folders, date(f.modified)]),
      ...l.files.map((f) => [join(l.path, f.name), f.size, 1, 0, date(f.modified)])];
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  try {
    const path = await invoke('save_export', { name: `xpace-${current}-${stamp}`, csv: csv(rows) });
    toast(t('saved', { path }));
  } catch (e) {
    toast(t('failed', { error: e }));
  }
}

// ---------- events ----------

async function reveal(path, open) {
  try {
    await invoke('reveal', { path, open });
  } catch (e) {
    toast(errText(e));
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-page],[data-act],[data-scan],[data-toggle],[data-select],[data-reveal],[data-open],tr[data-id]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.page) {
    current = d.page;
    if (current === 'drives') invoke('list_drives').then((list) => { drives = list; if (current === 'drives' && !scanning) render(); });
    render();
  } else if (d.scan) {
    startScan(d.scan);
  } else if (d.toggle) {
    toggleFolder(Number(d.toggle));
  } else if (d.select) {
    selectFolder(Number(d.select));
  } else if (d.reveal) {
    reveal(d.reveal, false);
  } else if (d.open) {
    reveal(d.open, true);
  } else if (d.id) {
    selectFolder(Number(d.id));
  } else if (d.act === 'pick') {
    const path = await invoke('pick_folder').catch((err) => { toast(errText(err)); return null; });
    if (path) startScan(path);
  } else if (d.act === 'cancel') {
    invoke('cancel_scan');
  } else if (d.act === 'rescan') {
    startScan(summary.path);
  } else if (d.act === 'export') {
    exportCsv();
  }
});

document.addEventListener('dblclick', (e) => {
  const row = e.target.closest('tr[data-path]');
  if (!row || e.target.closest('button')) return;
  reveal(row.dataset.path, row.dataset.id !== undefined);
});

listen('progress', ({ payload }) => {
  if (!scanning) return;
  Object.assign(scanning, payload);
  updateScanning();
});

$('skale').addEventListener('click', () => invoke('open_site'));

$('lang').addEventListener('change', (e) => {
  setLanguage(e.target.value);
  invoke('set_language', { language });
  render();
  renderUpdateBar();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (current === 'folders' && !scanning && listings.has(selected)) drawTreemap(listings.get(selected)); }, 120);
});

(async () => {
  try {
    setLanguage((await invoke('get_settings')).language);
  } catch { /* keep English */ }
  $('lang').value = language;
  window.__TAURI__.app.getVersion().then((v) => { document.querySelector('.ver').textContent = `v${v}`; });
  render();
  drives = await invoke('list_drives');
  if (current === 'drives' && !scanning) render();
  invoke('check_update').then((u) => { pendingUpdate = u; renderUpdateBar(); });
})();

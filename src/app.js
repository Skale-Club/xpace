'use strict';

// Xpace window: the menu, the header and language; updates.js shows updates.
// The pages live in care.js, space.js, drivers.js, hardware.js and force-delete.js.

const NAV = [
  { group: 'groupCare', pages: ['overview', 'cleaner', 'space', 'startup', 'apps', 'drivers', 'optimize'] },
  { group: 'groupHardware', pages: ['summary', 'sensors', 'bench'] },
  { group: 'groupTools', pages: ['forceDelete'] },
];

// The summary's menu item reads "Hardware"; its page and tabs say "Summary".
const navLabel = (id) => t(id === 'summary' ? 'hardware' : id);

function paintAdmin() {
  const badge = $('admin-badge');
  badge.textContent = admin ? `● ${t('admin')}` : t('notAdmin');
  badge.classList.toggle('on', admin);
}

function renderNav() {
  updates.render();
  const on = PAGES[current]?.nav || current;
  $('nav').innerHTML = NAV.map(({ group, pages }) =>
    `<div class="nav-group">${esc(t(group))}</div>` +
    pages.map((id) => `<button class="nav-item${id === on ? ' on' : ''}" data-page="${id}">${svg(ICONS[id])}<span>${esc(navLabel(id))}</span></button>`).join('')).join('');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  paintAdmin();
}

function render() {
  const page = PAGES[current];
  $('title').textContent = t(current);
  $('actions').innerHTML = page.actions?.() || '';
  pageEl.className = page.cls || '';
  $('selbar').hidden = true;
  page.render();
}

function go(page) {
  if (!PAGES[page]) return;
  current = page;
  renderNav();
  pageEl.scrollTop = 0;
  PAGES[page].show?.();
  render();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    pageEl.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  }
}

$('nav').addEventListener('click', (e) => {
  const item = e.target.closest('[data-page]');
  if (item) go(item.dataset.page);
});

$('skale').addEventListener('click', () => invoke('open_site'));

$('lang').addEventListener('change', (e) => {
  setLanguage(e.target.value);
  invoke('set_language', { language });
  renderNav();
  render();
});

(async () => {
  try {
    setLanguage((await invoke('get_settings')).language);
  } catch (_) { /* English */ }
  $('lang').value = language;
  admin = await invoke('is_admin').catch(() => false);
  renderNav();
  await startCare();
})();

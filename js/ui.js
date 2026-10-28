// Shared page shell: theme, menu, sign-in gate, sheets, toasts.
import * as store from './store.js';
import { h, icon, EASE, reducedMotion } from './dom.js';

/* ---------- theme ---------- */

const root = document.documentElement;
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const effectiveTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');

function setTheme(t) {
  if (t) root.dataset.theme = t;
  else delete root.dataset.theme;
  try { t ? localStorage.setItem('theme', t) : localStorage.removeItem('theme'); } catch {}
  syncThemeIcon();
}

function syncThemeIcon() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  btn.replaceChildren(icon(effectiveTheme() === 'dark' ? 'sun' : 'moon'));
  btn.setAttribute('aria-label', `Switch to ${effectiveTheme() === 'dark' ? 'light' : 'dark'} theme`);
}

function toggleTheme() {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  const swap = () => setTheme(next === (systemDark.matches ? 'dark' : 'light') ? null : next);
  if (!document.startViewTransition || reducedMotion()) return swap();
  root.classList.add('vt-theme');
  document.startViewTransition(swap).finished.finally(() => root.classList.remove('vt-theme'));
}

/* ---------- toasts ---------- */

export function toast(msg) {
  let host = document.querySelector('.toasts');
  if (!host) document.body.append((host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })));
  const el = h('div', { class: 'toast' }, msg);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 400);
  }, 2600);
}

/** Run a store write, surfacing failures instead of swallowing them. */
export async function save(promise, okMsg) {
  try {
    await promise;
    if (okMsg) toast(okMsg);
  } catch (err) {
    console.error(err);
    toast(`Couldn't save: ${err.message || err}`);
  }
}

/* ---------- sheets (bottom sheet on phone, side drawer on desktop) ---------- */

export function openSheet({ title, subtitle, content, footer }) {
  const prevFocus = document.activeElement;
  const body = h('div', { class: 'sheet-body' }, content);
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close'));
  const head = h('header', { class: 'sheet-head' },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-titles' },
      h('h2', { class: 'sheet-title' }, title),
      subtitle && h('p', { class: 'sheet-sub' }, subtitle)),
    closeBtn);
  const panel = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' },
    head, body, footer && h('footer', { class: 'sheet-foot' }, footer));
  const layer = h('div', { class: 'sheet-layer' }, h('div', { class: 'backdrop', onclick: () => close() }), panel);

  const onKey = (e) => { if (e.key === 'Escape' && layer === topLayer()) close(); };
  document.addEventListener('keydown', onKey);
  document.body.append(layer);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('open')));
  setTimeout(() => (panel.querySelector('[autofocus]') || panel).focus({ preventScroll: true }), 60);

  // drag the header down to dismiss (touch)
  let startY = null;
  let dy = 0;
  head.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || e.target.closest('button')) return;
    startY = e.clientY;
    panel.style.transition = 'none';
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener('pointermove', (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = () => {
    if (startY == null) return;
    startY = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) close();
    dy = 0;
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    layer.classList.remove('open');
    layer.classList.add('closing');
    const done = () => {
      layer.remove();
      if (!document.querySelector('.sheet-layer')) document.body.classList.remove('sheet-open');
      prevFocus?.focus?.({ preventScroll: true });
    };
    if (reducedMotion()) done();
    else setTimeout(done, 320);
  }
  return { close, body, panel };
}

const topLayer = () => [...document.querySelectorAll('.sheet-layer')].pop();

/* ---------- menu ---------- */

function openMenu(anchor) {
  if (document.querySelector('.menu')) return;
  const st = store.status();
  const close = () => {
    menu.classList.remove('open');
    document.removeEventListener('pointerdown', outside, true);
    setTimeout(() => menu.remove(), 200);
  };
  const outside = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
  const item = (label, fn) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { close(); fn(); } }, label);
  const semName = store.getState().semester?.name;
  const menu = h('div', { class: 'menu', role: 'menu' },
    h('p', { class: 'menu-note' },
      semName && h('strong', {}, semName), semName && h('br'),
      st.mode === 'local' ? 'Local preview · saved in this browser only' : `Synced · ${st.user?.email ?? ''}`),
    item('Semesters…', openSemesters),
    item('Import semester…', pickImport),
    item('Export backup', exportBackup),
    root.dataset.theme && item('Use system theme', () => setTheme(null)),
    st.mode === 'cloud' && st.user && item('Sign out', () => store.signOut()),
  );
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + 8}px`;
  menu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  requestAnimationFrame(() => menu.classList.add('open'));
  document.addEventListener('pointerdown', outside, true);
}

/** Ask before doing something destructive. Resolves true on confirm. */
export function confirmSheet({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (!answered) { answered = true; resolve(v); } sheet.close(); };
    const sheet = openSheet({
      title,
      content: h('div', { class: 'stack' },
        h('p', { class: 'muted' }, message),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-primary', onclick: () => answer(true) }, confirmLabel),
          h('button', { class: 'btn btn-ghost', onclick: () => answer(false) }, 'Cancel'))),
    });
    // closing via ✕ / backdrop / Esc counts as cancel
    new MutationObserver((_, obs) => {
      if (!sheet.panel.isConnected) { obs.disconnect(); if (!answered) resolve(false); }
    }).observe(document.body, { childList: true });
  });
}

export function pickImport() {
  const input = h('input', { type: 'file', accept: 'application/json,.json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const info = store.describeImport(json);
      if (info.kind === 'backup') {
        const ok = await confirmSheet({
          title: 'Restore backup?',
          message: `This restores ${info.count} semester${info.count === 1 ? '' : 's'} and your events. Semesters already in the app with the same name are replaced by the backup's copy.`,
          confirmLabel: 'Restore',
        });
        if (!ok) return;
        await store.restoreBackup(json);
        toast('Backup restored');
        return;
      }
      if (info.exists) {
        const ok = await confirmSheet({
          title: `Replace ${info.name}?`,
          message: 'You already have this semester. Importing again replaces its classes, agendas and deadlines — including your notes and ticked-off deadlines for it. Your other semesters and personal events are not touched.',
          confirmLabel: 'Replace semester',
        });
        if (!ok) return;
      }
      await store.importSemester(json);
      toast(`${info.name} imported`);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Import failed');
    }
  });
  input.click();
}

async function exportBackup() {
  try {
    const blob = new Blob([await store.exportData()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `schedule-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) {
    console.error(err);
    toast(`Export failed: ${err.message || err}`);
  }
}

/* ---------- semesters sheet ---------- */

const fmtDay = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function openSemesters() {
  const list = h('ul', { class: 'rows' });
  const sheet = openSheet({
    title: 'Semesters',
    subtitle: 'Switch between semesters or add a new one. Your personal events show in every semester.',
    content: h('div', { class: 'stack' },
      list,
      h('button', { class: 'btn btn-ghost add-btn', onclick: () => { sheet.close(); pickImport(); } }, icon('plus', 16), 'Import new semester…')),
  });

  const draw = () => {
    const active = store.status().semesterId;
    const sems = store.listSemesters();
    list.replaceChildren(...sems.map((s) => {
      const isActive = s.id === active;
      const del = h('button', { class: 'btn btn-ghost btn-sm danger' }, 'Delete');
      del.addEventListener('click', async () => {
        const ok = await confirmSheet({
          title: `Delete ${s.name || s.id}?`,
          message: 'This permanently removes its classes, agendas, deadlines and notes from every device. Export a backup first if you might want it later.',
          confirmLabel: 'Delete semester',
        });
        if (!ok) return;
        await save(store.deleteSemester(s.id), 'Semester deleted');
      });
      return h('li', { class: `row row-sem${isActive ? ' active' : ''}` },
        h('div', { class: 'row-main' },
          h('span', { class: 'row-title' }, s.name || s.id, isActive && h('span', { class: 'pill pill-inline' }, 'Current')),
          h('span', { class: 'row-sub' }, `${fmtDay(new Date(`${s.start}T00:00`))} – ${fmtDay(s.end)} · ${s.weeks} weeks`)),
        h('div', { class: 'btn-row' },
          !isActive && h('button', {
            class: 'btn btn-primary btn-sm',
            onclick: () => { save(store.setActiveSemester(s.id), `Switched to ${s.name || s.id}`); },
          }, 'Switch'),
          del));
    }));
    if (!sems.length) list.append(h('p', { class: 'muted quiet' }, 'No semesters yet.'));
  };
  draw();
  const unsub = store.subscribe(() => { if (!sheet.panel.isConnected) unsub(); else draw(); });
}

/* ---------- gate + empty states ---------- */

function renderGate(st) {
  let gate = document.querySelector('.gate');
  if (st.phase !== 'signed-out') {
    if (gate) {
      gate.classList.remove('open');
      setTimeout(() => gate.remove(), 300);
    }
    return;
  }
  if (gate) return;
  gate = h('div', { class: 'gate' },
    h('div', { class: 'gate-card' },
      h('h1', {}, 'Schedule'),
      h('p', { class: 'muted' }, 'Sign in to sync your timetable across devices.'),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => store.signIn().catch((e) => toast(e.message || 'Sign-in failed')),
      }, 'Continue with Google')));
  document.body.append(gate);
  requestAnimationFrame(() => gate.classList.add('open'));
}

export function emptyState() {
  return h('div', { class: 'empty' },
    h('h2', {}, 'No schedule yet'),
    h('p', { class: 'muted' }, 'Import a semester file (or a backup) to get started. You only need to do this once per semester — every signed-in device syncs. See the README for how to make the file.'),
    h('button', { class: 'btn btn-primary', onclick: pickImport }, 'Import semester…'));
}

export const loadingState = () => h('div', { class: 'empty' }, h('div', { class: 'spinner', 'aria-label': 'Loading' }));

/* ---------- search + offline ---------- */

// search.js imports editor.js, which imports this file, so load it lazily
const openSearch = () => import('./search.js').then((m) => m.openSearch());

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline support unavailable:', err));
}

/* ---------- boot ---------- */

/**
 * Wire the shell and call render(data, status) whenever data changes.
 * Pages receive data only once it is usable; otherwise ui shows loading/empty states.
 */
export function boot(render) {
  syncThemeIcon();
  systemDark.addEventListener('change', syncThemeIcon);
  document.getElementById('theme-btn')?.addEventListener('click', toggleTheme);
  const menuBtn = document.getElementById('menu-btn');
  menuBtn?.addEventListener('click', () => openMenu(menuBtn));
  document.getElementById('search-btn')?.addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openSearch();
    }
  });
  registerServiceWorker();

  const main = document.getElementById('app');
  let shown = null;
  store.subscribe((data, st) => {
    renderGate(st);
    if (data.semester) {
      shown = 'data';
      render(data, st);
    } else if (st.phase === 'ready' && shown !== 'empty') {
      shown = 'empty';
      main.replaceChildren(emptyState());
    } else if (st.phase === 'loading' && !shown) {
      shown = 'loading';
      main.replaceChildren(loadingState());
    }
  });
  store.start().catch((err) => {
    console.error(err);
    toast('Could not connect. Showing cached data.');
  });
}

export { EASE };

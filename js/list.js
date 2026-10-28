// List: chronological feed of the semester, grouped by week and day.
import { boot } from './ui.js';
import { h, icon, fmtDate, stagger } from './dom.js';
import { iso, parseISO, addDays, weekStart, weekNumber, todayISO, datesBetween, dayItems } from './model.js';
import { itemRow, weekLabel } from './views.js';
import { openItem, openAddMenu } from './editor.js';

const main = document.getElementById('app');
const FILTERS = [['all', 'All'], ['class', 'Classes'], ['task', 'Deadlines'], ['event', 'Events']];

let data = null;
const requested = new URLSearchParams(location.search).get('show'); // e.g. list.html?show=task
let filter = FILTERS.some(([k]) => k === requested) ? requested : 'all';
let moduleFilter = '';
let showDone = false;
let rendered = false;
const expanded = new Set();

function range() {
  const sem = data.semester;
  let from = sem.start;
  let to = iso(addDays(weekStart(sem, sem.weeks), 6));
  for (const e of Object.values(data.events)) {
    if (e.date < from) from = e.date;
    if (e.date > to) to = e.date;
  }
  for (const t of Object.values(data.tasks)) {
    const d = t.due.slice(0, 10);
    if (d < from) from = d;
    if (d > to) to = d;
  }
  return [from, to];
}

function itemsFor(dateISO) {
  const { classes, tasks, events } = dayItems(data, dateISO);
  const keep = (it) =>
    (filter === 'all' || filter === it.kind) &&
    (!moduleFilter || it.moduleCode === moduleFilter) &&
    (showDone || it.kind !== 'task' || !it.done);
  // deadlines first, then classes/events by time
  return [...tasks, ...[...classes, ...events].sort((a, b) => (a.start || '').localeCompare(b.start || ''))].filter(keep);
}

function controls() {
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Show' },
    FILTERS.map(([key, label]) => h('button', {
      class: `chip-btn${filter === key ? ' on' : ''}`,
      role: 'radio',
      'aria-checked': String(filter === key),
      onclick: () => { filter = key; render(true); },
    }, label)));
  const mod = h('select', {
    class: 'input input-sm',
    'aria-label': 'Module',
    onchange: (e) => { moduleFilter = e.target.value; render(true); },
  },
    h('option', { value: '' }, 'All modules'),
    Object.values(data.modules).map((m) => h('option', { value: m.code, selected: m.code === moduleFilter }, m.code)));
  const done = h('label', { class: 'switch switch-sm' },
    h('input', { type: 'checkbox', checked: showDone, onchange: (e) => { showDone = e.target.checked; render(true); } }),
    h('span', {}, 'Show done'));
  return h('div', { class: 'list-controls' }, chips, h('div', { class: 'list-controls-right' }, mod, done));
}

function render(animate = false) {
  if (!data) return;
  const scrollY = window.scrollY;
  const today = todayISO();
  const [from, to] = range();
  const feed = h('div', { class: 'feed' });
  let currentWeek = undefined;
  let weekEl = null;
  let todayAnchor = null;

  for (const d of datesBetween(from, to)) {
    const items = itemsFor(d);
    const isToday = d === today;
    if (!items.length && !isToday) continue;
    const wk = weekNumber(data.semester, parseISO(d));
    if (wk !== currentWeek || !weekEl) {
      currentWeek = wk;
      const mon = wk ? weekStart(data.semester, wk) : null;
      const label = wk ? weekLabel(data, wk) : '';
      weekEl = h('section', { class: 'week' },
        h('h2', { class: 'week-head' },
          wk ? `Week ${wk}` : 'Outside semester',
          mon && h('span', { class: 'muted' }, ` · ${fmtDate(iso(mon), { day: 'numeric', month: 'short' })} – ${fmtDate(iso(addDays(mon, 6)), { day: 'numeric', month: 'short' })}`),
          label && h('span', { class: 'pill pill-inline' }, label)));
      feed.append(weekEl);
    }
    const past = d < today;
    const group = h('div', { class: `day-group${isToday ? ' is-today' : ''}${past ? ' past' : ''}`, id: isToday ? 'today' : null },
      h('div', { class: 'day-label' },
        h('span', { class: 'dow' }, fmtDate(d, { weekday: 'short' })),
        h('strong', {}, parseISO(d).getDate()),
        h('span', { class: 'mon' }, fmtDate(d, { month: 'short' })),
        isToday && h('span', { class: 'today-tag' }, 'Today')),
      items.length
        ? h('ul', { class: 'rows' }, items.map((it) => {
          const row = itemRow(data, it, { onOpen: openItem, expanded: expanded.has(it.id) });
          row.querySelector('.row-main[aria-expanded]')?.addEventListener('click', () => {
            if (expanded.has(it.id)) expanded.delete(it.id);
            else expanded.add(it.id);
          });
          return row;
        }))
        : h('p', { class: 'muted quiet' }, 'Nothing today.'));
    if (isToday) todayAnchor = group;
    weekEl.append(group);
  }

  if (!feed.children.length) feed.append(h('p', { class: 'muted quiet center' }, 'Nothing matches these filters.'));

  const fab = h('button', { class: 'fab', 'aria-label': 'Add', onclick: () => openAddMenu(today) }, icon('plus', 22));
  const jump = h('button', { class: 'btn btn-ghost btn-sm', onclick: () => main.querySelector('#today, .day-group:not(.past)')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Today');

  main.replaceChildren(
    h('section', { class: 'list' },
      h('div', { class: 'toolbar' },
        h('div', { class: 'titles' },
          data.semester.name && h('p', { class: 'eyebrow page-eyebrow' }, data.semester.name),
          h('h1', { class: 'page-title' }, 'List')),
        jump),
      controls(),
      feed),
    fab);

  if (!rendered) {
    rendered = true;
    const target = todayAnchor || main.querySelector('.day-group:not(.past)');
    target?.scrollIntoView({ block: 'start' });
  } else if (animate) {
    stagger(feed.querySelectorAll('.day-group'), 24, 10);
  } else {
    window.scrollTo(0, scrollY);
  }
}

boot((d) => {
  if (data && data.semesterId !== d.semesterId) {
    rendered = false; // scroll to today again in the new semester
    moduleFilter = '';
    expanded.clear();
  }
  data = d;
  render();
});

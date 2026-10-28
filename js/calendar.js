// Calendar: month grid; pick a day to see its classes, agendas, deadlines and events.
import { boot } from './ui.js';
import { h, icon, enter, stagger } from './dom.js';
import { iso, parseISO, addDays, startOfWeek, todayISO, weekNumber, weekKind, dayItems } from './model.js';
import { dayContent, dayTitle } from './views.js';
import { openItem, openEventForm, openDaySheet } from './editor.js';

const main = document.getElementById('app');
const wide = matchMedia('(min-width: 960px)');

let data = null;
let month = null; // Date at the 1st of the shown month
let selected = todayISO();
let lastMonth = null;

function initMonth() {
  const q = new URLSearchParams(location.search).get('d');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) selected = q;
  const d = parseISO(selected);
  month = new Date(d.getFullYear(), d.getMonth(), 1);
}

function shiftMonth(n) {
  month = new Date(month.getFullYear(), month.getMonth() + n, 1);
  render();
}

function goToday() {
  selected = todayISO();
  const d = parseISO(selected);
  month = new Date(d.getFullYear(), d.getMonth(), 1);
  render();
}

function select(dateISO) {
  const prev = selected;
  selected = dateISO;
  const url = new URL(location.href);
  url.searchParams.set('d', dateISO);
  history.replaceState(null, '', url);
  for (const el of main.querySelectorAll('.cal-day')) el.classList.toggle('selected', el.dataset.date === dateISO);
  if (wide.matches) renderPanel(dateISO > prev ? 1 : -1);
  else openDaySheet(dateISO);
}

function dayCell(dateISO, inMonth) {
  const { classes, tasks, events } = dayItems(data, dateISO);
  const live = classes.filter((c) => !c.cancelled);
  const pending = tasks.filter((t) => !t.done);
  const today = todayISO();
  const labels = [
    ...pending.map((t) => h('span', { class: 'cal-label cal-label-task' }, t.title)),
    ...events.map((e) => h('span', { class: 'cal-label cal-label-event' }, e.title)),
    ...live.map((c) => h('span', { class: 'cal-label' }, c.moduleCode)),
  ];
  const summary = [
    live.length && `${live.length} class${live.length > 1 ? 'es' : ''}`,
    pending.length && `${pending.length} due`,
    events.length && `${events.length} event${events.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ');
  return h('button', {
    class: `cal-day${inMonth ? '' : ' out'}${dateISO === today ? ' today' : ''}${dateISO === selected ? ' selected' : ''}`,
    dataset: { date: dateISO },
    'aria-label': `${dayTitle(dateISO)}${summary ? `: ${summary}` : ''}`,
    onclick: () => select(dateISO),
  },
    h('span', { class: 'cal-num' }, parseISO(dateISO).getDate()),
    h('span', { class: 'cal-labels' }, labels.slice(0, 3), labels.length > 3 && h('span', { class: 'cal-more' }, `+${labels.length - 3}`)),
    h('span', { class: 'cal-marks', 'aria-hidden': 'true' },
      live.map(() => h('i', { class: 'mark' })),
      pending.length > 0 && h('i', { class: 'mark mark-due' }),
      events.length > 0 && h('i', { class: 'mark mark-event' })));
}

function renderPanel(dir = 0) {
  const panel = main.querySelector('.cal-panel');
  if (!panel) return;
  const wk = weekNumber(data.semester, parseISO(selected));
  const inner = h('div', { class: 'cal-panel-inner' },
    h('header', { class: 'panel-head' },
      h('p', { class: 'eyebrow' }, wk ? `Week ${wk}` : 'Outside semester'),
      h('h2', {}, dayTitle(selected))),
    dayContent(data, selected, { onOpen: openItem, onAdd: (d) => openEventForm({ date: d }) }));
  panel.replaceChildren(inner);
  if (dir) {
    enter(inner, 0, 16);
    stagger(inner.querySelectorAll('.row'));
  }
}

function render() {
  if (!data) return;
  const key = month.getFullYear() * 12 + month.getMonth();
  const dir = lastMonth == null || lastMonth === key ? 0 : key > lastMonth ? 1 : -1;
  lastMonth = key;

  const first = startOfWeek(month);
  const grid = h('div', { class: 'cal-grid', role: 'grid' },
    h('span', { class: 'cal-wkhead' }, 'Wk'),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => h('span', { class: 'cal-dow' }, d)));
  for (let r = 0; r < 6; r++) {
    const rowStart = addDays(first, r * 7);
    if (r === 5 && rowStart.getMonth() !== month.getMonth()) break;
    const wk = weekNumber(data.semester, rowStart);
    const kind = weekKind(data.semester, wk);
    grid.append(h('span', { class: `cal-wk${kind === 'break' ? ' brk' : ''}`, title: kind === 'break' ? 'Term break' : '' }, wk ?? ''));
    for (let c = 0; c < 7; c++) {
      const d = addDays(rowStart, c);
      grid.append(dayCell(iso(d), d.getMonth() === month.getMonth()));
    }
  }

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'titles' },
      data.semester.name && h('p', { class: 'eyebrow page-eyebrow' }, data.semester.name),
      h('h1', { class: 'page-title' }, month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))),
    h('div', { class: 'seg' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous month', onclick: () => shiftMonth(-1) }, icon('prev')),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: goToday }, 'Today'),
      h('button', { class: 'icon-btn', 'aria-label': 'Next month', onclick: () => shiftMonth(1) }, icon('next'))));

  const gridWrap = h('div', { class: 'cal-gridwrap' }, grid);
  main.replaceChildren(h('section', { class: 'cal' },
    h('div', { class: 'cal-main' }, toolbar, gridWrap),
    h('aside', { class: 'cal-panel', 'aria-live': 'polite' })));
  renderPanel();
  if (dir) enter(grid, dir);
}

wide.addEventListener('change', render);

boot((d) => {
  const first = !data;
  data = d;
  if (first) initMonth();
  render();
});

// Timetable (landing page): one semester week as a time grid.
import { boot } from './ui.js';
import { h, icon, fmtTime, fmtDate, enter } from './dom.js';
import {
  iso, parseISO, addDays, weekStart, weekKind, nearestWeek, weekday, toMin, todayISO,
  classesOn, tasksOn, eventsOn, layoutLanes,
} from './model.js';
import { shadeOf, weekLabel } from './views.js';
import { openItem, openEventForm, openAddMenu } from './editor.js';

const DAY_START = 8 * 60;
const DAY_END = 18 * 60;
const SPAN = DAY_END - DAY_START;
const main = document.getElementById('app');
const narrow = matchMedia('(max-width: 719px)');

let data = null;
let week = null;
let activeDay = null; // ISO date shown on phones
let lastWeek = null;

function initWeek() {
  const q = Number(new URLSearchParams(location.search).get('w'));
  week = q >= 1 && q <= data.semester.weeks ? q : nearestWeek(data.semester, new Date());
}

function goWeek(n) {
  week = Math.min(Math.max(n, 1), data.semester.weeks);
  activeDay = null;
  const url = new URL(location.href);
  url.searchParams.set('w', week);
  history.replaceState(null, '', url);
  render();
}

function weekDates() {
  const mon = weekStart(data.semester, week);
  const dates = [0, 1, 2, 3, 4].map((i) => iso(addDays(mon, i)));
  // show the weekend only when something is on it
  for (const i of [5, 6]) {
    const d = iso(addDays(mon, i));
    if (tasksOn(data, d).length || eventsOn(data, d).length) dates.push(d);
  }
  return dates;
}

function pickActiveDay(dates) {
  if (activeDay && dates.includes(activeDay)) return activeDay;
  const today = todayISO();
  return dates.includes(today) ? today : dates[0];
}

const pct = (min) => `${((min - DAY_START) / SPAN) * 100}%`;

function block(item) {
  const s = Math.max(toMin(item.start), DAY_START);
  const e = Math.min(toMin(item.end), DAY_END);
  const style = {
    top: pct(s),
    height: `calc(${((e - s) / SPAN) * 100}% - 3px)`,
    left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
    width: `calc(${100 / item.lanes}% - 4px)`,
  };
  if (item.kind === 'event') {
    return h('button', { class: 'block block-event', style, onclick: () => openItem(item) },
      h('span', { class: 'block-code' }, item.title),
      h('span', { class: 'block-meta' }, [fmtTime(item.start), item.location].filter(Boolean).join(' · ')));
  }
  const short = e - s <= 60;
  return h('button', {
    class: `block${item.cancelled ? ' cancelled' : ''}${item.changed ? ' changed' : ''}${short ? ' short' : ''}`,
    dataset: { shade: shadeOf(data, item.moduleCode) },
    style,
    onclick: () => openItem(item),
    'aria-label': `${item.moduleCode} ${item.agenda?.topic ?? ''}, ${fmtTime(item.start)} to ${fmtTime(item.end)}, ${item.venue}${item.cancelled ? ', cancelled' : ''}`,
  },
    h('span', { class: 'block-code' }, item.moduleCode, h('small', {}, item.section)),
    !short && item.agenda?.topic && h('span', { class: 'block-topic' }, item.agenda.topic),
    h('span', { class: 'block-meta' },
      item.cancelled ? 'Cancelled' : [`${fmtTime(item.start)}–${fmtTime(item.end)}`, item.agenda?.online ? 'Online' : item.venue].join(' · ')));
}

function render() {
  if (!data) return;
  const dir = lastWeek == null || lastWeek === week ? 0 : week > lastWeek ? 1 : -1;
  lastWeek = week;

  const dates = weekDates();
  activeDay = pickActiveDay(dates);
  const today = todayISO();
  const kind = weekKind(data.semester, week);
  const mon = weekStart(data.semester, week);
  const label = weekLabel(data, week);

  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'titles' },
      data.semester.name && h('p', { class: 'eyebrow page-eyebrow' }, data.semester.name),
      h('h1', { class: 'page-title' }, `Week ${week}`),
      h('p', { class: 'muted' },
        `${fmtDate(iso(mon), { day: 'numeric', month: 'short' })} – ${fmtDate(iso(addDays(mon, 4)), { day: 'numeric', month: 'short' })}`,
        label && h('span', { class: 'pill pill-inline' }, label))),
    h('div', { class: 'seg' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous week', disabled: week <= 1, onclick: () => goWeek(week - 1) }, icon('prev')),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => goWeek(nearestWeek(data.semester, new Date())) }, 'Today'),
      h('button', { class: 'icon-btn', 'aria-label': 'Next week', disabled: week >= data.semester.weeks, onclick: () => goWeek(week + 1) }, icon('next'))));

  const tabs = h('div', { class: 'day-tabs', role: 'tablist' },
    dates.map((d) => h('button', {
      role: 'tab',
      class: `day-tab${d === activeDay ? ' active' : ''}${d === today ? ' today' : ''}`,
      dataset: { date: d },
      'aria-selected': String(d === activeDay),
      onclick: () => setActiveDay(d),
    }, h('span', {}, fmtDate(d, { weekday: 'short' })), h('strong', {}, parseISO(d).getDate()))));

  const cols = dates.length;
  const grid = h('div', { class: 'tt-grid', style: { '--cols': cols } });

  // header row
  grid.append(h('div', { class: 'tt-corner' }));
  for (const d of dates) {
    grid.append(h('div', { class: `tt-dayhead${d === today ? ' today' : ''}${d === activeDay ? ' active' : ''}`, dataset: { date: d } },
      h('span', {}, fmtDate(d, { weekday: 'short' })),
      h('strong', {}, parseISO(d).getDate())));
  }

  // all-day row: deadlines + all-day events
  const hasAllDay = dates.some((d) => tasksOn(data, d).length || eventsOn(data, d).some((e) => !e.start));
  if (hasAllDay) {
    grid.append(h('div', { class: 'tt-label' }, 'Due'));
    for (const d of dates) {
      const chips = [
        ...eventsOn(data, d).filter((e) => !e.start).map((e) =>
          h('button', { class: 'chip chip-event', onclick: () => openItem(e) }, e.title)),
        ...tasksOn(data, d).map((t) =>
          h('button', {
            class: `chip chip-task${t.done ? ' done' : ''}`,
            dataset: { shade: shadeOf(data, t.moduleCode) },
            onclick: () => openItem(t),
            title: `${t.moduleCode} · ${t.title}`,
          }, h('span', { class: 'dot' }), h('span', { class: 'chip-text' }, `${t.moduleCode} · ${t.title}`))),
      ];
      grid.append(h('div', { class: `tt-allday${d === activeDay ? ' active' : ''}`, dataset: { date: d } }, chips));
    }
  }

  // time axis
  const axis = h('div', { class: 'tt-axis' });
  for (let m = DAY_START; m < DAY_END; m += 60) axis.append(h('span', { style: { top: pct(m) } }, fmtTime(`${m / 60}:00`)));
  grid.append(axis);

  for (const d of dates) {
    const items = [...classesOn(data, d), ...eventsOn(data, d).filter((e) => e.start && e.end)];
    layoutLanes(items);
    const col = h('div', {
      class: `tt-col${d === today ? ' today' : ''}${d === activeDay ? ' active' : ''}${weekday(parseISO(d)) > 5 ? ' weekend' : ''}`,
      dataset: { date: d },
      ondblclick: (e) => {
        if (e.target !== col) return;
        const r = col.getBoundingClientRect();
        const min = DAY_START + Math.floor((((e.clientY - r.top) / r.height) * SPAN) / 30) * 30;
        const hh = String(Math.floor(min / 60)).padStart(2, '0');
        const mm = String(min % 60).padStart(2, '0');
        openEventForm({ event: { title: '', date: d, start: `${hh}:${mm}`, end: `${String(Math.floor(min / 60) + 1).padStart(2, '0')}:${mm}`, location: '', notes: '' } });
      },
    }, items.map(block));
    if (d === today) col.append(nowLine());
    grid.append(col);
  }

  const body = h('div', { class: 'tt-wrap' }, grid);
  if (kind === 'break' || kind === 'exam') {
    const anyItems = dates.some((d) => classesOn(data, d).length || tasksOn(data, d).length || eventsOn(data, d).length);
    if (!anyItems || kind === 'break') {
      body.append(h('div', { class: 'tt-quiet' },
        h('strong', {}, label || (kind === 'break' ? 'Term break' : 'Study & exam week')),
        h('span', { class: 'muted' }, kind === 'break' ? 'No classes this week.' : 'No classes. Deadlines still show above.')));
    }
  }

  // swipe between days on phones
  let sx = null;
  body.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  body.addEventListener('touchend', (e) => {
    if (sx == null || !narrow.matches) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) < 60) return;
    const i = dates.indexOf(activeDay) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < dates.length) setActiveDay(dates[i], dx < 0 ? 1 : -1);
    else if (i >= dates.length && week < data.semester.weeks) goWeek(week + 1);
    else if (i < 0 && week > 1) goWeek(week - 1);
  });

  const fab = h('button', { class: 'fab', 'aria-label': 'Add', onclick: () => openAddMenu(activeDay) }, icon('plus', 22));

  main.replaceChildren(h('section', { class: 'tt' }, toolbar, tabs, body), fab);
  if (dir) enter(body, dir);
  scrollToNow(body);
}

function setActiveDay(d, dir = 0) {
  const prev = activeDay;
  activeDay = d;
  for (const el of main.querySelectorAll('[data-date]')) el.classList.toggle('active', el.dataset.date === d);
  for (const el of main.querySelectorAll('.day-tab')) el.setAttribute('aria-selected', String(el.dataset.date === d));
  if (narrow.matches && prev !== d) {
    const col = main.querySelector(`.tt-col[data-date="${d}"]`);
    if (col) enter(col, dir || (prev && d > prev ? 1 : -1), 16);
  }
}

function nowLine() {
  const line = h('div', { class: 'now-line', 'aria-hidden': 'true' });
  const place = () => {
    const n = new Date();
    const m = n.getHours() * 60 + n.getMinutes();
    line.hidden = m < DAY_START || m > DAY_END;
    line.style.top = pct(m);
  };
  place();
  return line;
}

function scrollToNow(body) {
  // on phones the grid scrolls vertically; bring the current hour into view on first paint
  if (!narrow.matches || scrollToNow.done) return;
  scrollToNow.done = true;
  const line = body.querySelector('.tt-col.active .now-line:not([hidden])');
  line?.scrollIntoView({ block: 'center' });
}

setInterval(() => {
  const line = main.querySelector('.now-line');
  if (!line) return;
  const n = new Date();
  const m = n.getHours() * 60 + n.getMinutes();
  line.hidden = m < DAY_START || m > DAY_END;
  line.style.top = pct(m);
}, 60000);

boot((d) => {
  const switched = !data || data.semesterId !== d.semesterId;
  if (data && switched) history.replaceState(null, '', location.pathname); // old ?w= belongs to the old semester
  data = d;
  if (switched) {
    lastWeek = null;
    initWeek();
  }
  render();
});

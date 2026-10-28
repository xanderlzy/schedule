// Search sheet: agendas (topics, readings, screenings, notes), deadlines and events.
// Loaded on demand from ui.js (search button, "/" or ⌘K).
import * as store from './store.js';
import { h, fmtDate, fmtTime, debounce } from './dom.js';
import { search, fold, occurrenceForAgenda } from './model.js';
import { openSheet, toast } from './ui.js';
import { openItem, openClassSheet } from './editor.js';
import { moduleName, shadeOf, dueText } from './views.js';

const PER_GROUP = 30;
let sheet = null;
let lastQuery = '';

export function openSearch() {
  if (sheet?.panel.isConnected) {
    sheet.panel.querySelector('.search-input')?.focus();
    return;
  }
  const input = h('input', {
    class: 'input search-input',
    type: 'search',
    placeholder: 'Topics, readings, films, notes, deadlines…',
    'aria-label': 'Search',
    autofocus: true,
    autocomplete: 'off',
    enterKeyHint: 'search',
    value: lastQuery,
  });
  const results = h('div', { class: 'search-results', 'aria-live': 'polite' });
  const run = () => {
    lastQuery = input.value;
    draw(results, input.value);
  };
  input.addEventListener('input', debounce(run, 80));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') results.querySelector('.search-hit')?.click();
  });
  sheet = openSheet({ title: 'Search', content: h('div', { class: 'search' }, input, results) });
  draw(results, lastQuery);
  setTimeout(() => input.select(), 80);
}

/** Text with every search term wrapped in <mark>. */
function mark(text, terms) {
  if (!text || !terms.length) return text || '';
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return String(text).split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

/** First supporting line that mentions a term, so results show *why* they matched. */
function snippet(agenda, terms) {
  const lines = [agenda.screening, ...(agenda.details || []), agenda.note].filter(Boolean);
  return lines.find((l) => terms.some((t) => fold(l).includes(t))) || '';
}

function openAgenda(agenda) {
  const occ = occurrenceForAgenda(store.getState(), agenda.moduleCode, agenda.week);
  if (occ) openClassSheet(occ);
  else toast(`No ${agenda.moduleCode} class in week ${agenda.week}`);
}

function draw(el, query) {
  const data = store.getState();
  if (!query.trim()) {
    el.replaceChildren(h('p', { class: 'muted small search-hint' },
      'Search this semester’s class topics, readings, screenings, your notes, deadlines and events. ',
      'Press / or ⌘K to search from any page.'));
    return;
  }
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const r = search(data, query);
  const total = r.agendas.length + r.tasks.length + r.events.length;
  if (!total) {
    el.replaceChildren(h('p', { class: 'muted quiet' }, `No results for “${query.trim()}”.`));
    return;
  }

  const group = (title, items, row) => items.length > 0 && h('section', { class: 'day-sec' },
    h('h3', { class: 'eyebrow' }, `${title} · ${items.length}`),
    h('ul', { class: 'rows' }, items.slice(0, PER_GROUP).map((it) => h('li', {}, row(it)))),
    items.length > PER_GROUP && h('p', { class: 'muted small' }, `…and ${items.length - PER_GROUP} more. Add another word to narrow it down.`));

  const hit = (props, ...kids) => h('button', { class: 'search-hit', ...props }, ...kids);

  el.replaceChildren(...[
    h('p', { class: 'muted small' }, `${total} result${total === 1 ? '' : 's'}`),
    group('Class agendas', r.agendas, (a) => hit({ dataset: { shade: shadeOf(data, a.moduleCode) }, onclick: () => openAgenda(a) },
      h('span', { class: 'hit-meta' }, `${a.moduleCode} · Week ${a.week}`),
      h('span', { class: 'hit-title' }, mark(a.topic || moduleName(data, a.moduleCode), terms)),
      snippet(a, terms) && h('span', { class: 'hit-snippet' }, mark(snippet(a, terms), terms)))),
    group('Deadlines', r.tasks, (t) => hit({ class: `search-hit${t.done ? ' done' : ''}`, onclick: () => openItem(t) },
      h('span', { class: 'hit-meta' }, `${t.moduleCode || 'Deadline'} · ${fmtDate(t.due)}`),
      h('span', { class: 'hit-title' }, mark(t.title, terms)),
      h('span', { class: 'hit-snippet' }, t.done ? 'Done' : dueText(t)))),
    group('Events', r.events, (e) => hit({ onclick: () => openItem(e) },
      h('span', { class: 'hit-meta' }, `${fmtDate(e.date)}${e.start ? ` · ${fmtTime(e.start)}` : ''}`),
      h('span', { class: 'hit-title' }, mark(e.title, terms)),
      (e.location || e.notes) && h('span', { class: 'hit-snippet' }, mark(e.location || e.notes, terms)))),
  ].filter(Boolean));
}

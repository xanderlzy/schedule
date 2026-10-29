// Sheets for viewing/editing: class occurrence, event, task, day.
import * as store from './store.js';
import { h, icon, fmtRange, fmtDate, debounce } from './dom.js';
import { tasksInWeek, todayISO, toMin } from './model.js';
import { openSheet, save, toast } from './ui.js';
import { agendaBlock, itemRow, moduleName, dayContent, dayTitle, weekLabel } from './views.js';

const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);

/** Route any item to its sheet. */
export function openItem(item) {
  if (item.kind === 'class') openClassSheet(item);
  else if (item.kind === 'task') openTaskForm({ id: item.id, task: store.getState().tasks[item.id] });
  else if (item.kind === 'event') openEventForm({ id: item.id, event: store.getState().events[item.id] });
}

export function openClassSheet(occ) {
  const data = store.getState();
  const mod = data.modules[occ.moduleCode] || {};
  const agendaId = `${occ.moduleCode}_w${occ.week}`;
  const tasks = tasksInWeek(data, occ.moduleCode, occ.week);

  const note = h('textarea', {
    class: 'input', rows: 3, placeholder: 'Add a note for this week…',
    value: data.agendas[agendaId]?.note || '',
  });
  const saved = h('span', { class: 'muted small saved' });
  note.addEventListener('input', debounce(() => {
    save(store.put('agendas', agendaId, { moduleCode: occ.moduleCode, week: occ.week, note: note.value.trim() }));
    saved.textContent = 'Saved';
    setTimeout(() => (saved.textContent = ''), 1500);
  }, 600));

  const meta = (ic, text) => text && h('p', { class: 'meta' }, icon(ic, 15), h('span', {}, text));

  const change = h('form', { class: 'form inline-form', hidden: true },
    h('div', { class: 'field-row' },
      field('Start', h('input', { class: 'input', type: 'time', name: 'start', value: occ.start, required: true })),
      field('End', h('input', { class: 'input', type: 'time', name: 'end', value: occ.end, required: true }))),
    field('Room', h('input', { class: 'input', name: 'venue', value: occ.venue })),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Save change')));
  change.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(change);
    if (toMin(f.get('end')) <= toMin(f.get('start'))) return toast('End time must be after start time');
    save(store.put('exceptions', occ.id, { start: f.get('start'), end: f.get('end'), venue: f.get('venue').trim() }, { merge: false }), 'Class updated');
    sheet.close();
  });

  const hasException = !!data.exceptions[occ.id];
  const actions = h('div', { class: 'btn-row' },
    occ.cancelled
      ? null
      : h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { change.hidden = !change.hidden; } }, 'Change time or room'),
    occ.cancelled
      ? null
      : h('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => { save(store.put('exceptions', occ.id, { cancelled: true }, { merge: false }), 'Class cancelled'); sheet.close(); },
      }, 'Cancel this class'),
    hasException && h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: () => { save(store.remove('exceptions', occ.id), 'Class restored'); sheet.close(); },
    }, 'Restore original'));

  const content = h('div', { class: 'stack' },
    occ.cancelled && h('p', { class: 'pill' }, `Cancelled${occ.reason ? ` · ${occ.reason}` : ''}`),
    h('div', { class: 'metas' },
      meta('clock', `${fmtDate(occ.date, { weekday: 'long', day: 'numeric', month: 'short' })} · ${fmtRange(occ.start, occ.end)}`),
      meta('pin', occ.venue),
      h('p', { class: 'meta muted' }, [occ.type, occ.section, occ.staff].filter(Boolean).join(' · '))),
    h('section', {},
      h('h3', { class: 'eyebrow' }, `Week ${occ.week} agenda`),
      occ.agenda?.topic && h('p', { class: 'agenda-topic' }, occ.agenda.topic),
      agendaBlock({ ...occ, agenda: occ.agenda && { ...occ.agenda, note: '' } })),
    tasks.length > 0 && h('section', {},
      h('h3', { class: 'eyebrow' }, 'Due this week'),
      h('ul', { class: 'rows' }, tasks.map((t) => itemRow(data, t, { onOpen: openItem })))),
    h('section', {}, h('h3', { class: 'eyebrow' }, 'Notes ', saved), note),
    mod.contact && h('p', { class: 'muted small' }, `${mod.lecturer} · ${mod.contact}`),
    actions,
    change);

  const sheet = openSheet({
    title: `${occ.moduleCode} · ${moduleName(data, occ.moduleCode)}`,
    subtitle: weekLabel(data, occ.week) || `Week ${occ.week}`,
    content,
  });
}

export function openEventForm({ id, event, date } = {}) {
  const e = event || { title: '', date: date || todayISO(), start: '', end: '', location: '', notes: '' };
  const allDay = h('input', { type: 'checkbox', name: 'allDay', checked: !e.start });
  const times = h('div', { class: 'field-row', hidden: !e.start },
    field('Start', h('input', { class: 'input', type: 'time', name: 'start', value: e.start || '09:00' })),
    field('End', h('input', { class: 'input', type: 'time', name: 'end', value: e.end || '10:00' })));
  allDay.addEventListener('change', () => { times.hidden = allDay.checked; });

  const form = h('form', { class: 'form' },
    field('Title', h('input', { class: 'input', name: 'title', value: e.title, required: true, autofocus: true, maxLength: 120 })),
    field('Date', h('input', { class: 'input', type: 'date', name: 'date', value: e.date, required: true })),
    h('label', { class: 'switch' }, allDay, h('span', {}, 'All day')),
    times,
    field('Location', h('input', { class: 'input', name: 'location', value: e.location || '', maxLength: 120 })),
    field('Notes', h('textarea', { class: 'input', name: 'notes', rows: 3, value: e.notes || '' })),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, id ? 'Save' : 'Add event'),
      id && h('button', {
        class: 'btn btn-ghost danger', type: 'button',
        onclick: () => { save(store.remove('events', id), 'Event deleted'); sheet.close(); },
      }, 'Delete')));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const timed = !allDay.checked;
    if (timed && toMin(f.get('end')) <= toMin(f.get('start'))) return toast('End time must be after start time');
    const doc = {
      title: f.get('title').trim(),
      date: f.get('date'),
      start: timed ? f.get('start') : '',
      end: timed ? f.get('end') : '',
      location: f.get('location').trim(),
      notes: f.get('notes').trim(),
    };
    save(store.put('events', id || store.newId(), doc, { merge: false }), id ? 'Event saved' : 'Event added');
    sheet.close();
  });

  const sheet = openSheet({ title: id ? 'Edit event' : 'New event', content: form });
}

export function openTaskForm({ id, task, date } = {}) {
  const data = store.getState();
  const t = task || { title: '', moduleCode: '', due: `${date || todayISO()}T23:59`, weight: null, done: false, dueKind: 'exact' };
  const modules = Object.values(data.modules);

  const form = h('form', { class: 'form' },
    field('Title', h('input', { class: 'input', name: 'title', value: t.title, required: true, autofocus: true, maxLength: 120 })),
    field('Module', h('select', { class: 'input', name: 'moduleCode' },
      h('option', { value: '' }, 'None'),
      modules.map((m) => h('option', { value: m.code, selected: m.code === t.moduleCode }, `${m.code} · ${m.name}`)))),
    h('div', { class: 'field-row' },
      field('Due date', h('input', { class: 'input', type: 'date', name: 'date', value: t.due.slice(0, 10), required: true })),
      field('Time', h('input', { class: 'input', type: 'time', name: 'time', value: t.due.slice(11, 16), required: true }))),
    field('Weight (%)', h('input', { class: 'input', type: 'number', name: 'weight', min: 0, max: 100, value: t.weight ?? '' })),
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', name: 'done', checked: !!t.done }), h('span', {}, 'Done')),
    t.dueKind === 'week' && h('p', { class: 'muted small' }, 'The syllabus only gives the week for this deadline. Set the exact date and time once you know it.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, id ? 'Done' : 'Add deadline'),
      id && h('button', {
        class: 'btn btn-ghost danger', type: 'button',
        onclick: () => { deleted = true; save(store.remove('tasks', id), 'Deadline deleted'); sheet.close(); },
      }, 'Delete')),
    id && h('p', { class: 'muted small saved' }, 'Changes save automatically.'));

  const read = () => {
    const f = new FormData(form);
    const due = `${f.get('date')}T${f.get('time')}`;
    const weight = f.get('weight') === '' ? null : Number(f.get('weight'));
    return {
      title: f.get('title').trim(),
      moduleCode: f.get('moduleCode'),
      due,
      dueKind: task && due === task.due ? task.dueKind || 'exact' : 'exact',
      weight,
      done: f.get('done') === 'on',
    };
  };

  // Existing deadlines save as you edit, so closing the sheet never loses a change.
  let deleted = false;
  let lastSaved = id ? JSON.stringify(read()) : null;
  const autosave = () => {
    if (!id || deleted || !form.checkValidity()) return;
    const doc = read();
    const json = JSON.stringify(doc);
    if (json === lastSaved) return;
    lastSaved = json;
    save(store.put('tasks', id, doc, { merge: false }));
  };
  const autosaveSoon = debounce(autosave, 500);
  form.addEventListener('change', autosave);
  form.addEventListener('input', autosaveSoon);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (id) autosave();
    else save(store.put('tasks', store.newId(), read(), { merge: false }), 'Deadline added');
    sheet.close();
  });

  const sheet = openSheet({ title: id ? 'Edit deadline' : 'New deadline', content: form, onClose: autosave });
}

/** Day sheet used by the calendar on small screens. */
export function openDaySheet(dateISO) {
  const data = store.getState();
  openSheet({
    title: dayTitle(dateISO),
    content: dayContent(data, dateISO, { onOpen: openItem, onAdd: (d) => openEventForm({ date: d }) }),
  });
}

/** "+" chooser: event or deadline. */
export function openAddMenu(dateISO) {
  const sheet = openSheet({
    title: 'Add',
    content: h('div', { class: 'choice' },
      h('button', { class: 'choice-btn', onclick: () => { sheet.close(); openEventForm({ date: dateISO }); } },
        h('strong', {}, 'Event'), h('span', { class: 'muted small' }, 'Something happening at a time')),
      h('button', { class: 'choice-btn', onclick: () => { sheet.close(); openTaskForm({ date: dateISO }); } },
        h('strong', {}, 'Deadline'), h('span', { class: 'muted small' }, 'Something due, with a checkbox'))),
  });
}

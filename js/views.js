// Reusable rendering pieces shared by all three pages.
import * as store from './store.js';
import { h, icon, fmtTime, fmtRange, fmtDate } from './dom.js';
import { dayItems, weekNumber, parseISO, weekKind } from './model.js';
import { save } from './ui.js';

export const shadeOf = (data, code) => data.modules[code]?.shade ?? 0;
export const moduleName = (data, code) => data.modules[code]?.name ?? code ?? '';

export function weekLabel(data, week) {
  const kind = weekKind(data.semester, week);
  return data.semester.labels?.[week] || (kind === 'break' ? 'Term break' : kind === 'exam' ? 'Study & exam week' : '');
}

/** Round checkbox bound to a task's done flag. */
export function taskCheck(task) {
  const input = h('input', {
    type: 'checkbox',
    class: 'check',
    checked: !!task.done,
    'aria-label': `Mark "${task.title}" ${task.done ? 'not done' : 'done'}`,
    onclick: (e) => e.stopPropagation(),
    onchange: (e) => save(store.put('tasks', task.id, { done: e.target.checked })),
  });
  return input;
}

export function dueText(task) {
  const t = task.due.slice(11, 16);
  return task.dueKind === 'week' ? 'Due this week' : `Due ${fmtTime(t)}`;
}

/** Agenda details for a class occurrence. */
export function agendaBlock(occ) {
  const a = occ.agenda;
  if (!a) return h('p', { class: 'muted small' }, 'No agenda for this week.');
  return h('div', { class: 'agenda' },
    a.screening && h('p', { class: 'agenda-screening' }, icon('film', 14), h('span', {}, a.screening)),
    a.details?.length ? h('ul', { class: 'agenda-list' }, a.details.map((d) => h('li', {}, d))) : null,
    a.note && h('p', { class: 'agenda-note' }, a.note));
}

/** One row in a day listing. `onOpen` opens the full editor for that item. */
export function itemRow(data, item, { expandable = true, onOpen, expanded } = {}) {
  if (item.kind === 'task') {
    return h('li', { class: `row row-task${item.done ? ' done' : ''}`, dataset: { shade: shadeOf(data, item.moduleCode) } },
      taskCheck(item),
      h('button', { class: 'row-main', onclick: () => onOpen?.(item) },
        h('span', { class: 'row-title' }, item.title),
        h('span', { class: 'row-sub' },
          [item.moduleCode, dueText(item), item.weight ? `${item.weight}%` : null].filter(Boolean).join(' · '))));
  }
  if (item.kind === 'event') {
    return h('li', { class: 'row row-event' },
      h('span', { class: 'row-time' }, item.start ? fmtTime(item.start) : 'All day'),
      h('button', { class: 'row-main', onclick: () => onOpen?.(item) },
        h('span', { class: 'row-title' }, item.title),
        h('span', { class: 'row-sub' }, [item.start && item.end ? fmtRange(item.start, item.end) : null, item.location].filter(Boolean).join(' · ') || 'Event')));
  }
  // class occurrence
  const cls = `row row-class${item.cancelled ? ' cancelled' : ''}${expanded ? ' expanded' : ''}`;
  const li = h('li', { class: cls, dataset: { shade: shadeOf(data, item.moduleCode), id: item.id } });
  const detail = h('div', { class: 'row-detail' },
    h('div', { class: 'row-detail-inner' },
      agendaBlock(item),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => onOpen?.(item) }, 'Details & notes')));
  const toggle = () => {
    li.classList.toggle('expanded');
    head.setAttribute('aria-expanded', li.classList.contains('expanded'));
  };
  const head = h('button', {
    class: 'row-main',
    'aria-expanded': !!expanded,
    onclick: expandable ? toggle : () => onOpen?.(item),
  },
    h('span', { class: 'row-title' },
      h('span', { class: 'code' }, item.moduleCode),
      item.agenda?.topic || moduleName(data, item.moduleCode)),
    h('span', { class: 'row-sub' },
      [item.cancelled ? `Cancelled${item.reason ? ` · ${item.reason}` : ''}` : null, item.venue, item.agenda?.online ? 'Online' : null]
        .filter(Boolean).join(' · ')),
    expandable && h('span', { class: 'row-chevron' }, icon('chevron', 16)));
  li.append(h('span', { class: 'row-time' }, fmtTime(item.start), h('small', {}, fmtTime(item.end))), head);
  if (expandable) li.append(detail);
  return li;
}

/** Everything happening on a date: classes, deadlines, events. */
export function dayContent(data, dateISO, { onOpen, onAdd } = {}) {
  const { classes, tasks, events } = dayItems(data, dateISO);
  const wk = weekNumber(data.semester, parseISO(dateISO));
  const label = wk ? weekLabel(data, wk) : '';
  const section = (title, items) => items.length
    ? h('section', { class: 'day-sec' },
      h('h3', { class: 'eyebrow' }, title),
      h('ul', { class: 'rows' }, items.map((it) => itemRow(data, it, { onOpen }))))
    : null;
  const nothing = !classes.length && !tasks.length && !events.length;
  return h('div', { class: 'day-content' },
    label && h('p', { class: 'pill' }, label),
    section('Classes', classes),
    section('Deadlines', tasks),
    section('Events', events),
    nothing && h('p', { class: 'muted quiet' }, 'Nothing scheduled.'),
    onAdd && h('button', { class: 'btn btn-ghost add-btn', onclick: () => onAdd(dateISO) }, icon('plus', 16), 'Add event'));
}

export const dayTitle = (dateISO) => fmtDate(dateISO, { weekday: 'long', day: 'numeric', month: 'long' });

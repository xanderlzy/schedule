// Pure schedule logic: no DOM, no Firebase. Dates are local "YYYY-MM-DD" strings.

const WEEK_MS = 7 * 86400000;

export const pad = (n) => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

export function todayISO() {
  return iso(new Date());
}

/** Monday of the week containing d. */
export function startOfWeek(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** 1 = Monday … 7 = Sunday */
export const weekday = (d) => ((d.getDay() + 6) % 7) + 1;

export const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Semester week number for a date, or null outside the semester. */
export function weekNumber(sem, date) {
  if (!sem) return null;
  const n = Math.round((startOfWeek(date) - parseISO(sem.start)) / WEEK_MS) + 1;
  return n >= 1 && n <= sem.weeks ? n : null;
}

export function weekStart(sem, n) {
  return addDays(parseISO(sem.start), 7 * (n - 1));
}

/** 'term' | 'break' | 'exam' | 'out' */
export function weekKind(sem, n) {
  if (!sem || n == null) return 'out';
  if (sem.breakWeeks?.includes(n)) return 'break';
  if (sem.examWeeks?.includes(n)) return 'exam';
  return 'term';
}

/** Clamp a date to the nearest semester week (for opening the timetable). */
export function nearestWeek(sem, date) {
  const n = Math.round((startOfWeek(date) - parseISO(sem.start)) / WEEK_MS) + 1;
  return Math.min(Math.max(n, 1), sem.weeks);
}

const byStart = (a, b) => (a.start || '').localeCompare(b.start || '') || (a.title || '').localeCompare(b.title || '');

export function classesOn(data, dateISO) {
  const d = parseISO(dateISO);
  const wk = weekNumber(data.semester, d);
  if (!wk || weekKind(data.semester, wk) === 'break') return [];
  const wd = weekday(d);
  const out = [];
  for (const c of Object.values(data.classes)) {
    if (c.day !== wd || !c.weeks.includes(wk)) continue;
    const ex = data.exceptions[`${c.id}@${dateISO}`] || {};
    const agenda = data.agendas[`${c.moduleCode}_w${wk}`] || null;
    out.push({
      kind: 'class',
      id: `${c.id}@${dateISO}`,
      classId: c.id,
      moduleCode: c.moduleCode,
      section: c.section,
      type: c.type,
      staff: c.staff,
      date: dateISO,
      week: wk,
      start: ex.start || c.start,
      end: ex.end || c.end,
      venue: ex.venue || agenda?.venue || c.venue,
      cancelled: !!ex.cancelled,
      changed: !!(ex.start || ex.end || ex.venue),
      reason: ex.reason || '',
      agenda,
    });
  }
  return out.sort(byStart);
}

export function tasksOn(data, dateISO) {
  return Object.entries(data.tasks)
    .filter(([, t]) => t.due.slice(0, 10) === dateISO)
    .map(([id, t]) => ({ ...t, id, kind: 'task', start: t.due.slice(11, 16) }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function eventsOn(data, dateISO) {
  return Object.entries(data.events)
    .filter(([, e]) => e.date === dateISO)
    .map(([id, e]) => ({ ...e, id, kind: 'event' }))
    .sort(byStart);
}

export function dayItems(data, dateISO) {
  return {
    classes: classesOn(data, dateISO),
    tasks: tasksOn(data, dateISO),
    events: eventsOn(data, dateISO),
  };
}

/** Tasks for a module whose due date falls in a given semester week. */
export function tasksInWeek(data, moduleCode, week) {
  const from = iso(weekStart(data.semester, week));
  const to = iso(addDays(weekStart(data.semester, week), 6));
  return Object.entries(data.tasks)
    .filter(([, t]) => t.moduleCode === moduleCode && t.due.slice(0, 10) >= from && t.due.slice(0, 10) <= to)
    .map(([id, t]) => ({ ...t, id, kind: 'task' }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** Inclusive list of ISO dates. */
export function datesBetween(fromISO, toISO) {
  const out = [];
  for (let d = parseISO(fromISO); iso(d) <= toISO; d = addDays(d, 1)) out.push(iso(d));
  return out;
}

/** Assign side-by-side lanes to overlapping timed items. Mutates: sets lane + lanes. */
export function layoutLanes(items) {
  const timed = items.filter((i) => i.start && i.end).sort((a, b) => toMin(a.start) - toMin(b.start));
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanesEnd = [];
    for (const it of cluster) {
      let lane = lanesEnd.findIndex((e) => e <= toMin(it.start));
      if (lane === -1) lane = lanesEnd.length;
      lanesEnd[lane] = toMin(it.end);
      it.lane = lane;
    }
    for (const it of cluster) it.lanes = lanesEnd.length;
    cluster = [];
  };
  for (const it of timed) {
    if (cluster.length && toMin(it.start) >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, toMin(it.end));
  }
  flush();
  return timed;
}

/* ---------- now / next / countdowns ---------- */

/** Local Date for an ISO date and HH:MM. */
export function at(dateISO, hhmm) {
  const d = parseISO(dateISO);
  const [h, m] = (hhmm || '00:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export const dueDate = (task) => at(task.due.slice(0, 10), task.due.slice(11, 16));

/** The class/event happening now (if any) and the next one to start, looking ahead `days`. */
export function nextUp(data, now = new Date(), days = 14) {
  let current = null;
  let next = null;
  for (let i = 0; i <= days && !next; i++) {
    const d = iso(addDays(now, i));
    const items = [
      ...classesOn(data, d).filter((c) => !c.cancelled),
      ...eventsOn(data, d).filter((e) => e.start && e.end),
    ].sort(byStart);
    for (const it of items) {
      const startsAt = at(d, it.start);
      const endsAt = at(d, it.end);
      if (startsAt <= now && now < endsAt) current ??= { ...it, date: d, startsAt, endsAt };
      else if (startsAt > now) { next = { ...it, date: d, startsAt, endsAt }; break; }
    }
  }
  return { current, next };
}

/** Pending deadlines: everything overdue, plus those due within `days`. */
export function pendingTasks(data, now = new Date(), days = 7) {
  const horizon = addDays(now, days + 1);
  const out = { overdue: [], soon: [] };
  for (const [id, t] of Object.entries(data.tasks)) {
    if (t.done) continue;
    const due = dueDate(t);
    if (due < now) out.overdue.push({ ...t, id, kind: 'task', dueAt: due });
    else if (due < horizon) out.soon.push({ ...t, id, kind: 'task', dueAt: due });
  }
  const byDue = (a, b) => a.dueAt - b.dueAt;
  out.overdue.sort(byDue);
  out.soon.sort(byDue);
  return out;
}

/** Human countdown: "in 25 min", "in 3 h", "tomorrow", "in 4 days", "2 days ago". */
export function countdown(target, now = new Date()) {
  const ms = target - now;
  const dayDiff = Math.round((parseISO(iso(target)) - parseISO(iso(now))) / 86400000);
  const mins = Math.abs(ms) / 60000;
  const sameDay = (past) => (mins < 60 ? `${Math.max(1, Math.round(mins))} min` : `${Math.round(mins / 60)} h`) + (past ? ' ago' : '');
  if (ms < 0) {
    if (dayDiff === 0) return sameDay(true);
    return dayDiff === -1 ? 'yesterday' : `${-dayDiff} days ago`;
  }
  if (dayDiff === 0) return `in ${sameDay(false)}`;
  return dayDiff === 1 ? 'tomorrow' : `in ${dayDiff} days`;
}

/* ---------- search ---------- */

/** Lowercase and strip accents so "melanie" finds "Mélanie". */
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Search agendas (topics, readings, screenings, notes), deadlines and events.
 * Every word in the query must appear somewhere in the item.
 */
export function search(data, query) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const result = { agendas: [], tasks: [], events: [] };
  if (!terms.length) return result;
  const matches = (...fields) => {
    const hay = fold(fields.flat().filter(Boolean).join('\n'));
    return terms.every((t) => hay.includes(t));
  };
  for (const [id, a] of Object.entries(data.agendas)) {
    const mod = data.modules[a.moduleCode];
    if (matches(a.topic, a.details, a.screening, a.note, a.venue, a.moduleCode, mod?.name)) {
      result.agendas.push({ ...a, id, kind: 'agenda' });
    }
  }
  for (const [id, t] of Object.entries(data.tasks)) {
    if (matches(t.title, t.moduleCode, data.modules[t.moduleCode]?.name)) result.tasks.push({ ...t, id, kind: 'task' });
  }
  for (const [id, e] of Object.entries(data.events)) {
    if (matches(e.title, e.location, e.notes)) result.events.push({ ...e, id, kind: 'event' });
  }
  result.agendas.sort((a, b) => a.week - b.week || a.moduleCode.localeCompare(b.moduleCode));
  result.tasks.sort((a, b) => a.due.localeCompare(b.due));
  result.events.sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
  return result;
}

/** The class occurrence a module's agenda for `week` belongs to (first class that week), or null. */
export function occurrenceForAgenda(data, moduleCode, week) {
  const cls = Object.values(data.classes)
    .filter((c) => c.moduleCode === moduleCode && c.weeks.includes(week))
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))[0];
  if (!cls) return null;
  const date = iso(addDays(weekStart(data.semester, week), cls.day - 1));
  return classesOn(data, date).find((o) => o.classId === cls.id) || null;
}

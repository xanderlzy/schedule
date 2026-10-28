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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  parseISO, iso, weekNumber, weekStart, weekKind, nearestWeek,
  classesOn, tasksOn, dayItems, tasksInWeek, layoutLanes,
} from '../js/model.js';

const sem = { start: '2026-10-19', weeks: 19, breakWeeks: [10, 11], examWeeks: [18, 19] };

const data = {
  semester: sem,
  classes: {
    a: { id: 'a', moduleCode: 'WISP', day: 1, start: '08:00', end: '10:00', venue: 'X', weeks: [1, 2, 3, 4, 5, 12] },
    b: { id: 'b', moduleCode: 'FH', day: 2, start: '12:00', end: '16:00', venue: 'Theatre', weeks: [1, 2, 3, 4, 5, 12] },
  },
  exceptions: {
    'a@2026-11-09': { cancelled: true },
    'b@2026-11-10': { start: '10:00', end: '14:00' },
  },
  agendas: { WISP_w2: { topic: 'Lesson 2', venue: 'Online' } },
  tasks: {
    t1: { moduleCode: 'WISP', title: 'ASG', due: '2026-12-02T23:59', done: false },
    t2: { moduleCode: 'WISP', title: 'Form', due: '2026-11-09T23:59', done: false },
  },
  events: { e1: { title: 'Dentist', date: '2026-11-09', start: '15:00', end: '16:00' } },
};

test('week numbering', () => {
  assert.equal(weekNumber(sem, parseISO('2026-10-19')), 1);
  assert.equal(weekNumber(sem, parseISO('2026-10-25')), 1);
  assert.equal(weekNumber(sem, parseISO('2026-10-29')), 2);
  assert.equal(weekNumber(sem, parseISO('2027-01-04')), 12);
  assert.equal(weekNumber(sem, parseISO('2027-02-28')), 19);
  assert.equal(weekNumber(sem, parseISO('2026-10-18')), null);
  assert.equal(weekNumber(sem, parseISO('2027-03-01')), null);
  assert.equal(iso(weekStart(sem, 12)), '2027-01-04');
});

test('week kinds and clamping', () => {
  assert.equal(weekKind(sem, 10), 'break');
  assert.equal(weekKind(sem, 18), 'exam');
  assert.equal(weekKind(sem, 3), 'term');
  assert.equal(weekKind(sem, null), 'out');
  assert.equal(nearestWeek(sem, parseISO('2026-09-01')), 1);
  assert.equal(nearestWeek(sem, parseISO('2027-06-01')), 19);
});

test('classes expand on the right days with agenda + venue override', () => {
  const mon = classesOn(data, '2026-10-26');
  assert.equal(mon.length, 1);
  assert.equal(mon[0].week, 2);
  assert.equal(mon[0].agenda.topic, 'Lesson 2');
  assert.equal(mon[0].venue, 'Online');
  assert.equal(classesOn(data, '2026-10-28').length, 0); // Wednesday
  assert.equal(classesOn(data, '2026-12-21').length, 0); // break week
});

test('exceptions cancel and move classes', () => {
  assert.equal(classesOn(data, '2026-11-09')[0].cancelled, true);
  const moved = classesOn(data, '2026-11-10')[0];
  assert.equal(moved.start, '10:00');
  assert.equal(moved.changed, true);
});

test('tasks land on their due date', () => {
  assert.deepEqual(tasksOn(data, '2026-12-02').map((t) => t.id), ['t1']);
  const day = dayItems(data, '2026-11-09');
  assert.equal(day.tasks.length, 1);
  assert.equal(day.events[0].title, 'Dentist');
  assert.deepEqual(tasksInWeek(data, 'WISP', 4).map((t) => t.id), ['t2']);
});

test('overlapping items get separate lanes', () => {
  const items = [
    { start: '08:00', end: '12:00' },
    { start: '09:00', end: '10:00' },
    { start: '13:00', end: '14:00' },
  ];
  layoutLanes(items);
  assert.equal(items[0].lanes, 2);
  assert.notEqual(items[0].lane, items[1].lane);
  assert.equal(items[2].lanes, 1);
});

test('seed data is consistent', { skip: !existsSync(new URL('../data/seed.json', import.meta.url)) }, () => {
  const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url)));
  for (const c of Object.values(seed.classes)) assert.ok(seed.modules[c.moduleCode], c.id);
  for (const t of Object.values(seed.tasks)) {
    assert.ok(seed.modules[t.moduleCode], t.title);
    assert.match(t.due, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  }
  for (const [id, a] of Object.entries(seed.agendas)) assert.equal(id, `${a.moduleCode}_w${a.week}`);
  // Deepavali: WISP cancelled on Mon 9 Nov
  assert.equal(classesOn(seed, '2026-11-09').find((c) => c.moduleCode === 'WISP').cancelled, true);
  // Thursday 29 Oct (week 2): Doc, PCFMS2, Script
  assert.deepEqual(classesOn(seed, '2026-10-29').map((c) => c.moduleCode), ['2DOCFLM', 'PCFMS2', '2SCRIPT']);
});

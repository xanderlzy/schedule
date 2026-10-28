import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextUp, pendingTasks, countdown, search, occurrenceForAgenda, fold } from '../js/model.js';

const data = {
  semester: { start: '2026-10-19', weeks: 19, breakWeeks: [10, 11], examWeeks: [18, 19] },
  modules: { FH: { code: 'FH', name: 'Film History', lecturer: 'Mélanie' }, WS: { code: 'WS', name: 'World Issues' } },
  classes: {
    a: { id: 'a', moduleCode: 'WS', day: 1, start: '08:00', end: '10:00', venue: 'B50', weeks: [1, 2, 3] },
    b: { id: 'b', moduleCode: 'FH', day: 2, start: '12:00', end: '16:00', venue: 'Theatre', weeks: [1, 2, 3] },
  },
  exceptions: { 'b@2026-10-27': { cancelled: true } },
  agendas: {
    FH_w2: { moduleCode: 'FH', week: 2, topic: 'The late Silent Era', screening: 'German Expressionism', details: ['Reading: Chapter 4'] },
    FH_w3: { moduleCode: 'FH', week: 3, topic: 'French Poetic Realism', details: ['SmartBook Chapter 13'], note: 'Bring Renoir notes' },
  },
  tasks: {
    old: { moduleCode: 'WS', title: 'Logline', due: '2026-10-28T23:59', done: false },
    done: { moduleCode: 'WS', title: 'Done thing', due: '2026-10-28T23:59', done: true },
    soon: { moduleCode: 'FH', title: 'Treatment', due: '2026-11-02T23:59', done: false },
    far: { moduleCode: 'FH', title: 'Final', due: '2026-12-20T23:59', done: false },
  },
  events: { e1: { title: 'Dentist', date: '2026-10-29', start: '15:00', end: '16:00', location: 'Clinic' } },
};
const t = (s) => new Date(s);

test('nextUp finds the current and next item, skipping cancelled classes', () => {
  // Mon 26 Oct 09:00 — WS class running; next is Thu event (Tue FH class cancelled)
  const { current, next } = nextUp(data, t('2026-10-26T09:00'));
  assert.equal(current.moduleCode, 'WS');
  assert.equal(next.title, 'Dentist');
  // Thu 16:30, nothing left that week → Mon 2 Nov WS
  const later = nextUp(data, t('2026-10-29T16:30'));
  assert.equal(later.current, null);
  assert.equal(later.next.date, '2026-11-02');
});

test('pendingTasks splits overdue and due soon, ignoring done', () => {
  const p = pendingTasks(data, t('2026-10-29T10:00'), 7);
  assert.deepEqual(p.overdue.map((x) => x.id), ['old']);
  assert.deepEqual(p.soon.map((x) => x.id), ['soon']);
});

test('countdown wording', () => {
  const now = t('2026-10-29T10:00');
  assert.equal(countdown(t('2026-10-29T10:25'), now), 'in 25 min');
  assert.equal(countdown(t('2026-10-29T14:00'), now), 'in 4 h');
  assert.equal(countdown(t('2026-10-30T09:00'), now), 'tomorrow');
  assert.equal(countdown(t('2026-11-02T23:59'), now), 'in 4 days');
  assert.equal(countdown(t('2026-10-28T23:59'), now), 'yesterday');
  assert.equal(countdown(t('2026-10-26T12:00'), now), '3 days ago');
  assert.equal(countdown(t('2026-10-29T09:30'), now), '30 min ago');
});

test('search covers agendas, notes, deadlines and events; accents and word order ignored', () => {
  assert.deepEqual(search(data, 'expressionism').agendas.map((a) => a.id), ['FH_w2']);
  assert.deepEqual(search(data, 'chapter').agendas.map((a) => a.id), ['FH_w2', 'FH_w3']);
  assert.deepEqual(search(data, 'renoir notes').agendas.map((a) => a.id), ['FH_w3']);
  assert.deepEqual(search(data, 'film history 13').agendas.map((a) => a.id), ['FH_w3']);
  assert.deepEqual(search(data, 'treatment').tasks.map((x) => x.id), ['soon']);
  assert.deepEqual(search(data, 'clinic').events.map((x) => x.id), ['e1']);
  assert.equal(fold('Mélanie'), 'melanie');
  const empty = search(data, '   ');
  assert.equal(empty.agendas.length + empty.tasks.length + empty.events.length, 0);
});

test('occurrenceForAgenda finds the class that week', () => {
  assert.equal(occurrenceForAgenda(data, 'FH', 3).date, '2026-11-03');
  assert.equal(occurrenceForAgenda(data, 'FH', 9), null);
});

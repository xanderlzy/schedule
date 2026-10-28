// Local-mode store behaviour (Firebase is never contacted in tests).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.SCHEDULE_LOCAL_ONLY = true;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const semFile = (id, name, start) => ({
  semester: { id, name, start, weeks: 18, breakWeeks: [], examWeeks: [] },
  modules: { M1: { code: 'M1', name: 'Module', shade: 1 } },
  classes: { c1: { id: 'c1', moduleCode: 'M1', day: 1, start: '09:00', end: '10:00', venue: 'R1', weeks: [1, 2] } },
  exceptions: {},
  agendas: { M1_w1: { moduleCode: 'M1', week: 1, topic: `${name} intro`, details: [] } },
  tasks: { t1: { moduleCode: 'M1', title: 'Essay', due: `${start}T23:59`, done: false } },
});

// A fresh module instance (and empty storage) per test, so state starts clean.
let store;
let n = 0;
beforeEach(async () => {
  mem.clear();
  store = await import(`../js/store.js?case=${n++}`);
});

test('importing a second semester keeps the first and switches to the new one', async () => {
  await store.importSemester(semFile('s1', 'Sem 1', '2026-04-20'));
  await store.put('tasks', 't1', { done: true });
  await store.importSemester(semFile('s2', 'Sem 2', '2026-10-19'));
  await tick();
  assert.deepEqual(store.listSemesters().map((s) => s.id), ['s2', 's1']);
  assert.equal(store.getState().semesterId, 's2');
  assert.equal(store.getState().tasks.t1.done, false);

  await store.setActiveSemester('s1');
  await tick();
  assert.equal(store.getState().agendas.M1_w1.topic, 'Sem 1 intro');
  assert.equal(store.getState().tasks.t1.done, true, 'progress in the old semester is kept');
});

test('personal events are shared across semesters', async () => {
  await store.importSemester(semFile('a', 'A', '2026-04-20'));
  await store.put('events', 'e1', { title: 'Dentist', date: '2026-05-01' });
  await store.importSemester(semFile('b', 'B', '2026-10-19'));
  await tick();
  assert.equal(store.getState().events.e1.title, 'Dentist');
});

test('describeImport recognises semesters, re-imports and backups', async () => {
  await store.importSemester(semFile('x', 'X', '2026-04-20'));
  assert.deepEqual(store.describeImport(semFile('x', 'X', '2026-04-20')), { kind: 'semester', id: 'x', name: 'X', exists: true });
  assert.equal(store.describeImport(semFile('y', 'Y', '2026-10-19')).exists, false);
  assert.deepEqual(store.describeImport({ version: 2, semesters: { x: {}, y: {} } }), { kind: 'backup', count: 2 });
  assert.throws(() => store.describeImport({ hello: 1 }), /does not look like schedule data/);
});

test('semester id falls back to a slug of the name', () => {
  assert.equal(store.semesterIdOf({ name: 'April Semester 2027', start: '2027-04-19' }), 'april-semester-2027');
  assert.equal(store.semesterIdOf({ start: '2027-04-19' }), '2027-04-19');
});

test('backup round-trips every semester and events', async () => {
  await store.importSemester(semFile('p', 'P', '2026-04-20'));
  await store.importSemester(semFile('q', 'Q', '2026-10-19'));
  await store.put('events', 'e9', { title: 'Trip', date: '2026-12-25' });
  await tick();
  const backup = JSON.parse(await store.exportData());
  assert.equal(backup.version, 2);
  assert.deepEqual(Object.keys(backup.semesters).sort(), ['p', 'q']);

  await store.deleteSemester('p');
  await store.deleteSemester('q');
  await store.remove('events', 'e9');
  await tick();
  assert.equal(store.listSemesters().length, 0);

  await store.restoreBackup(backup);
  await tick();
  assert.deepEqual(store.listSemesters().map((s) => s.id).sort(), ['p', 'q']);
  assert.equal(store.getState().events.e9.title, 'Trip');
});

test('deleting the active semester falls back to another', async () => {
  await store.importSemester(semFile('old', 'Old', '2025-10-20'));
  await store.importSemester(semFile('new', 'New', '2026-10-19'));
  await store.deleteSemester('new');
  await tick();
  assert.equal(store.getState().semesterId, 'old');
});

test('old single-semester cache is upgraded', async () => {
  mem.set('schedule:data', JSON.stringify({ ...semFile('legacy', 'Legacy', '2026-10-19'), events: { e: { title: 'E', date: '2026-10-20' } } }));
  const fresh = await import('../js/store.js?case=legacy');
  assert.equal(fresh.getState().semesterId, 'legacy');
  assert.equal(fresh.getState().events.e.title, 'E');
  assert.equal(fresh.getState().classes.c1.venue, 'R1');
});

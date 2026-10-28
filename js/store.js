// Single source of truth for schedule data.
//
// Several semesters can be stored; one is "active" and is what the pages see.
// Personal events are shared across semesters.
//
// Cloud mode (Firestore):
//   users/{uid}/meta/settings              { activeSemester }
//   users/{uid}/semesters/{semId}          semester info (name, start, weeks, …)
//   users/{uid}/semesters/{semId}/{coll}/  modules · classes · exceptions · agendas · tasks
//   users/{uid}/events/{id}                personal events
// Local mode (no Firebase config): the same shape kept in localStorage, this browser only.
import { firebaseConfig } from './firebase-config.js';

export const SEM_COLLECTIONS = ['modules', 'classes', 'exceptions', 'agendas', 'tasks'];
// globalThis.SCHEDULE_LOCAL_ONLY forces local mode (used by tests).
export const mode = firebaseConfig?.apiKey && !globalThis.SCHEDULE_LOCAL_ONLY ? 'cloud' : 'local';

const CACHE_KEY = 'schedule:v2';
const LEGACY_KEY = 'schedule:data';
const blankSem = () => ({ semester: null, modules: {}, classes: {}, exceptions: {}, agendas: {}, tasks: {} });
const blankAll = () => ({ active: null, semesters: {}, events: {}, uid: null });

let all = readCache() || blankAll();
// In cloud mode only trust a cache written for a signed-in account (not leftover local-preview data).
if (mode === 'cloud' && !all.uid) all = blankAll();
let view = derive();
let phase = 'loading'; // 'loading' | 'signed-out' | 'ready'
let user = null;
let fb = null;
const subs = new Set();

/* ---------- ids + selection ---------- */

// function declarations (hoisted): readCache() uses these during module init
function slug(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function semesterIdOf(sem) {
  return sem.id || slug(sem.name) || sem.start;
}

function semesterEnd(sem) {
  const d = new Date(`${sem.start}T00:00`);
  d.setDate(d.getDate() + sem.weeks * 7 - 1);
  return d;
}

/** The wanted semester if it exists, else the one running today, else the latest. */
function resolveActive(want) {
  if (want && all.semesters[want]?.semester) return want;
  const list = listSemesters();
  if (!list.length) return null;
  const now = new Date();
  const current = list.find((s) => new Date(`${s.start}T00:00`) <= now && now <= semesterEnd(s));
  return (current || list[0]).id;
}

export function listSemesters() {
  return Object.entries(all.semesters)
    .filter(([, s]) => s.semester)
    .map(([id, s]) => ({ ...s.semester, id, end: semesterEnd(s.semester) }))
    .sort((a, b) => b.start.localeCompare(a.start));
}

/* ---------- cache ---------- */

function readCache() {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    if (s) return { ...blankAll(), ...JSON.parse(s) };
    // one-time upgrade from the single-semester format
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (old?.semester) {
      const id = semesterIdOf(old.semester);
      const { events = {}, uid = null, ...sem } = old;
      return { active: id, semesters: { [id]: { ...blankSem(), ...sem, semester: { ...sem.semester, id } } }, events, uid };
    }
  } catch {}
  return null;
}

function writeCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}

/* ---------- state + subscriptions ---------- */

function derive() {
  const s = all.semesters[all.active] || blankSem();
  return { ...blankSem(), ...s, events: all.events, semesterId: all.active };
}

let queued = false;
function emit() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    view = derive();
    if (phase !== 'signed-out') writeCache();
    for (const fn of subs) fn(view, status());
  });
}

export const getState = () => view;
export const status = () => ({ mode, phase, user, empty: !view.semester, semesterId: all.active });

export function subscribe(fn) {
  subs.add(fn);
  fn(view, status());
  return () => subs.delete(fn);
}

/* ---------- startup ---------- */

export async function start() {
  if (mode === 'local') {
    if (!listSemesters().length) {
      try {
        const r = await fetch('data/seed.json', { cache: 'no-store' });
        if (r.ok) await importSemester(await r.json());
      } catch {}
    }
    all.active = resolveActive(all.active);
    phase = 'ready';
    emit();
    return;
  }
  const { initFirebase } = await import('./firebase.js');
  fb = await initFirebase();
  fb.onAuth((u) => {
    stopListening();
    if (all.uid && u && all.uid !== u.uid) all = blankAll();
    user = u;
    if (!u) {
      all = blankAll();
      try { localStorage.removeItem(CACHE_KEY); } catch {}
      phase = 'signed-out';
      emit();
      return;
    }
    all.uid = u.uid;
    phase = derive().semester ? 'ready' : 'loading';
    emit();
    listen(u.uid);
  });
}

/* ---------- Firestore listeners ---------- */

let rootUnsubs = [];
let semUnsubs = [];
let listeningSem;
let wantActive = null;
let got = {};
let semPending = new Set();

function stopListening() {
  [...rootUnsubs, ...semUnsubs].forEach((f) => f());
  rootUnsubs = [];
  semUnsubs = [];
  listeningSem = undefined;
  got = {};
  semPending = new Set();
}

const userRef = (...path) => fb.fs.doc(fb.db, 'users', user.uid, ...path);
const userColl = (...path) => fb.fs.collection(fb.db, 'users', user.uid, ...path);
const toMap = (snap) => {
  const m = {};
  snap.forEach((d) => { m[d.id] = d.data(); });
  return m;
};

function onError(err) {
  console.error(err);
  phase = 'ready';
  emit();
}

function update() {
  if (got.settings && got.semesters && got.events && !semPending.size) phase = 'ready';
  emit();
}

function syncActive() {
  if (!got.settings || !got.semesters) return;
  const target = resolveActive(wantActive);
  if (target !== listeningSem) listenSemester(target);
  update();
}

function listen() {
  const { fs } = fb;
  rootUnsubs.push(fs.onSnapshot(userRef('meta', 'settings'), (snap) => {
    wantActive = snap.data()?.activeSemester ?? null;
    got.settings = true;
    syncActive();
  }, onError));
  rootUnsubs.push(fs.onSnapshot(userColl('semesters'), (snap) => {
    const next = {};
    snap.forEach((d) => { next[d.id] = { ...(all.semesters[d.id] || blankSem()), semester: { ...d.data(), id: d.id } }; });
    all.semesters = next;
    got.semesters = true;
    syncActive();
  }, onError));
  rootUnsubs.push(fs.onSnapshot(userColl('events'), (snap) => {
    all.events = toMap(snap);
    got.events = true;
    update();
  }, onError));
}

function listenSemester(id) {
  semUnsubs.forEach((f) => f());
  semUnsubs = [];
  listeningSem = id;
  all.active = id;
  semPending = new Set(id ? SEM_COLLECTIONS : []);
  if (!id) return;
  for (const c of SEM_COLLECTIONS) {
    semUnsubs.push(fb.fs.onSnapshot(userColl('semesters', id, c), (snap) => {
      if (!all.semesters[id]) return;
      all.semesters[id] = { ...all.semesters[id], [c]: toMap(snap) };
      semPending.delete(c);
      update();
    }, onError));
  }
}

/* ---------- writes ---------- */

/** Create or update a document in the active semester (or a personal event). */
export async function put(coll, id, data, { merge = true } = {}) {
  if (mode === 'local') {
    mutateLocal(coll, (m) => {
      m[id] = merge && m[id] ? { ...m[id], ...data } : data;
    });
    return;
  }
  const ref = coll === 'events' ? userRef('events', id) : userRef('semesters', all.active, coll, id);
  await fb.fs.setDoc(ref, data, { merge });
}

export async function remove(coll, id) {
  if (mode === 'local') {
    mutateLocal(coll, (m) => { delete m[id]; });
    return;
  }
  const ref = coll === 'events' ? userRef('events', id) : userRef('semesters', all.active, coll, id);
  await fb.fs.deleteDoc(ref);
}

function mutateLocal(coll, fn) {
  if (coll === 'events') {
    const m = { ...all.events };
    fn(m);
    all.events = m;
  } else {
    const sem = all.semesters[all.active];
    if (!sem) throw new Error('No semester selected');
    const m = { ...sem[coll] };
    fn(m);
    all.semesters = { ...all.semesters, [all.active]: { ...sem, [coll]: m } };
  }
  emit();
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Run Firestore write ops in batches (max 500 per batch). */
async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = fb.fs.writeBatch(fb.db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function semesterDocIds(id) {
  const out = {};
  for (const c of SEM_COLLECTIONS) {
    const snap = await fb.fs.getDocs(userColl('semesters', id, c));
    out[c] = snap.docs.map((d) => d.id);
  }
  return out;
}

/* ---------- semesters ---------- */

/**
 * Inspect a JSON file before importing it.
 * → { kind: 'semester', id, name, exists } | { kind: 'backup', count }
 */
export function describeImport(json) {
  if (json?.version === 2 && json.semesters && typeof json.semesters === 'object') {
    return { kind: 'backup', count: Object.keys(json.semesters).length };
  }
  if (!json?.semester?.start || !json.semester.weeks || typeof json.classes !== 'object') {
    throw new Error('That file does not look like schedule data.');
  }
  const id = semesterIdOf(json.semester);
  return { kind: 'semester', id, name: json.semester.name || id, exists: !!all.semesters[id]?.semester };
}

/** Add (or replace) one semester from a seed/semester file and make it active. */
export async function importSemester(json) {
  const { id } = describeImport(json);
  const sem = { ...blankSem() };
  for (const c of SEM_COLLECTIONS) sem[c] = json[c] || {};
  sem.semester = { ...json.semester, id };
  const events = json.events || {};

  if (mode === 'local') {
    all.semesters = { ...all.semesters, [id]: sem };
    all.events = { ...all.events, ...events };
    all.active = id;
    emit();
    return id;
  }
  const existing = all.semesters[id]?.semester ? await semesterDocIds(id) : {};
  const ops = [(b) => b.set(userRef('semesters', id), sem.semester)];
  for (const c of SEM_COLLECTIONS) {
    for (const docId of existing[c] || []) if (!(docId in sem[c])) ops.push((b) => b.delete(userRef('semesters', id, c, docId)));
    for (const [docId, d] of Object.entries(sem[c])) ops.push((b) => b.set(userRef('semesters', id, c, docId), d));
  }
  for (const [docId, e] of Object.entries(events)) ops.push((b) => b.set(userRef('events', docId), e));
  ops.push((b) => b.set(userRef('meta', 'settings'), { activeSemester: id }, { merge: true }));
  await commit(ops);
  return id;
}

/** Restore a full backup made by exportData(). Semesters with the same id are replaced. */
export async function restoreBackup(json) {
  for (const s of Object.values(json.semesters)) await importSemester({ ...s, events: {} });
  if (mode === 'local') {
    all.events = { ...all.events, ...(json.events || {}) };
  } else {
    await commit(Object.entries(json.events || {}).map(([id, e]) => (b) => b.set(userRef('events', id), e)));
  }
  if (json.active && json.semesters[json.active]) await setActiveSemester(json.active);
  else emit();
}

export async function setActiveSemester(id) {
  if (!all.semesters[id]?.semester) return;
  if (mode === 'local') {
    all.active = id;
    emit();
    return;
  }
  wantActive = id;
  syncActive();
  await fb.fs.setDoc(userRef('meta', 'settings'), { activeSemester: id }, { merge: true });
}

export async function deleteSemester(id) {
  const wasActive = all.active === id;
  if (mode === 'local') {
    const { [id]: _gone, ...rest } = all.semesters;
    all.semesters = rest;
    if (wasActive) all.active = resolveActive(null);
    emit();
    return;
  }
  const ids = await semesterDocIds(id);
  const ops = [];
  for (const c of SEM_COLLECTIONS) for (const docId of ids[c]) ops.push((b) => b.delete(userRef('semesters', id, c, docId)));
  ops.push((b) => b.delete(userRef('semesters', id)));
  await commit(ops);
  if (wasActive) {
    const next = listSemesters().find((s) => s.id !== id)?.id ?? null;
    await fb.fs.setDoc(userRef('meta', 'settings'), { activeSemester: next }, { merge: true });
  }
}

/** Full backup: every semester plus personal events. */
export async function exportData() {
  const out = { version: 2, active: all.active, semesters: {}, events: all.events };
  for (const s of listSemesters()) {
    let sem = all.semesters[s.id];
    if (mode === 'cloud' && s.id !== all.active) {
      sem = { semester: sem.semester };
      for (const c of SEM_COLLECTIONS) sem[c] = toMap(await fb.fs.getDocs(userColl('semesters', s.id, c)));
    }
    out.semesters[s.id] = sem;
  }
  return JSON.stringify(out, null, 2);
}

export const signIn = () => fb.signIn();
export const signOut = () => fb.signOut();

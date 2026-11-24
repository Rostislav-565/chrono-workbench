import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createInitialData, loadData, localDate, parseBackup, storageKey } from '../src/data.ts';
import { createJsonBackup } from '../src/export.ts';
import { createDemoData } from './fixtures.ts';

function withSavedData(value: unknown, run: () => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => { assert.equal(key, storageKey); return typeof value === 'string' ? value : JSON.stringify(value); } } });
  try { run(); } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); }
}

test('initial state is an empty workbench ready for a fresh 25-minute focus', () => {
  const data = createInitialData();
  assert.deepEqual(data.tasks, []); assert.deepEqual(data.notes, []); assert.deepEqual(data.sessions, []);
  assert.equal(data.activeTaskId, null); assert.equal(data.demoCleared, true);
  assert.deepEqual(data.timer, { mode: 'pomodoro', phase: 'work', status: 'idle', elapsed: 0, startedAt: null, duration: 1500, earnedBreak: 0, accounted: 0 });
  assert.equal(data.sound.enabled, false);
});

test('missing or malformed storage opens an empty workbench without regenerating demo data', () => {
  for (const value of [undefined, '', '{broken', '{"version":2}']) withSavedData(value, () => assert.deepEqual(loadData(), createInitialData()));
});

test('fresh initial state objects do not share mutable settings or data with another instance', () => {
  const first = createInitialData(); const second = createInitialData();
  first.tasks.push(createDemoData().tasks[0]); first.notes.push({ id: 'note', text: 'Thought', createdAt: 0 });
  first.sound.enabled = true; first.timer.elapsed = 120;
  assert.deepEqual(second, createInitialData());
});

test('explicit demo fixture fits prior 59 local dates and preserves empty real statistics', () => {
  const data = createDemoData();
  const start = new Date(); start.setDate(start.getDate() - 59);
  assert.equal(data.tasks.filter(task => task.tier === 'main').length, 1);
  assert.equal(data.tasks.filter(task => task.tier === 'medium').length, 2);
  assert.equal(data.tasks.filter(task => task.tier === 'small').length, 2);
  assert(data.sessions.length > 50);
  assert(data.sessions.every(session => session.demo && session.date >= localDate(start) && session.date < localDate() && session.seconds > 0));
});

test('saved empty lists stay empty, and clear demo does not regenerate samples', () => {
  const saved = createInitialData();
  withSavedData(saved, () => {
    const data = loadData();
    assert.deepEqual(data.tasks, []); assert.deepEqual(data.notes, []); assert.deepEqual(data.sessions, []);
    assert.equal(data.demoCleared, true); assert.equal(data.activeTaskId, null);
    assert.deepEqual(data, saved);
  });
});

test('backup parser accepts clean and populated version-one backups and normalizes optional fields', () => {
  assert.deepEqual(parseBackup(JSON.stringify(createInitialData())), createInitialData());
  const saved = createDemoData();
  const restored = parseBackup(JSON.stringify({ ...saved, energy: 100, sound: { ...saved.sound, white: -50 } }));
  assert.deepEqual(restored.tasks, saved.tasks); assert.deepEqual(restored.sessions, saved.sessions);
  assert.equal(restored.energy, 5); assert.equal(restored.sound.white, 0);
  assert.equal(restored.activeTaskId, saved.activeTaskId);
});

test('backup import rejects malformed JSON, unsupported versions and missing or invalid collections', () => {
  for (const raw of ['', '{broken', 'null', '[]', '"not a backup"', '{}', '{"version":2,"tasks":[],"notes":[],"sessions":[]}', '{"version":"1","tasks":[],"notes":[],"sessions":[]}', '{"version":1,"tasks":[],"notes":[]}', '{"version":1,"tasks":[],"notes":[],"sessions":null}', '{"version":1,"tasks":{},"notes":[],"sessions":[]}']) {
    assert.throws(() => parseBackup(raw), /JSON|CHRONO-WORKBENCH/);
  }
});

test('exported JSON restores tasks, steps, notes, settings and accounting without exporting metadata into app state', () => {
  const saved = createDemoData();
  saved.theme = 'dark'; saved.energy = 2; saved.sound = { white: 12, brown: 34, gamma: 56, enabled: true, clicks: false };
  saved.tasks[0].steps[0].done = true;
  saved.notes = [{ id: 'personal-note', text: 'Личная мысль "дома"\nвторая строка', createdAt: 123456 }];
  saved.timer = { ...saved.timer, status: 'paused', elapsed: 75, accounted: 20 };
  const raw = createJsonBackup(saved, new Date('2026-11-25T00:00:00Z'));
  assert.equal(JSON.parse(raw).exportedAt, '2026-11-25T00:00:00.000Z');
  const restored = parseBackup(raw);
  assert.deepEqual(restored, saved);
  assert.equal('exportedAt' in restored, false);
});

test('invalid storage recovers and settings clamp to usable ranges', () => {
  withSavedData('{broken', () => assert.equal(loadData().version, 1));
  withSavedData({ ...createInitialData(), energy: 100, sound: { white: 101, brown: -20, gamma: 50, enabled: true, clicks: false }, timer: { status: 'running', startedAt: null, duration: 0 } }, () => {
    const data = loadData();
    assert.equal(data.energy, 5); assert.equal(data.sound.white, 100); assert.equal(data.sound.brown, 0);
    assert.equal(data.sound.gamma, 50); assert.equal(data.sound.enabled, true); assert.equal(data.sound.clicks, false);
    assert.equal(data.timer.status, 'paused'); assert.equal(data.timer.duration, 1);
  });
});

test('task storage deduplicates identities and enforces 1–3–5 capacity', () => {
  const initial = createDemoData();
  const extras = Array.from({ length: 20 }, (_, index) => ({ ...initial.tasks[0], id: `extra-${index}` }));
  withSavedData({ ...initial, tasks: [...initial.tasks, ...initial.tasks, ...extras] }, () => assert.equal(loadData().tasks.length, 5));
});

test('running accounted segments survive reload against wall-clock elapsed', () => {
  const initial = createInitialData();
  const timer = { ...initial.timer, mode: 'flow', status: 'running', elapsed: 10, startedAt: Date.now() - 120000, accounted: 100 };
  withSavedData({ ...initial, timer }, () => assert.equal(loadData().timer.accounted, 100));
  withSavedData({ ...initial, timer: { ...timer, mode: 'pomodoro', elapsed: 1500, accounted: 8000 } }, () => assert.equal(loadData().timer.accounted, 1500));
  withSavedData({ ...initial, timer: { ...timer, phase: 'break', accounted: 100 } }, () => assert.equal(loadData().timer.accounted, 0));
});

test('invalid or duplicate nested records do not inflate statistics or share checkbox identities', () => {
  const initial = createDemoData();
  const task = { ...initial.tasks[0], steps: [{ id: 's', text: ' ', done: false }, { id: 's', text: 'Первый шаг', done: true }, { id: 's', text: 'Дубликат', done: false }] };
  const session = { id: 'real', date: '2024-02-29', seconds: 60, mode: 'flow', task: 'Реальная сессия' };
  withSavedData({ ...initial, tasks: [task], notes: [{ id: 'n', text: '' }, { id: 'n', text: 'Мысль', createdAt: 0 }, { id: 'n', text: 'Дубликат', createdAt: 1 }], sessions: [{ ...session, date: '2026-02-29' }, session, session, { ...session, id: 'bad-month', date: '2026-13-01' }, { ...session, id: 'bad-day', date: '2026-02-31' }, { ...session, id: 'zero', seconds: 0 }] }, () => {
    const data = loadData();
    assert.deepEqual(data.tasks[0].steps, [{ id: 's', text: 'Первый шаг', done: true }]);
    assert.deepEqual(data.notes, [{ id: 'n', text: 'Мысль', createdAt: 0 }]);
    assert.equal(data.sessions.length, 1); assert.equal(data.sessions[0].date, '2024-02-29');
  });
});

test('fractional Flow break duration survives reload while corrupt timestamps are normalized', context => {
  const now = 1806062400000;
  context.mock.method(Date, 'now', () => now);
  const initial = createInitialData();
  withSavedData({ ...initial, timer: { ...initial.timer, mode: 'flow', phase: 'break', duration: 0.1, earnedBreak: 0.1, elapsed: 50, startedAt: now + 30000, status: 'running' }, notes: [{ id: 'future', text: 'Мысль', createdAt: 1e30 }] }, () => {
    const data = loadData();
    assert.equal(data.timer.duration, 0.1); assert.equal(data.timer.earnedBreak, 0.1);
    assert.equal(data.timer.elapsed, 0.1); assert.equal(data.timer.startedAt, now); assert.equal(data.notes[0].createdAt, now);
  });
  withSavedData({ ...initial, timer: { ...initial.timer, status: 'running', startedAt: -1e30 } }, () => {
    assert.equal(loadData().timer.status, 'paused'); assert.equal(loadData().timer.startedAt, null);
  });
});

test('unavailable localStorage and unsupported saved shapes recover without crashing', () => {
  for (const value of ['null', '[]', '{"version":2}', '{"version":1,"tasks":null,"sessions":{}}']) withSavedData(value, () => {
    assert.equal(loadData().version, 1);
    assert(Array.isArray(loadData().tasks));
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try { assert.equal(loadData().version, 1); } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('activity map uses 60 unique local calendar days across timezones and daylight saving boundaries', () => {
  const scenarios = [
    { zone: 'Europe/Saratov', instant: '2026-11-24T21:30:00Z', first: '2026-09-27', last: '2026-11-25', min: 24, max: 24 },
    { zone: 'America/Los_Angeles', instant: '2026-11-25T01:30:00Z', first: '2026-09-26', last: '2026-11-24', min: 24, max: 25 },
    { zone: 'America/New_York', instant: '2026-03-09T03:30:00Z', first: '2026-01-08', last: '2026-03-08', min: 23, max: 24 },
    { zone: 'Europe/Berlin', instant: '2026-03-29T22:30:00Z', first: '2026-01-30', last: '2026-03-30', min: 23, max: 24 },
    { zone: 'America/New_York', instant: '2026-11-02T04:30:00Z', first: '2026-09-03', last: '2026-11-01', min: 24, max: 25 }
  ];
  for (const scenario of scenarios) {
    const source = `import { activityDays } from ${JSON.stringify(new URL('../src/data.ts', import.meta.url).href)};
      import { createDemoData } from ${JSON.stringify(new URL('./fixtures.ts', import.meta.url).href)};
      const now = new Date(${JSON.stringify(scenario.instant)});
      const days = activityDays(now);
      const gaps = days.slice(1).map((day,index) => (day.date - days[index].date) / 3600000);
      console.log(JSON.stringify({keys:days.map(day=>day.key),min:Math.min(...gaps),max:Math.max(...gaps),demo:createDemoData(now).sessions.map(session=>session.date)}));`;
    const result = JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], { env: { ...process.env, TZ: scenario.zone }, encoding: 'utf8' }));
    assert.equal(result.keys.length, 60, scenario.zone); assert.equal(new Set(result.keys).size, 60, scenario.zone);
    assert.equal(result.keys[0], scenario.first, scenario.zone); assert.equal(result.keys[59], scenario.last, scenario.zone);
    assert.equal(result.min, scenario.min, scenario.zone); assert.equal(result.max, scenario.max, scenario.zone);
    assert(result.demo.every((date: string) => date >= scenario.first && date < scenario.last), scenario.zone);
  }
});

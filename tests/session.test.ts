import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppData, TimerState } from '../src/types.ts';
import { initialTimer, toggleTimer, finishPhase, elapsedSeconds } from '../src/timer.ts';
import { splitFocusInterval, pendingFocusSegments, pendingFocusSecondsForDate, recordFocus } from '../src/session.ts';

const at = (day: number, hours = 0, minutes = 0, seconds = 0) => new Date(2026, 10, day, hours, minutes, seconds).getTime();
function fixture(timer: TimerState): AppData {
  return { version: 1, theme: 'light', energy: 4, tasks: [{ id: 'task-a', text: 'Задача А', tier: 'main', done: false, steps: [], expanded: false }], notes: [], sessions: [], sound: { white: 0, brown: 0, gamma: 0, clicks: false, enabled: false }, activeTaskId: 'task-a', timer, demoCleared: true };
}

test('a midnight crossing assigns only actual work to each local date', () => {
  const timer = toggleTimer(initialTimer('flow'), at(24, 23, 50));
  const parts = pendingFocusSegments(timer, at(25, 0, 20));
  assert.deepEqual(parts, [{ date: '2026-11-24', seconds: 600 }, { date: '2026-11-25', seconds: 1200 }]);
  assert.equal(pendingFocusSecondsForDate(timer, '2026-11-25', at(25, 0, 20)), 1200);
  const saved = recordFocus(fixture(timer), at(25, 0, 20));
  assert.equal(saved.sessions.length, 2);
  assert.equal(saved.sessions.reduce((sum, item) => sum + item.seconds, 0), 1800);
  assert.equal(saved.timer.accounted, 1800);
  assert(saved.sessions.every(item => item.task === 'Задача А' && item.mode === 'flow' && item.id));
  assert.strictEqual(recordFocus(saved, at(25, 0, 20)), saved);
});

test('late background completion ends at the Pomodoro deadline, not wakeup time', () => {
  const timer = toggleTimer(initialTimer(), at(24, 23, 30));
  const saved = recordFocus(fixture(timer), at(26, 8));
  assert.deepEqual(saved.sessions.map(({ date, seconds }) => ({ date, seconds })), [{ date: '2026-11-24', seconds: 1500 }]);
  const completed = { ...saved, timer: finishPhase(saved.timer, at(26, 8)).timer };
  assert.strictEqual(recordFocus(completed, at(27, 8)), completed);
  assert.equal(pendingFocusSecondsForDate(timer, '2026-11-26', at(26, 8)), 0);
});

test('a full Pomodoro straddling midnight is split exactly once even after reload', () => {
  const timer = toggleTimer(initialTimer(), at(24, 23, 50));
  const checkpoint = recordFocus(fixture(timer), at(24, 23, 55));
  const reloaded: AppData = JSON.parse(JSON.stringify(checkpoint));
  const final = recordFocus(reloaded, at(25, 4));
  assert.deepEqual(final.sessions.map(({ date, seconds }) => ({ date, seconds })), [
    { date: '2026-11-24', seconds: 300 }, { date: '2026-11-24', seconds: 300 }, { date: '2026-11-25', seconds: 900 }
  ]);
  assert.equal(final.sessions.reduce((sum, item) => sum + item.seconds, 0), 1500);
  assert.strictEqual(recordFocus(final, at(26, 4)), final);
});

test('checkpointing before pause excludes multi-day pauses from both dates and duration', () => {
  let data = fixture(toggleTimer(initialTimer('flow'), at(24, 23, 50)));
  data = recordFocus(data, at(24, 23, 55));
  data.timer = toggleTimer(data.timer, at(24, 23, 55));
  assert.deepEqual(pendingFocusSegments(data.timer, at(26, 8)), []);
  data.timer = toggleTimer(data.timer, at(26, 8));
  data = recordFocus(data, at(26, 8, 10));
  assert.deepEqual(data.sessions.map(({ date, seconds }) => ({ date, seconds })), [{ date: '2026-11-24', seconds: 300 }, { date: '2026-11-26', seconds: 600 }]);
  assert.equal(elapsedSeconds(data.timer, at(26, 8, 10)), 900);
});

test('switching tasks and deleting active task preserve segment labels and total time', () => {
  let data = fixture(toggleTimer(initialTimer('flow'), at(24, 10)));
  data = recordFocus(data, at(24, 10, 5));
  data = { ...data, activeTaskId: 'task-b', tasks: [...data.tasks, { ...data.tasks[0], id: 'task-b', text: 'Задача Б', tier: 'medium' }] };
  data = recordFocus(data, at(24, 10, 10));
  data = { ...data, activeTaskId: null, tasks: data.tasks.filter(task => task.id !== 'task-b') };
  data = recordFocus(data, at(24, 10, 20));
  assert.deepEqual(data.sessions.map(({ task, seconds }) => ({ task, seconds })), [{ task: 'Задача А', seconds: 300 }, { task: 'Задача Б', seconds: 300 }, { task: 'Свободный фокус', seconds: 600 }]);
  assert.equal(elapsedSeconds(data.timer, at(24, 10, 20)), 1200);
});

test('exact midnight endpoints do not create empty next-day entries', () => {
  assert.deepEqual(splitFocusInterval(at(24, 23, 59), at(25)), [{ date: '2026-11-24', seconds: 60 }]);
  assert.deepEqual(splitFocusInterval(at(25), at(25, 0, 1)), [{ date: '2026-11-25', seconds: 60 }]);
  assert.deepEqual(splitFocusInterval(at(25), at(25)), []);
});

test('multi-day intervals conserve exact duration across many checkpoints', () => {
  const timer = toggleTimer(initialTimer('flow'), at(1, 22, 11, 13));
  let data = fixture(timer);
  let clock = timer.startedAt!;
  for (let index = 1; index <= 100; index++) {
    clock += (10000 + index * 23) * 1000;
    data = recordFocus(data, clock);
    assert.equal(data.sessions.reduce((sum, item) => sum + item.seconds, 0), (clock - timer.startedAt!) / 1000);
    assert.deepEqual(pendingFocusSegments(data.timer, clock), []);
  }
});

test('malformed or reversed intervals do not create phantom sessions', () => {
  assert.deepEqual(splitFocusInterval(NaN, at(24)), []);
  assert.deepEqual(splitFocusInterval(at(25), at(24)), []);
  assert.deepEqual(splitFocusInterval(-Infinity, at(24)), []);
  assert.deepEqual(splitFocusInterval(-Number.MAX_VALUE, at(24)), []);
});

test('local day splitting respects daylight-saving days instead of assuming 24 hours', t => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const springStart = new Date(2026, 2, 8).getTime();
    const springEnd = new Date(2026, 2, 9).getTime();
    if ((springEnd - springStart) / 3600000 !== 23) { t.skip('Host does not apply runtime TZ changes'); return; }
    assert.deepEqual(splitFocusInterval(springStart, springEnd), [{ date: '2026-03-08', seconds: 23 * 3600 }]);
    assert.deepEqual(splitFocusInterval(new Date(2026, 10, 1).getTime(), new Date(2026, 10, 2).getTime()), [{ date: '2026-11-01', seconds: 25 * 3600 }]);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

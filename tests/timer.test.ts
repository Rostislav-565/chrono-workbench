import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialTimer, elapsedSeconds, unrecordedSeconds, accountWork, toggleTimer, changeMode, beginBreak, finishPhase, formatTime } from '../src/timer.ts';

test('timer counts wall-clock time and excludes time spent paused', () => {
  let timer = toggleTimer(initialTimer(), 1000);
  assert.equal(elapsedSeconds(timer, 61500), 60.5);
  timer = toggleTimer(timer, 61500);
  assert.equal(timer.status, 'paused');
  assert.equal(timer.startedAt, null);
  assert.equal(elapsedSeconds(timer, 400000), 60.5);
  timer = toggleTimer(timer, 400000);
  assert.equal(elapsedSeconds(timer, 405500), 66);
});

test('background timer cannot overcount a Pomodoro or award extra breaks', () => {
  const timer = toggleTimer(initialTimer(), 1000);
  assert.equal(elapsedSeconds(timer, 7201000), 1500);
  const completed = finishPhase(timer, 7201000);
  assert.equal(completed.workSeconds, 1500);
  assert.equal(completed.timer.phase, 'break');
  assert.equal(completed.timer.status, 'idle');
  assert.equal(completed.timer.duration, 300);
  assert.equal(finishPhase(completed.timer, 9000000).workSeconds, 0);
});

test('finishing a break returns to idle work without recording work', () => {
  const work = toggleTimer(initialTimer(), 0);
  const readyBreak = finishPhase(work, 1500000).timer;
  const runningBreak = toggleTimer(readyBreak, 1600000);
  const completed = finishPhase(runningBreak, 1900000);
  assert.deepEqual(completed, { timer: initialTimer(), workSeconds: 0 });
});

test('an unfinished phase does not transition', () => {
  const timer = toggleTimer(initialTimer(), 1000);
  assert.strictEqual(finishPhase(timer, 61000).timer, timer);
  assert.equal(finishPhase(timer, 61000).workSeconds, 0);
});

test('Flowmodoro counts indefinitely and earns precisely one fifth of work', () => {
  const timer = toggleTimer(initialTimer('flow'), 1000);
  assert.equal(elapsedSeconds(timer, 12001000), 12000);
  assert.strictEqual(finishPhase(timer, 12001000).timer, timer);
  const rest = beginBreak(timer, 12001000);
  assert.equal(rest.workSeconds, 12000);
  assert.equal(rest.timer.duration, 2400);
  assert.equal(rest.timer.earnedBreak, 2400);
  assert.equal(rest.timer.status, 'running');
  assert.equal(rest.timer.startedAt, 12001000);
  assert.equal(beginBreak(rest.timer, 12002000).workSeconds, 0);
});

test('manual Pomodoro rest records only actual work and grants five minutes', () => {
  const work = toggleTimer(initialTimer(), 1000);
  const rest = beginBreak(work, 121000);
  assert.equal(rest.workSeconds, 120);
  assert.equal(rest.timer.duration, 300);
});

test('zero work cannot earn rest and short flow work uses the exact one-fifth formula', () => {
  const idle = initialTimer('flow');
  assert.strictEqual(beginBreak(idle, 1000).timer, idle);
  const short = beginBreak(toggleTimer(idle, 1000), 1500);
  assert.equal(short.workSeconds, 0.5);
  assert.equal(short.timer.duration, 0.1);
});

test('flow break completion restores flow mode and mode changes reset timing', () => {
  const work = toggleTimer(initialTimer('flow'), 0);
  const rest = beginBreak(work, 100000);
  assert.deepEqual(finishPhase(rest.timer, 120000), { timer: initialTimer('flow'), workSeconds: 0 });
  assert.deepEqual(changeMode(work, 'pomodoro'), initialTimer());
});

test('timer tolerates clocks moving backward without producing negative time', () => {
  const work = toggleTimer(initialTimer(), 5000);
  assert.equal(elapsedSeconds(work, 1000), 0);
});

test('display is padded, preserves last partial second and supports long flows', () => {
  assert.equal(formatTime(1500), '25:00');
  assert.equal(formatTime(0.1), '00:01');
  assert.equal(formatTime(-10), '00:00');
  assert.equal(formatTime(3601), '01:00:01');
  assert.equal(formatTime(Number.NaN), '00:00');
});

test('switching tasks preserves full flow duration and only records new segments', () => {
  const started = toggleTimer(initialTimer('flow'), 0);
  const firstTask = accountWork(started, elapsedSeconds(started, 300000));
  assert.equal(firstTask.workSeconds, 300);
  assert.equal(firstTask.timer.elapsed, 0);
  assert.equal(firstTask.timer.startedAt, 0);
  assert.equal(unrecordedSeconds(firstTask.timer, 450000), 150);
  const secondTask = accountWork(firstTask.timer, elapsedSeconds(firstTask.timer, 600000));
  assert.equal(secondTask.workSeconds, 300);
  const rest = beginBreak(secondTask.timer, 900000);
  const lastTask = accountWork(secondTask.timer, rest.workSeconds);
  assert.equal(lastTask.workSeconds, 300);
  assert.equal(firstTask.workSeconds + secondTask.workSeconds + lastTask.workSeconds, 900);
  assert.equal(rest.timer.duration, 180);
  assert.equal(rest.timer.accounted, 0);
  assert.equal(unrecordedSeconds(rest.timer, 1000000), 0);
});

test('task switches preserve Pomodoro deadline and final accounting totals 25 minutes', () => {
  const started = toggleTimer(initialTimer(), 0);
  const firstTask = accountWork(started, elapsedSeconds(started, 600000));
  assert.equal(firstTask.timer.duration, 1500);
  const result = finishPhase(firstTask.timer, 1500000);
  const finalSegment = accountWork(firstTask.timer, result.workSeconds);
  assert.equal(firstTask.workSeconds, 600);
  assert.equal(finalSegment.workSeconds, 900);
  assert.equal(result.timer.phase, 'break');
  assert.equal(result.timer.accounted, 0);
});

test('a paused or repeated checkpoint never records the same work twice', () => {
  const started = toggleTimer(initialTimer('flow'), 0);
  const paused = toggleTimer(started, 120000);
  const first = accountWork(paused, elapsedSeconds(paused, 400000));
  const repeated = accountWork(first.timer, elapsedSeconds(first.timer, 600000));
  assert.equal(first.workSeconds, 120);
  assert.equal(repeated.workSeconds, 0);
  assert.equal(unrecordedSeconds(repeated.timer, 700000), 0);
  const resumed = toggleTimer(repeated.timer, 800000);
  assert.equal(unrecordedSeconds(resumed, 860000), 60);
});

test('sub-second segments are retained rather than lost to rounding', () => {
  const started = toggleTimer(initialTimer('flow'), 0);
  const first = accountWork(started, 0.4);
  const second = accountWork(first.timer, 1);
  assert.equal(first.workSeconds, 0.4);
  assert.equal(second.workSeconds, 0.6);
  assert.equal(first.workSeconds + second.workSeconds, 1);
});

test('an expired paused timer can settle without another running tick', () => {
  const started = toggleTimer(initialTimer(), 1000);
  const paused = toggleTimer(started, 1501000);
  assert.equal(paused.status, 'paused');
  assert.equal(finishPhase(paused, 1600000).timer.phase, 'break');
  const breakStarted = toggleTimer(finishPhase(paused, 1600000).timer, 2000000);
  const breakPaused = toggleTimer(breakStarted, 2300000);
  assert.deepEqual(finishPhase(breakPaused, 2400000), { timer: initialTimer(), workSeconds: 0 });
});

test('rest completes precisely at fractional deadline and never before', () => {
  const started = toggleTimer(initialTimer('flow'), 0);
  const rest = beginBreak(started, 6000);
  assert.equal(rest.timer.duration, 1.2);
  assert.strictEqual(finishPhase(rest.timer, 7199).timer, rest.timer);
  assert.equal(finishPhase(rest.timer, 7200).timer.phase, 'work');
});

test('checkpoint is monotonic and cannot exceed Pomodoro duration or accept nonfinite totals', () => {
  const first = accountWork(initialTimer(), 600);
  assert.equal(accountWork(first.timer, 300).workSeconds, 0);
  assert.equal(accountWork(first.timer, 300).timer.accounted, 600);
  assert.equal(accountWork(first.timer, Infinity).workSeconds, 0);
  assert.equal(accountWork(first.timer, NaN).workSeconds, 0);
  assert.equal(accountWork(first.timer, 9000).workSeconds, 900);
  assert.equal(accountWork(first.timer, 9000).timer.accounted, 1500);
});

test('flow with many pauses, checkpoints, and reloads conserves all worked seconds', () => {
  let timer = initialTimer('flow');
  let clock = 1000;
  let expected = 0;
  let recorded = 0;
  for (let iteration = 1; iteration <= 100; iteration++) {
    timer = toggleTimer(timer, clock);
    const seconds = iteration * 7.25;
    clock += seconds * 1000;
    expected += seconds;
    const checkpoint = accountWork(timer, elapsedSeconds(timer, clock));
    recorded += checkpoint.workSeconds;
    timer = toggleTimer(checkpoint.timer, clock);
    clock += iteration * 12345;
    timer = JSON.parse(JSON.stringify(timer));
    assert.equal(elapsedSeconds(timer, clock), expected);
    assert.equal(unrecordedSeconds(timer, clock), 0);
  }
  assert.equal(recorded, expected);
  assert.equal(beginBreak(timer, clock).timer.duration, expected / 5);
});

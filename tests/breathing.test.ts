import test from 'node:test';
import assert from 'node:assert/strict';
import { breathingState, startBreathingSession } from '../src/breathing-timing.ts';

function fixture() {
  let time = 100_000;
  let nextId = 0;
  let muted = false;
  const callbacks = new Map<number, () => void>();
  const updates: number[] = [];
  const cues: number[] = [];
  const clock = {
    now: () => time,
    schedule: (callback: () => void, milliseconds: number) => { assert.equal(milliseconds, 50); callbacks.set(++nextId, callback); return nextId; },
    cancel: (id: number) => { callbacks.delete(id); }
  };
  return {
    updates, cues, callbacks,
    start: () => startBreathingSession({ clock, onUpdate: value => updates.push(value), onCue: frequency => cues.push(frequency), isMuted: () => muted }),
    advance: (milliseconds: number) => { time += milliseconds; [...callbacks.values()].forEach(callback => callback()); },
    mute: (value: boolean) => { muted = value; }
  };
}

test('box breathing changes phases exactly at 4–4–4–4 second boundaries', () => {
  assert.deepEqual([0, 3.999, 4, 7.999, 8, 11.999, 12, 15.999, 16].map(seconds => breathingState(seconds).phase.title), ['Вдох', 'Вдох', 'Задержка', 'Задержка', 'Выдох', 'Выдох', 'Пауза', 'Пауза', 'Вдох']);
  assert.deepEqual([0, 1, 2, 3, 4].map(seconds => breathingState(seconds).phaseRemaining), [4, 3, 2, 1, 4]);
});

test('the engineering indicator expands, holds, contracts, and pauses without jumps', () => {
  assert.deepEqual([0, 2, 4, 6, 8, 10, 12, 14, 16].map(seconds => Number(breathingState(seconds).scale.toFixed(2))), [0.7, 0.85, 1, 1, 1, 0.85, 0.7, 0.7, 0.7]);
  for (const boundary of [4, 8, 12, 16]) assert.ok(Math.abs(breathingState(boundary - 0.001).scale - breathingState(boundary).scale) < 0.001);
});

test('the exercise lasts exactly 60 seconds and ends after the final exhale', () => {
  assert.equal(breathingState(59.999).finished, false);
  assert.equal(breathingState(59.999).phase.title, 'Выдох');
  const finished = breathingState(60);
  assert.equal(finished.finished, true);
  assert.equal(finished.remaining, 0);
  assert.equal(finished.frequency, 523.25);
  assert.equal(breathingState(3600).elapsed, 60);
  assert.equal(breathingState(-5).elapsed, 0);
  assert.equal(breathingState(NaN).elapsed, 0);
});

test('a throttled or backgrounded timer catches up by elapsed time and finishes once', () => {
  const f = fixture();
  f.start();
  f.advance(50);
  f.advance(60_500);
  assert.deepEqual(f.updates, [0, 0.05, 60]);
  assert.deepEqual(f.cues, [392, 523.25]);
  assert.equal(f.callbacks.size, 0);
  f.advance(100_000);
  assert.equal(f.cues.length, 2);
});

test('phase tones occur once per transition and muting suppresses only sound', () => {
  const f = fixture();
  f.start();
  f.advance(50);
  f.advance(50);
  f.advance(3900);
  assert.deepEqual(f.cues, [392, 440]);
  f.mute(true);
  f.advance(4000);
  assert.equal(f.updates.at(-1), 8);
  assert.deepEqual(f.cues, [392, 440]);
  f.mute(false);
  f.advance(4000);
  assert.deepEqual(f.cues, [392, 440, 294]);
});

test('StrictMode setup-cleanup-setup does not double timers or the opening cue', () => {
  const f = fixture();
  const cleanupFirst = f.start();
  cleanupFirst();
  const cleanupSecond = f.start();
  assert.equal(f.callbacks.size, 1);
  f.advance(50);
  assert.deepEqual(f.cues, [392]);
  cleanupSecond();
  assert.equal(f.callbacks.size, 0);
});

test('closing stops updates even if a callback was already queued; reopening starts at zero', () => {
  const f = fixture();
  const stop = f.start();
  f.advance(2000);
  const queued = [...f.callbacks.values()][0];
  stop();
  queued();
  assert.deepEqual(f.updates, [0, 2]);
  f.advance(5000);
  f.start();
  assert.equal(f.updates.at(-1), 0);
  f.advance(1000);
  assert.equal(f.updates.at(-1), 1);
});

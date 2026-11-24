import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../src/audio.ts';
import type { SoundSettings } from '../src/types.ts';

class Parameter {
  value = 0;
  events: { type: string; value: number; time: number; constant?: number }[] = [];
  setTargetAtTime(value: number, time: number, constant: number) { this.value = value; this.events.push({ type: 'target', value, time, constant }); }
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: 'set', value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: 'linear', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ type: 'exponential', value, time }); }
}
class AudioNodeMock {
  connections: { node: AudioNodeMock; output: number; input: number }[] = [];
  disconnected = false;
  connect(node: AudioNodeMock, output = 0, input = 0) { this.connections.push({ node, output, input }); return node; }
  disconnect() { this.disconnected = true; }
}
class BufferMock {
  data: Float32Array[];
  constructor(publicChannels: number, publicLength: number, publicSampleRate: number) {
    this.numberOfChannels = publicChannels; this.length = publicLength; this.sampleRate = publicSampleRate;
    this.data = Array.from({ length: publicChannels }, () => new Float32Array(publicLength));
  }
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number) { return this.data[channel]; }
}
class SourceMock extends AudioNodeMock {
  buffer: BufferMock | null = null;
  loop = false;
  started: number[] = [];
  stopped: number[] = [];
  onended: (() => void) | null = null;
  start(time = 0) { this.started.push(time); }
  stop(time = 0) { this.stopped.push(time); }
}
class OscillatorMock extends SourceMock { frequency = new Parameter(); type = ''; }
class GainMock extends AudioNodeMock { gain = new Parameter(); }
class FilterMock extends AudioNodeMock { frequency = new Parameter(); Q = new Parameter(); type = ''; }

type ResumeMode = 'resolve' | 'reject' | 'defer';
function fixture(t: TestContext, resumeMode: ResumeMode = 'resolve') {
  const instances: ContextMock[] = [];
  class ContextMock {
    sampleRate = 8000;
    currentTime = 10;
    state = 'suspended';
    destination = new AudioNodeMock();
    gains: GainMock[] = [];
    sources: SourceMock[] = [];
    oscillators: OscillatorMock[] = [];
    mergers: (AudioNodeMock & { channels: number })[] = [];
    filters: FilterMock[] = [];
    resumes: { resolve: () => void; reject: (error: Error) => void }[] = [];
    mode = resumeMode;
    constructor() { instances.push(this); }
    resume() {
      if (this.mode === 'reject') return Promise.reject(new Error('Audio permission denied'));
      if (this.mode === 'defer') return new Promise<void>((resolve, reject) => this.resumes.push({ resolve: () => { this.state = 'running'; resolve(); }, reject }));
      this.state = 'running';
      return Promise.resolve();
    }
    createGain() { const node = new GainMock(); this.gains.push(node); return node; }
    createBuffer(channels: number, length: number, sampleRate: number) { return new BufferMock(channels, length, sampleRate); }
    createBufferSource() { const node = new SourceMock(); this.sources.push(node); return node; }
    createOscillator() { const node = new OscillatorMock(); this.oscillators.push(node); return node; }
    createChannelMerger(channels: number) { const node = Object.assign(new AudioNodeMock(), { channels }); this.mergers.push(node); return node; }
    createBiquadFilter() { const node = new FilterMock(); this.filters.push(node); return node; }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { AudioContext: ContextMock }, configurable: true, writable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete (globalThis as { window?: unknown }).window; });
  return { engine: new AudioEngine(), instances, get context() { assert.ok(instances[0]); return instances[0]; } };
}

const settings: SoundSettings = { white: 50, brown: 70, gamma: 100, enabled: true, clicks: true };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const peak = (samples: Float32Array) => samples.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);

test('disabled saved settings never construct an AudioContext or autoplay', async t => {
  const f = fixture(t);
  assert.equal(await f.engine.setLevels({ ...settings, enabled: false }), true);
  assert.equal(f.engine.getActive(), false);
  assert.equal(f.instances.length, 0);
});

test('gamma uses 200 Hz only in left merger input and 240 Hz only in right input', async t => {
  const f = fixture(t);
  await f.engine.setLevels(settings);
  const { oscillators, mergers, gains, destination } = f.context;
  assert.equal(mergers.length, 1);
  assert.equal(mergers[0].channels, 2);
  assert.deepEqual(oscillators.map(node => [node.type, node.frequency.value]), [['sine', 200], ['sine', 240]]);
  assert.deepEqual(oscillators.map(node => node.connections[0]), [
    { node: mergers[0], output: 0, input: 0 }, { node: mergers[0], output: 0, input: 1 }
  ]);
  assert.equal(mergers[0].connections[0].node, gains[2]);
  assert.equal(gains[2].connections[0].node, destination);
  assert.ok(oscillators.every(node => node.started.length === 1));
});

test('both noises are stereo looping buffers; brown noise has lower sample-to-sample variation', async t => {
  const f = fixture(t);
  await f.engine.setLevels(settings);
  const [white, brown] = f.context.sources;
  for (const source of [white, brown]) {
    assert.equal(source.loop, true);
    assert.equal(source.started.length, 1);
    assert.equal(source.buffer!.numberOfChannels, 2);
    assert.equal(source.buffer!.length / source.buffer!.sampleRate, 4);
    assert.ok(source.buffer!.data.every(channel => peak(channel) <= 1 && peak(channel) > 0));
    assert.ok(source.buffer!.data[0].some((value, index) => value !== source.buffer!.data[1][index]));
  }
  const variation = (values: Float32Array) => values.reduce((sum, value, index) => index ? sum + (value - values[index - 1]) ** 2 : sum, 0) / values.length;
  assert.ok(variation(brown.buffer!.data[0]) < variation(white.buffer!.data[0]) * 0.2);
});

test('maximum mix including one click and cue retains digital headroom even for worst-case noise', async t => {
  const random = Math.random;
  Math.random = () => 1;
  t.after(() => { Math.random = random; });
  const f = fixture(t);
  await f.engine.setLevels({ ...settings, white: 100, brown: 100 });
  const [white, brown] = f.context.sources;
  const amplitude = peak(white.buffer!.data[0]) * f.context.gains[0].gain.value + peak(brown.buffer!.data[0]) * f.context.gains[1].gain.value + f.context.gains[2].gain.value;
  assert.ok(amplitude + 0.2 + 0.045 < 1);
  assert.equal(peak(brown.buffer!.data[0]), 1);
});

test('volume changes are smoothed and invalid levels cannot produce invalid gain', async t => {
  const f = fixture(t);
  await f.engine.setLevels(settings);
  assert.deepEqual(f.context.gains.map(node => node.gain.value), [0.095, 0.22399999999999998, 0.07]);
  assert.ok(f.context.gains.every(node => node.gain.events.at(-1)?.constant === 0.06));
  await f.engine.setLevels({ ...settings, white: -5, brown: Infinity, gamma: 1000 });
  assert.deepEqual(f.context.gains.map(node => node.gain.value), [0, 0, 0.07]);
  await f.engine.setLevels({ ...settings, enabled: false });
  assert.ok(f.context.gains.every(node => node.gain.value === 0));
  assert.equal(f.engine.getActive(), false);
});

test('StrictMode-style subscription replay and view unmount preserve playback and one context', async t => {
  const f = fixture(t);
  let updates = 0;
  const firstCleanup = f.engine.subscribe(() => updates++);
  firstCleanup();
  const secondCleanup = f.engine.subscribe(() => updates++);
  await f.engine.setLevels(settings);
  assert.equal(updates, 1);
  secondCleanup();
  assert.equal(f.engine.getActive(), true);
  const afterRemount = f.engine.subscribe(() => updates++);
  await f.engine.setLevels(settings);
  assert.equal(f.instances.length, 1);
  assert.equal(f.context.sources.length, 2);
  assert.equal(updates, 1);
  f.engine.stop();
  assert.equal(updates, 2);
  afterRemount();
});

test('stopping while resume is pending cancels activation and reports it was not applied', async t => {
  const f = fixture(t, 'defer');
  const activation = f.engine.setLevels(settings);
  f.engine.stop();
  f.context.resumes[0].resolve();
  assert.equal(await activation, false);
  assert.equal(f.engine.getActive(), false);
  assert.ok(f.context.gains.every(node => node.gain.value === 0));
});

test('obsolete rejected resume cannot stop a newer successful activation', async t => {
  const f = fixture(t, 'defer');
  const older = f.engine.setLevels(settings);
  const newer = f.engine.setLevels({ ...settings, white: 100 });
  f.context.resumes[1].resolve();
  assert.equal(await newer, true);
  f.context.resumes[0].reject(new Error('Stale permission failure'));
  assert.equal(await older, false);
  assert.equal(f.engine.getActive(), true);
  assert.equal(f.context.gains[0].gain.value, 0.19);
});

test('current resume failure resets playback, is reported, and a retry can recover', async t => {
  const f = fixture(t, 'reject');
  await assert.rejects(f.engine.setLevels(settings), /Audio permission denied/);
  assert.equal(f.engine.getActive(), false);
  assert.ok(f.context.gains.every(node => node.gain.value === 0));
  f.context.mode = 'resolve';
  await f.engine.setLevels(settings);
  assert.equal(f.engine.getActive(), true);
});

test('the first click honors saved settings without waiting for a React effect', async t => {
  const f = fixture(t);
  f.engine.click(false);
  assert.equal(f.instances.length, 0);
  f.engine.click(true);
  await flush();
  const click = f.context.sources[2];
  assert.ok(click);
  assert.equal(click.buffer!.numberOfChannels, 1);
  assert.equal(click.buffer!.length, Math.round(f.context.sampleRate * 0.024));
  assert.equal(click.started.length, 1);
  const filter = f.context.filters[0];
  assert.equal(filter.type, 'bandpass');
  click.onended!();
  assert.equal(click.disconnected, true);
  assert.equal(filter.disconnected, true);
  assert.equal(f.context.gains[3].disconnected, true);
});

test('denied effect resume creates no queued click or cue and has no unhandled rejection', async t => {
  const f = fixture(t, 'reject');
  f.engine.click(true);
  f.engine.cue(660);
  await flush();
  assert.equal(f.context.sources.length, 2);
  assert.equal(f.context.oscillators.length, 2);
});

test('disabling clicks while resume is pending cancels the queued effect', async t => {
  const f = fixture(t, 'defer');
  f.engine.click(true);
  f.engine.setClickEnabled(false);
  f.context.resumes[0].resolve();
  await flush();
  assert.equal(f.context.sources.length, 2);
});

test('only the newest pending cue plays, with a soft envelope and resource cleanup', async t => {
  const f = fixture(t, 'defer');
  f.engine.cue(330);
  f.engine.cue(440);
  f.context.resumes[0].resolve();
  f.context.resumes[1].resolve();
  await flush();
  assert.equal(f.context.oscillators.length, 3);
  const cue = f.context.oscillators[2];
  assert.equal(cue.frequency.value, 440);
  assert.deepEqual(cue.stopped, [10.72]);
  const envelope = f.context.gains[3];
  assert.deepEqual(envelope.gain.events.map(event => [event.type, event.value]), [['set', 0], ['linear', 0.045], ['exponential', 0.0001]]);
  cue.onended!();
  assert.equal(cue.disconnected, true);
  assert.equal(envelope.disconnected, true);
});

test('a cue delayed beyond its useful window is discarded instead of sounding later', async t => {
  const f = fixture(t, 'defer');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let now = 0;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'performance', previous); });
  f.engine.cue(523.25);
  now = 2000;
  f.context.resumes[0].resolve();
  await flush();
  assert.equal(f.context.oscillators.length, 2);
});

test('unsupported Web Audio reports a useful error while optional effects stay safe', async t => {
  const f = fixture(t);
  (globalThis as unknown as { window: { AudioContext?: unknown } }).window.AudioContext = undefined;
  await assert.rejects(f.engine.setLevels(settings), /Web Audio API недоступен/);
  assert.doesNotThrow(() => { f.engine.click(true); f.engine.cue(); });
});

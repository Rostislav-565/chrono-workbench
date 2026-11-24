import type { SoundSettings } from './types';

export class AudioEngine {
  private context: AudioContext | null = null;
  private gains: Record<'white' | 'brown' | 'gamma', GainNode> | null = null;
  private clicksEnabled = false;
  private mixing = false;
  private revision = 0;
  private listeners = new Set<() => void>();
  private effectRevision = { click: 0, cue: 0 };

  getActive = () => this.mixing;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private setActive(active: boolean) {
    if (this.mixing === active) return;
    this.mixing = active;
    this.listeners.forEach(listener => listener());
  }

  private initialize() {
    if (this.context) return this.context;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio API недоступен в этом браузере.');
    const context = new AudioContextClass();
    this.context = context;
    const makeGain = () => {
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      return gain;
    };
    this.gains = { white: makeGain(), brown: makeGain(), gamma: makeGain() };
    const frames = context.sampleRate * 4;
    for (const kind of ['white', 'brown'] as const) {
      const buffer = context.createBuffer(2, frames, context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const samples = buffer.getChannelData(channel);
        let last = 0;
        for (let index = 0; index < frames; index++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.02 * white) / 1.02;
          samples[index] = kind === 'white' ? white : Math.max(-1, Math.min(1, last * 3.5));
        }
        const fadeFrames = Math.round(context.sampleRate * 0.02);
        for (let index = 0; index < fadeFrames; index++) {
          samples[index] *= index / fadeFrames;
          samples[frames - index - 1] *= index / fadeFrames;
        }
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.gains[kind]);
      source.start();
    }
    const merger = context.createChannelMerger(2);
    [200, 240].forEach((frequency, channel) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(merger, 0, channel);
      oscillator.start();
    });
    merger.connect(this.gains.gamma);
    return context;
  }

  async setLevels(settings: SoundSettings): Promise<boolean> {
    const revision = ++this.revision;
    this.setClickEnabled(settings.clicks);
    if (!settings.enabled && !this.context) { this.setActive(false); return true; }
    let context: AudioContext;
    try {
      context = this.initialize();
      if (settings.enabled && context.state !== 'running') await context.resume();
    } catch (error) {
      if (revision !== this.revision) return false;
      this.stop();
      throw error;
    }
    if (!this.gains || revision !== this.revision) return false;
    for (const kind of ['white', 'brown', 'gamma'] as const) {
      const level = Number.isFinite(settings[kind]) ? Math.min(100, Math.max(0, settings[kind])) / 100 : 0;
      const amplitude = { white: 0.19, brown: 0.32, gamma: 0.07 }[kind];
      this.gains[kind].gain.setTargetAtTime(settings.enabled ? level * amplitude : 0, context.currentTime, 0.06);
    }
    this.setActive(settings.enabled);
    return true;
  }

  setClickEnabled(enabled: boolean) {
    this.clicksEnabled = enabled;
    if (!enabled) ++this.effectRevision.click;
  }

  stop() {
    ++this.revision;
    this.setActive(false);
    if (!this.context || !this.gains) return;
    Object.values(this.gains).forEach(gain => gain.gain.setTargetAtTime(0, this.context!.currentTime, 0.03));
  }

  private scheduleEffect(kind: 'click' | 'cue', play: (context: AudioContext) => void) {
    const revision = ++this.effectRevision[kind];
    const requestedAt = performance.now();
    try {
      const context = this.initialize();
      if (context.state === 'running') play(context);
      else void context.resume().then(() => {
        if (context.state === 'running' && revision === this.effectRevision[kind] && performance.now() - requestedAt < 1500) play(context);
      }).catch(() => {});
    } catch { /* Audio is optional when the browser cannot provide it. */ }
  }

  click(enabled = this.clicksEnabled) {
    this.setClickEnabled(enabled);
    if (!enabled) return;
    this.scheduleEffect('click', context => {
      const buffer = context.createBuffer(1, Math.round(context.sampleRate * 0.024), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.003));
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.7;
      gain.gain.value = 0.2;
      source.connect(filter).connect(gain).connect(context.destination);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start();
    });
  }

  cue(frequency = 440) {
    this.scheduleEffect('cue', context => {
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = Number.isFinite(frequency) ? Math.min(20000, Math.max(20, frequency)) : 440;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.045, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + 0.72);
    });
  }
}

export const audioEngine = new AudioEngine();

import type { TimerState } from './types.ts';

export function initialTimer(mode: TimerState['mode'] = 'pomodoro'): TimerState {
  return { mode, phase: 'work', status: 'idle', elapsed: 0, startedAt: null, duration: 1500, earnedBreak: 0, accounted: 0 };
}

export function elapsedSeconds(timer: TimerState, now = Date.now()): number {
  const delta = timer.status === 'running' && timer.startedAt !== null ? Math.max(0, (now - timer.startedAt) / 1000) : 0;
  const elapsed = Math.max(0, timer.elapsed + delta);
  return timer.mode === 'flow' && timer.phase === 'work' ? elapsed : Math.min(timer.duration, elapsed);
}

export function toggleTimer(timer: TimerState, now = Date.now()): TimerState {
  if (timer.status === 'running') return { ...timer, status: 'paused', elapsed: elapsedSeconds(timer, now), startedAt: null };
  return { ...timer, status: 'running', startedAt: now };
}

export function changeMode(_timer: TimerState, mode: TimerState['mode']): TimerState {
  return initialTimer(mode);
}

export function unrecordedSeconds(timer: TimerState, now = Date.now()): number {
  return timer.phase === 'work' ? Math.max(0, elapsedSeconds(timer, now) - (timer.accounted ?? 0)) : 0;
}

export function accountWork(timer: TimerState, totalSeconds = elapsedSeconds(timer)): { timer: TimerState; workSeconds: number } {
  if (timer.phase !== 'work') return { timer, workSeconds: 0 };
  const accounted = timer.accounted ?? 0;
  const requested = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : accounted;
  const total = timer.mode === 'pomodoro' ? Math.min(timer.duration, requested) : requested;
  return { timer: { ...timer, accounted: Math.max(accounted, total) }, workSeconds: Math.max(0, total - accounted) };
}

export function beginBreak(timer: TimerState, now = Date.now()): { timer: TimerState; workSeconds: number } {
  if (timer.phase !== 'work') return { timer, workSeconds: 0 };
  const workSeconds = elapsedSeconds(timer, now);
  if (workSeconds <= 0) return { timer, workSeconds: 0 };
  const duration = timer.mode === 'flow' ? workSeconds / 5 : 300;
  return { timer: { ...timer, phase: 'break', status: 'running', elapsed: 0, startedAt: now, duration, earnedBreak: duration, accounted: 0 }, workSeconds };
}

export function finishPhase(timer: TimerState, now = Date.now()): { timer: TimerState; workSeconds: number } {
  if (timer.mode === 'flow' && timer.phase === 'work') return { timer, workSeconds: 0 };
  if (elapsedSeconds(timer, now) < timer.duration) return { timer, workSeconds: 0 };
  if (timer.phase === 'break') return { timer: initialTimer(timer.mode), workSeconds: 0 };
  return { timer: { ...timer, phase: 'break', status: 'idle', elapsed: 0, startedAt: null, duration: 300, earnedBreak: 300, accounted: 0 }, workSeconds: timer.duration };
}

export function formatTime(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const tail = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${tail}` : `${String(minutes).padStart(2, '0')}:${tail}`;
}

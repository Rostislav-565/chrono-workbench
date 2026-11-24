import type { AppData, TimerState } from './types.ts';
import { accountWork, elapsedSeconds } from './timer.ts';

export type FocusDay = { date: string; seconds: number };

function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function splitFocusInterval(start: number, end: number): FocusDay[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) return [];
  const days: FocusDay[] = [];
  let cursor = start;
  while (cursor < end) {
    const date = new Date(cursor);
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    const until = Math.min(end, midnight);
    if (until <= cursor) break;
    days.push({ date: dateKey(cursor), seconds: (until - cursor) / 1000 });
    cursor = until;
  }
  return days;
}

export function pendingFocusSegments(timer: TimerState, now = Date.now()): FocusDay[] {
  if (timer.phase !== 'work') return [];
  const total = elapsedSeconds(timer, now);
  const accounted = timer.accounted ?? 0;
  if (total <= accounted) return [];
  if (timer.status !== 'running' || timer.startedAt === null) return [{ date: dateKey(now), seconds: total - accounted }];
  const days = new Map<string, number>();
  const add = (part: FocusDay) => days.set(part.date, (days.get(part.date) ?? 0) + part.seconds);
  const legacyPending = Math.max(0, Math.min(timer.elapsed, total) - accounted);
  if (legacyPending > 0) add({ date: dateKey(timer.startedAt), seconds: legacyPending });
  const activeSeconds = Math.max(0, total - Math.max(timer.elapsed, accounted));
  if (activeSeconds > 0) {
    const start = timer.startedAt + Math.max(0, accounted - timer.elapsed) * 1000;
    for (const part of splitFocusInterval(start, start + activeSeconds * 1000)) add(part);
  }
  return [...days].map(([date, seconds]) => ({ date, seconds }));
}

export function pendingFocusSecondsForDate(timer: TimerState, date: string, now = Date.now()): number {
  return pendingFocusSegments(timer, now).filter(part => part.date === date).reduce((sum, part) => sum + part.seconds, 0);
}

export function recordFocus(data: AppData, now = Date.now(), createId: () => string = () => crypto.randomUUID()): AppData {
  const parts = pendingFocusSegments(data.timer, now);
  if (!parts.length) return data;
  const checkpoint = accountWork(data.timer, elapsedSeconds(data.timer, now));
  const task = data.tasks.find(item => item.id === data.activeTaskId)?.text ?? 'Свободный фокус';
  return { ...data, timer: checkpoint.timer, sessions: [...data.sessions, ...parts.map(part => ({ id: createId(), ...part, mode: data.timer.mode, task }))] };
}

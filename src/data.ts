import type { AppData, FocusSession, Note, Step, Task, TimerState } from './types';

export const storageKey = 'chrono-workbench-v1';
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function activityDays(reference = new Date()): { key: string; date: Date }[] {
  const anchor = new Date(reference); anchor.setHours(12, 0, 0, 0);
  return Array.from({ length: 60 }, (_, index) => {
    const date = new Date(anchor); date.setDate(date.getDate() - (59 - index));
    return { key: localDate(date), date };
  });
}

export function createInitialData(): AppData {
  return { version: 1, theme: 'light', energy: 4, tasks: [], notes: [], sessions: [], sound: { white: 20, brown: 30, gamma: 0, enabled: false, clicks: true }, activeTaskId: null, timer: { mode: 'pomodoro', phase: 'work', status: 'idle', elapsed: 0, startedAt: null, duration: 1500, earnedBreak: 0, accounted: 0 }, demoCleared: true };
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const validDay = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const uniqueRecords = (value: unknown, accept: (item: RecordValue) => boolean = () => true): RecordValue[] => {
  const seen = new Set<string>();
  return array(value).filter(record).filter(item => {
    const id = text(item.id);
    if (!id.trim() || seen.has(id) || !accept(item)) return false;
    seen.add(id); return true;
  });
};

export function parseBackup(raw: string): AppData {
    let saved: unknown;
    try { saved = JSON.parse(raw); } catch { throw new Error('Файл содержит некорректный JSON.'); }
    if (!record(saved) || saved.version !== 1 || !Array.isArray(saved.tasks) || !Array.isArray(saved.notes) || !Array.isArray(saved.sessions)) {
      throw new Error('Нужен JSON-бэкап CHRONO-WORKBENCH версии 1 с задачами, заметками и сессиями.');
    }
    const seenTasks = new Set<string>();
    const counts = { main: 0, medium: 0, small: 0 };
    const limits = { main: 1, medium: 3, small: 5 };
    const tasks: Task[] = array(saved.tasks).filter(record).flatMap(item => {
      const tier = item.tier;
      if ((tier !== 'main' && tier !== 'medium' && tier !== 'small') || !text(item.id).trim() || !text(item.text).trim() || seenTasks.has(text(item.id)) || counts[tier] >= limits[tier]) return [];
      seenTasks.add(text(item.id)); counts[tier]++;
      const steps: Step[] = uniqueRecords(item.steps, step => !!text(step.text).trim()).map(step => ({ id: text(step.id), text: text(step.text), done: step.done === true }));
      return [{ id: text(item.id), text: text(item.text), tier, done: item.done === true, expanded: item.expanded === true, steps }];
    });
    const now = Date.now();
    const notes: Note[] = uniqueRecords(saved.notes, note => !!text(note.text).trim()).map(note => ({ id: text(note.id), text: text(note.text), createdAt: number(note.createdAt, now, 0, now) }));
    const sessions: FocusSession[] = uniqueRecords(saved.sessions, session => validDay(session.date) && number(session.seconds, 0) > 0).map(session => ({ id: text(session.id), date: text(session.date), seconds: number(session.seconds, 0), task: text(session.task, 'Свободный фокус'), mode: session.mode === 'flow' ? 'flow' : 'pomodoro', demo: session.demo === true }));
    const rawTimer = record(saved.timer) ? saved.timer : {};
    const status = rawTimer.status === 'running' || rawTimer.status === 'paused' ? rawTimer.status : 'idle';
    const startedAt = status === 'running' && typeof rawTimer.startedAt === 'number' && Number.isFinite(rawTimer.startedAt) && rawTimer.startedAt >= 0 ? Math.min(now, rawTimer.startedAt) : null;
    const duration = number(rawTimer.duration, 1500);
    const timer: TimerState = { mode: rawTimer.mode === 'flow' ? 'flow' : 'pomodoro', phase: rawTimer.phase === 'break' ? 'break' : 'work', status: status === 'running' && startedAt === null ? 'paused' : status, elapsed: number(rawTimer.elapsed, 0), startedAt, duration: duration > 0 ? duration : 1, earnedBreak: number(rawTimer.earnedBreak, 0), accounted: 0 };
    if (timer.mode !== 'flow' || timer.phase !== 'work') timer.elapsed = Math.min(timer.duration, timer.elapsed);
    const wallElapsed = timer.elapsed + (timer.status === 'running' && timer.startedAt !== null ? Math.max(0, (now - timer.startedAt) / 1000) : 0);
    const elapsedLimit = timer.mode === 'flow' && timer.phase === 'work' ? wallElapsed : Math.min(timer.duration, wallElapsed);
    timer.accounted = timer.phase === 'work' ? number(rawTimer.accounted, 0, 0, elapsedLimit) : 0;
    const sound = record(saved.sound) ? saved.sound : {};
    return { version: 1, theme: saved.theme === 'dark' ? 'dark' : 'light', energy: Math.round(number(saved.energy, 4, 1, 5)), tasks, notes, sessions, sound: { white: number(sound.white, 20, 0, 100), brown: number(sound.brown, 30, 0, 100), gamma: number(sound.gamma, 0, 0, 100), enabled: sound.enabled === true, clicks: sound.clicks !== false }, activeTaskId: typeof saved.activeTaskId === 'string' && tasks.some(task => task.id === saved.activeTaskId) ? saved.activeTaskId : null, timer, demoCleared: saved.demoCleared === true };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? parseBackup(raw) : createInitialData();
  } catch { return createInitialData(); }
}

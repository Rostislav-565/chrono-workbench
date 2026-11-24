import type { AppData, Task, TaskTier, TimerState } from './types.ts';
import { elapsedSeconds, finishPhase, initialTimer, toggleTimer } from './timer.ts';
import { recordFocus } from './session.ts';

export const taskLimits: Record<TaskTier, number> = { main: 1, medium: 3, small: 5 };
export function availableNoteTier(data: AppData): TaskTier | null {
  return (['small', 'medium', 'main'] as TaskTier[]).find(tier => data.tasks.filter(task => task.tier === tier).length < taskLimits[tier]) ?? null;
}
export function settleTimer(data: AppData, now = Date.now()): AppData {
  const timer = data.timer;
  if (timer.status === 'idle' || (timer.mode === 'flow' && timer.phase === 'work') || elapsedSeconds(timer, now) < timer.duration) return data;
  return { ...recordFocus(data, now), timer: finishPhase(timer, now).timer };
}
export function toggleFocus(data: AppData, now = Date.now()): AppData {
  const settled = settleTimer(data, now);
  if (settled !== data) return settled;
  const recorded = recordFocus(data, now);
  return { ...recorded, timer: toggleTimer(recorded.timer, now) };
}
export function pauseFocus(data: AppData, now = Date.now()): AppData {
  const recorded = recordFocus(settleTimer(data, now), now);
  return recorded.timer.status === 'running' ? { ...recorded, timer: toggleTimer(recorded.timer, now) } : recorded;
}
export function resetFocus(data: AppData, now = Date.now(), mode: TimerState['mode'] = data.timer.mode): AppData {
  return { ...recordFocus(data, now), timer: initialTimer(mode) };
}
export function selectFocus(data: AppData, taskId: string | null, now = Date.now()): AppData {
  if (taskId === data.activeTaskId || (taskId !== null && !data.tasks.some(task => task.id === taskId && !task.done))) return data;
  return { ...recordFocus(data, now), activeTaskId: taskId };
}
export function updatePlanTask(data: AppData, task: Task, now = Date.now()): AppData {
  const previous = data.tasks.find(item => item.id === task.id);
  if (!previous) return data;
  let next = data;
  if (task.id === data.activeTaskId) {
    if (task.done && !previous.done) next = { ...pauseFocus(data, now), activeTaskId: null };
    else if (task.text !== previous.text) next = recordFocus(data, now);
  }
  return { ...next, tasks: next.tasks.map(item => item.id === task.id ? task : item) };
}
export function deletePlanTask(data: AppData, taskId: string, now = Date.now()): AppData {
  const next = taskId === data.activeTaskId ? selectFocus(data, null, now) : data;
  return { ...next, tasks: next.tasks.filter(task => task.id !== taskId) };
}
export function addPlanTask(data: AppData, task: Task, noteId?: string): AppData {
  if (!task.text.trim() || data.tasks.some(item => item.id === task.id) || data.tasks.filter(item => item.tier === task.tier).length >= taskLimits[task.tier]) return data;
  return { ...data, tasks: [...data.tasks, { ...task, text: task.text.trim() }], notes: noteId ? data.notes.filter(note => note.id !== noteId) : data.notes };
}

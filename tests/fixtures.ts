import { activityDays, createInitialData, localDate } from '../src/data.ts';
import type { AppData, FocusSession, Task } from '../src/types.ts';

export function createDemoData(reference = new Date()): AppData {
  const tasks: Task[] = [
    { id: 'first-main', text: 'Продвинуть главный проект', tier: 'main', done: false, expanded: false, steps: [
      { id: 'first-step-1', text: 'Открыть материалы проекта', done: false },
      { id: 'first-step-2', text: 'Записать один конкретный результат', done: false },
      { id: 'first-step-3', text: 'Сделать первый маленький шаг', done: false }
    ] },
    { id: 'first-medium-1', text: 'Разобрать входящие сообщения', tier: 'medium', done: false, expanded: false, steps: [] },
    { id: 'first-medium-2', text: 'Подготовить план на завтра', tier: 'medium', done: false, expanded: false, steps: [] },
    { id: 'first-small-1', text: 'Привести рабочий стол в порядок', tier: 'small', done: false, expanded: false, steps: [] },
    { id: 'first-small-2', text: 'Налить стакан воды', tier: 'small', done: false, expanded: false, steps: [] }
  ];
  const sessions: FocusSession[] = [];
  for (const [index, entry] of activityDays(reference).slice(0, -1).entries()) {
    const day = 59 - index; const date = entry.date;
    const weekday = date.getDay();
    const count = weekday === 0 ? 0 : weekday === 6 ? (day % 3 === 0 ? 1 : 0) : 1 + ((day * 7 + 3) % 4);
    if (day % 11 === 0) continue;
    for (let index = 0; index < count; index++) {
      sessions.push({ id: `demo-${localDate(date)}-${index}`, date: localDate(date), seconds: index % 3 === 0 ? (25 + day % 5 * 5) * 60 : 1500, mode: index % 3 === 0 ? 'flow' : 'pomodoro', task: 'Демонстрационная сессия', demo: true });
    }
  }
  return { ...createInitialData(), tasks, sessions, activeTaskId: tasks[0].id, demoCleared: false };
}

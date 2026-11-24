import type { AppData } from './types.ts';
import { localDate } from './data.ts';

export const formatFocusDuration = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  if (seconds > 0 && whole === 0) return 'меньше 1 с';
  const minutes = Math.floor(whole / 60); const remainder = whole % 60;
  return minutes > 0 ? `${minutes} мин${remainder ? ` ${remainder} с` : ''}` : `${whole} с`;
};
const escapeMarkdown = (value: string) => value.replace(/([\\`*_{}\[\]<>!|&])/g, '\\$1').replace(/\r\n?|\n/g, ' ');

export function createMarkdownReport(data: AppData, date = localDate()): string {
  const sessions = data.sessions.filter(session => !session.demo && session.date === date);
  const seconds = sessions.reduce((sum, session) => sum + session.seconds, 0);
  const done = data.tasks.filter(task => task.done).length;
  const groups = [{ key: 'main', title: 'Главная задача' }, { key: 'medium', title: 'Средние задачи' }, { key: 'small', title: 'Мелкая рутина' }];
  return [
    `# CHRONO-WORKBENCH · ${date}`, '',
    `- Фокус сегодня: ${formatFocusDuration(seconds)}`,
    `- Сохранённых отрезков сегодня: ${sessions.length}`,
    `- Выполнено задач в текущем плане: ${done}/${data.tasks.length}`,
    `- Уровень энергии: ${data.energy}/5`, '',
    ...groups.flatMap(group => [`## ${group.title}`, '', ...data.tasks.filter(task => task.tier === group.key).flatMap(task => [`- [${task.done ? 'x' : ' '}] ${escapeMarkdown(task.text)}`, ...task.steps.map(step => `  - [${step.done ? 'x' : ' '}] ${escapeMarkdown(step.text)} · 5 мин`)]), '']),
    '## Парковка мыслей', '', ...(data.notes.length ? data.notes.map(note => `- ${escapeMarkdown(note.text)}`) : ['Нет записей.']), '',
    '## Журнал фокуса сегодня', '', ...(sessions.length ? sessions.map(session => `- ${escapeMarkdown(session.task || 'Свободный фокус')} · ${formatFocusDuration(session.seconds)} · ${session.mode === 'flow' ? 'Flowmodoro' : 'Pomodoro'}`) : ['Сохранённых отрезков пока нет.']), '',
    'Демонстрационные сессии не входят в этот отчёт. Несохранённое время текущей сессии не включено.', ''
  ].join('\n');
}

export function createJsonBackup(data: AppData, exportedAt = new Date()): string {
  return JSON.stringify({ ...data, exportedAt: exportedAt.toISOString() }, null, 2);
}

export function downloadText(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | null = null;
  try {
    link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
  } finally {
    link?.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

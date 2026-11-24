import { useMemo, useRef, useState } from 'react';
import type { AppData } from './types';
import { activityDays, localDate, parseBackup } from './data';
import { pauseFocus } from './actions';
import { formatTime, unrecordedSeconds } from './timer';
import { createMarkdownReport, createJsonBackup, downloadText, formatFocusDuration } from './export';
import './analytics.css';

type Props = { data: AppData; onClearDemo: () => void; onReset: () => void; onRestore: (data: AppData) => void; notify: (message: string) => void };
const minutes = (seconds: number) => Math.floor(seconds / 60);
const hours = (seconds: number) => (seconds / 3600).toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export default function Analytics({ data, onClearDemo, onReset, onRestore, notify }: Props) {
  const today = localDate();
  const importRef = useRef<HTMLInputElement>(null);
  const [backupReady, setBackupReady] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<AppData | null>(null);
  const [selected, setSelected] = useState(today);
  const realSessions = data.sessions.filter(session => !session.demo);
  const demoSessions = data.sessions.filter(session => session.demo);
  const todays = realSessions.filter(session => session.date === today);
  const todaySeconds = todays.reduce((sum, session) => sum + session.seconds, 0);
  const pendingSeconds = unrecordedSeconds(data.timer);
  const realSeconds = realSessions.reduce((sum, session) => sum + session.seconds, 0);
  const done = data.tasks.filter(task => task.done).length;
  const daily = useMemo(() => {
    const result = new Map<string, { real: number; demo: number; count: number }>();
    for (const session of data.sessions) {
      const current = result.get(session.date) ?? { real: 0, demo: 0, count: 0 };
      current[session.demo ? 'demo' : 'real'] += session.seconds; current.count++;
      result.set(session.date, current);
    }
    return result;
  }, [data.sessions]);
  const days = activityDays();
  const padding = (days[0].date.getDay() + 6) % 7;
  const selectedInfo = daily.get(selected) ?? { real: 0, demo: 0, count: 0 };
  const dateLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  function exportMarkdown() {
    try {
      downloadText(createMarkdownReport(data, today), `chrono-${today}.md`, 'text/markdown');
      notify('Отчёт подготовлен для скачивания');
    } catch { notify('Не удалось подготовить отчёт для скачивания'); }
  }
  function exportJson() {
    try {
      downloadText(createJsonBackup(pauseFocus(data, Date.now())), `chrono-backup-${today}.json`, 'application/json');
      setBackupReady(true);
      notify('Бэкап подготовлен для скачивания');
    } catch { notify('Не удалось подготовить бэкап для скачивания'); }
  }
  async function importJson(file: File) {
    setPendingRestore(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('large');
      const raw = await file.text();
      const imported = parseBackup(raw);
      const exportedAt = Date.parse(JSON.parse(raw).exportedAt ?? '');
      const restored = pauseFocus(imported, Number.isFinite(exportedAt) ? Math.min(Date.now(), Math.max(0, exportedAt)) : Date.now());
      setPendingRestore({ ...restored, sound: { ...restored.sound, enabled: false } });
    } catch { notify('Не удалось импортировать файл. Нужен JSON-бэкап CHRONO до 10 МБ. Текущие данные сохранены.'); }
  }
  function restoreJson() {
    if (!pendingRestore) return;
    try {
      downloadText(createJsonBackup(pauseFocus(data, Date.now())), `chrono-before-import-${Date.now()}.json`, 'application/json');
      onRestore(pendingRestore);
      setBackupReady(false);
      notify('Бэкап восстановлен. Таймер остановлен, звук выключен.');
    } catch { notify('Не удалось сохранить текущий бэкап. Восстановление отменено.'); }
  }
  return <section className="module analytics-panel" aria-labelledby="analytics-title">
    <div className="module-head"><div><p className="eyebrow">ACTIVITY LOG / 60 DAYS</p><h2 id="analytics-title">Ритм работы</h2></div><span className="analytics-local">LOCAL STORAGE</span></div>
    <p className="analytics-scope">Сохранённое время фокуса. Пауза, отдых или смена задачи добавляют отрезок в журнал.</p>
    <div className="analytics-metrics">
      <div title={formatFocusDuration(todaySeconds)}><span>Фокус сегодня</span><strong>{todaySeconds < 60 ? Math.floor(todaySeconds) : minutes(todaySeconds)}<small>{todaySeconds < 60 ? ' с' : ' мин'}</small></strong></div>
      <div><span>Всего в потоке</span><strong>{hours(realSeconds)}<small> ч</small></strong></div>
      <div><span>Отрезков сегодня</span><strong>{String(todays.length).padStart(2, '0')}</strong></div>
      <div><span>Задач в плане сделано</span><strong>{done}<small> / {data.tasks.length}</small></strong></div>
    </div>
    {pendingSeconds > 0 && <div className="analytics-pending"><span><i aria-hidden="true"/>Текущий фокус ещё не в журнале</span><strong>{formatTime(Math.floor(pendingSeconds))}</strong></div>}
    <div className="analytics-calendar-heading"><span>Карта активности</span><span>{dateLabel(days[0].key)} — {dateLabel(today)}</span></div>
    <div className="analytics-calendar">
      <div className="analytics-weekdays" aria-hidden="true">{['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(label => <span key={label}>{label}</span>)}</div>
      <div className="analytics-grid" style={{ gridTemplateColumns: `repeat(${Math.ceil((60 + padding) / 7)}, minmax(0, 1fr))` }}>
        {Array.from({ length: padding }, (_, index) => <span className="analytics-empty" key={`pad-${index}`} />)}
        {days.map(day => {
          const entry = daily.get(day.key); const total = (entry?.real ?? 0) + (entry?.demo ?? 0);
          const level = total === 0 ? 0 : total < 1800 ? 1 : total < 3600 ? 2 : total < 5400 ? 3 : 4;
          const demo = !!entry?.demo;
          const label = `${dateLabel(day.key)}: ${formatFocusDuration(total)}${demo ? ', включает демо' : ''}`;
          return <button key={day.key} type="button" title={label} aria-label={label} aria-pressed={selected === day.key} className={`analytics-day level-${level}${selected === day.key ? ' selected' : ''}${day.key === today ? ' today' : ''}`} onClick={() => setSelected(day.key)} />;
        })}
      </div>
    </div>
    <div className="analytics-calendar-foot"><span className="analytics-day-detail" aria-live="polite">{selected === today ? 'Сегодня' : dateLabel(selected)} · {formatFocusDuration(selectedInfo.real)}{selectedInfo.demo > 0 ? ` + ${formatFocusDuration(selectedInfo.demo)} демо` : ''}</span><span className="analytics-legend">Меньше <i className="level-0"/><i className="level-1"/><i className="level-2"/><i className="level-3"/><i className="level-4"/> Больше</span></div>
    {demoSessions.length > 0 && <div className="analytics-demo"><div><strong>Пример вашего будущего ритма</strong><p>Карта содержит демо за прошлые дни. Счётчики выше показывают только вашу работу.</p></div><button className="button" type="button" onClick={onClearDemo}>Очистить демо</button></div>}
    <div className="analytics-export"><div><span className="eyebrow">YOUR DATA, YOUR SPACE</span><p>Заберите результаты с собой.</p></div><div className="analytics-export-actions"><button className="button" type="button" onClick={exportMarkdown}>Экспорт в Markdown</button><button className="button" type="button" onClick={exportJson}>Скачать JSON-бэкап</button><button className="button" type="button" onClick={() => importRef.current?.click()}>Восстановить JSON</button><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importJson(file); }}/></div></div>
    {pendingRestore && <div className="data-review" role="status"><p>Бэкап готов. Задачи: {pendingRestore.tasks.length} · Мысли: {pendingRestore.notes.length} · Отрезки: {pendingRestore.sessions.length}. Текущее состояние будет скачано отдельным бэкапом перед заменой.</p><div className="analytics-export-actions"><button className="button" type="button" onClick={restoreJson}>Подтвердить восстановление</button><button className="button" type="button" onClick={() => setPendingRestore(null)}>Отмена</button></div></div>}
    <details className="data-reset"><summary>Начать с чистого листа</summary><p>Очистить задачи, мысли, историю фокуса и настройки. Сначала скачай JSON-бэкап и убедись, что файл сохранён: его можно вернуть через «Восстановить JSON».</p>{resetConfirm ? <div className="data-review"><p>Начать с нуля? Все задачи, мысли, сессии и настройки будут очищены.</p><div className="analytics-export-actions"><button className="button" type="button" onClick={onReset}>Да, начать с нуля</button><button className="button" type="button" onClick={() => setResetConfirm(false)}>Отмена</button></div></div> : <button className="button" type="button" disabled={!backupReady} onClick={() => setResetConfirm(true)}>Очистить рабочий стол</button>}{!backupReady && <small>Сначала нажми «Скачать JSON-бэкап» выше.</small>}</details>
  </section>;
}

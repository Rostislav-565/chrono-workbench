import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData } from '../src/data.ts';
import { createDemoData } from './fixtures.ts';
import { createMarkdownReport, createJsonBackup, downloadText, formatFocusDuration } from '../src/export.ts';

test('Markdown uses only real sessions on the report date and identifies pending work', () => {
  const data = createInitialData();
  data.sessions = [
    { id: 'real', date: '2026-11-24', seconds: 1500, mode: 'pomodoro', task: 'Настоящая работа' },
    { id: 'flow', date: '2026-11-24', seconds: 600, mode: 'flow', task: '' },
    { id: 'demo', date: '2026-11-24', seconds: 3600, mode: 'flow', task: 'ДЕМО_НЕ_ЭКСПОРТИРОВАТЬ', demo: true },
    { id: 'old', date: '2026-11-23', seconds: 7200, mode: 'flow', task: 'ВЧЕРА_НЕ_ЭКСПОРТИРОВАТЬ' }
  ];
  data.timer = { ...data.timer, status: 'paused', elapsed: 900 };
  const report = createMarkdownReport(data, '2026-11-24');
  assert.match(report, /# CHRONO-WORKBENCH · 2026-11-24/);
  assert.match(report, /Фокус сегодня: 35 мин/);
  assert.match(report, /Сохранённых отрезков сегодня: 2/);
  assert.match(report, /Настоящая работа · 25 мин · Pomodoro/);
  assert.match(report, /Свободный фокус · 10 мин · Flowmodoro/);
  assert.doesNotMatch(report, /ДЕМО_НЕ_ЭКСПОРТИРОВАТЬ|ВЧЕРА_НЕ_ЭКСПОРТИРОВАТЬ/);
  assert.match(report, /Несохранённое время текущей сессии не включено/);
});

test('Markdown escapes task, step and note syntax without losing checkbox states', () => {
  const data = createInitialData();
  data.tasks = [{ id: 'task', tier: 'main', done: true, expanded: true, text: '*Проект* [link](x)\nследующая строка', steps: [{ id: 'step', text: '`код` <b>\r\nещё', done: false }] }];
  data.notes = [{ id: 'note', text: 'мысль_1 {идея} \\ файл', createdAt: 0 }];
  const report = createMarkdownReport(data, '2026-11-24');
  assert(report.includes('- [x] \\*Проект\\* \\[link\\](x) следующая строка'));
  assert(report.includes('  - [ ] \\`код\\` \\<b\\> ещё · 5 мин'));
  assert(report.includes('- мысль\\_1 \\{идея\\} \\\\ файл'));
  assert.match(report, /Выполнено задач в текущем плане: 1\/1/);
});

test('JSON backup roundtrips the complete saved state including timer and demo', () => {
  const data = createDemoData();
  data.theme = 'dark'; data.timer.accounted = 12;
  data.notes = [{ id: 'note', text: 'кавычки " и перенос\nстроки', createdAt: 1234 }];
  const parsed = JSON.parse(createJsonBackup(data, new Date('2026-11-24T12:30:00Z')));
  assert.equal(parsed.exportedAt, '2026-11-24T12:30:00.000Z');
  delete parsed.exportedAt;
  assert.deepEqual(parsed, data);
});

test('durations retain seconds and do not round sub-minute focus up to a full minute', () => {
  assert.equal(formatFocusDuration(0), '0 с');
  assert.equal(formatFocusDuration(0.1), 'меньше 1 с');
  assert.equal(formatFocusDuration(29.9), '29 с');
  assert.equal(formatFocusDuration(59.9), '59 с');
  assert.equal(formatFocusDuration(60), '1 мин');
  assert.equal(formatFocusDuration(3599.9), '59 мин 59 с');
  const data = createInitialData();
  data.sessions = [{ id: 'short', date: '2026-11-24', seconds: 35.5, task: '&copy; | **идея**', mode: 'flow' }];
  const report = createMarkdownReport(data, '2026-11-24');
  assert.match(report, /Фокус сегодня: 35 с/);
  assert(report.includes('\\&copy; \\| \\*\\*идея\\*\\* · 35 с'));
});

test('empty Markdown report labels saved-only time without synthesizing task completions', () => {
  const data = createInitialData(); data.tasks = []; data.notes = []; data.sessions = [];
  const report = createMarkdownReport(data, '2026-11-24');
  assert.match(report, /Фокус сегодня: 0 с/);
  assert.match(report, /Сохранённых отрезков сегодня: 0/);
  assert.match(report, /Нет записей/);
  assert.match(report, /Выполнено задач в текущем плане: 0\/0/);
});

test('download creates UTF-8 Blob, clicks named anchor, removes it, and revokes URL later', async context => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const events: string[] = [];
  let blob: Blob | undefined;
  let delayed: (() => void) | undefined;
  const link = { href: '', download: '', click() { events.push('click'); }, remove() { events.push('remove'); } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement(tag: string) { assert.equal(tag, 'a'); return link; }, body: { append(node: unknown) { assert.equal(node, link); events.push('append'); } } } });
  context.mock.method(URL, 'createObjectURL', (value: Blob) => { blob = value; return 'blob:chrono-test'; });
  context.mock.method(URL, 'revokeObjectURL', (url: string) => { assert.equal(url, 'blob:chrono-test'); events.push('revoke'); });
  context.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => { assert.equal(delay, 1000); delayed = callback; return 1; });
  try {
    downloadText('Привет, фокус!', 'chrono-2026-11-24.md', 'text/markdown');
    assert.equal(link.href, 'blob:chrono-test'); assert.equal(link.download, 'chrono-2026-11-24.md');
    assert.equal(blob?.type, 'text/markdown;charset=utf-8'); assert.equal(await blob?.text(), 'Привет, фокус!');
    assert.deepEqual(events, ['append', 'click', 'remove']);
    assert(delayed); delayed(); assert.deepEqual(events, ['append', 'click', 'remove', 'revoke']);
  } finally { if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('failed browser click still removes temporary anchor and schedules URL cleanup', context => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let removed = false; let revoked = false; let delayed: (() => void) | undefined;
  const link = { href: '', download: '', click() { throw new Error('download blocked'); }, remove() { removed = true; } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { return link; }, body: { append() {} } } });
  context.mock.method(URL, 'createObjectURL', () => 'blob:chrono-failed');
  context.mock.method(URL, 'revokeObjectURL', () => { revoked = true; });
  context.mock.method(globalThis, 'setTimeout', (callback: () => void) => { delayed = callback; return 1; });
  try {
    assert.throws(() => downloadText('{}', 'backup.json', 'application/json'), /download blocked/);
    assert(removed); assert(delayed); assert(!revoked); delayed(); assert(revoked);
  } finally { if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('JSON download keeps MIME type, Unicode content and the requested filename', async context => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let blob: Blob | undefined;
  const link = { href: '', download: '', click() {}, remove() {} };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { return link; }, body: { append() {} } } });
  context.mock.method(URL, 'createObjectURL', (value: Blob) => { blob = value; return 'blob:json'; });
  context.mock.method(URL, 'revokeObjectURL', () => {});
  context.mock.method(globalThis, 'setTimeout', (callback: () => void) => { callback(); return 1; });
  try {
    const data = createInitialData();
    const content = createJsonBackup(data, new Date('2026-11-24T12:30:00Z'));
    downloadText(content, 'chrono-backup-2026-11-24.json', 'application/json');
    assert.equal(link.download, 'chrono-backup-2026-11-24.json');
    assert.equal(blob?.type, 'application/json;charset=utf-8');
    assert.equal(await blob?.text(), content);
    assert.deepEqual(JSON.parse(await blob!.text()).tasks, data.tasks);
  } finally { if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('failure while creating anchor still revokes its object URL', context => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let revoked = false;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { throw new Error('no document'); } } });
  context.mock.method(URL, 'createObjectURL', () => 'blob:created');
  context.mock.method(URL, 'revokeObjectURL', () => { revoked = true; });
  context.mock.method(globalThis, 'setTimeout', (callback: () => void) => { callback(); return 1; });
  try { assert.throws(() => downloadText('', 'x.md', 'text/markdown'), /no document/); assert(revoked); }
  finally { if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document'); }
});

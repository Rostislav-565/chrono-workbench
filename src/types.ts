export type TaskTier = 'main' | 'medium' | 'small';
export type Step = { id: string; text: string; done: boolean };
export type Task = { id: string; text: string; tier: TaskTier; done: boolean; steps: Step[]; expanded: boolean };
export type Note = { id: string; text: string; createdAt: number };
export type FocusSession = { id: string; date: string; seconds: number; mode: 'pomodoro' | 'flow'; task: string; demo?: boolean };
export type SoundSettings = { white: number; brown: number; gamma: number; enabled: boolean; clicks: boolean };
export type TimerState = { mode: 'pomodoro' | 'flow'; phase: 'work' | 'break'; status: 'idle' | 'running' | 'paused'; elapsed: number; startedAt: number | null; duration: number; earnedBreak: number; accounted?: number };
export type AppData = { version: 1; theme: 'light' | 'dark'; energy: number; tasks: Task[]; notes: Note[]; sessions: FocusSession[]; sound: SoundSettings; activeTaskId: string | null; timer: TimerState; demoCleared: boolean };

export const breathingPhases = [
  { title: 'Вдох', instruction: 'Медленно вдохните через нос', frequency: 392 },
  { title: 'Задержка', instruction: 'Мягко задержите дыхание', frequency: 440 },
  { title: 'Выдох', instruction: 'Плавно выдохните', frequency: 330 },
  { title: 'Пауза', instruction: 'Расслабьтесь перед новым вдохом', frequency: 294 }
] as const;

export function breathingState(seconds: number) {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.min(60, seconds)) : 0;
  const finished = elapsed >= 60;
  const phaseIndex = Math.floor(Math.min(elapsed, 59.999) / 4) % 4;
  const progress = (elapsed % 4) / 4;
  return {
    elapsed,
    finished,
    phaseIndex,
    phase: breathingPhases[phaseIndex],
    cueIndex: Math.floor(elapsed / 4),
    frequency: finished ? 523.25 : breathingPhases[phaseIndex].frequency,
    phaseRemaining: Math.max(1, 4 - Math.floor(elapsed % 4)),
    remaining: Math.ceil(60 - elapsed),
    scale: finished ? 0.7 : phaseIndex === 0 ? 0.7 + progress * 0.3 : phaseIndex === 1 ? 1 : phaseIndex === 2 ? 1 - progress * 0.3 : 0.7
  };
}

type BreathingClock = { now: () => number; schedule: (tick: () => void, milliseconds: number) => number; cancel: (id: number) => void };
type BreathingSession = { clock: BreathingClock; onUpdate: (seconds: number) => void; onCue: (frequency: number) => void; isMuted: () => boolean };

export function startBreathingSession({ clock, onUpdate, onCue, isMuted }: BreathingSession) {
  const started = clock.now();
  let lastCue = -1;
  let active = true;
  onUpdate(0);
  const timer = clock.schedule(() => {
    if (!active) return;
    const state = breathingState((clock.now() - started) / 1000);
    onUpdate(state.elapsed);
    if (state.cueIndex !== lastCue) {
      lastCue = state.cueIndex;
      if (!isMuted()) onCue(state.frequency);
    }
    if (state.finished) { active = false; clock.cancel(timer); }
  }, 50);
  return () => { active = false; clock.cancel(timer); };
}

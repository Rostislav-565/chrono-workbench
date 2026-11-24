import { useEffect, useRef, useState } from 'react';
import { audioEngine } from './audio';
import { breathingPhases as phases, breathingState, startBreathingSession } from './breathing-timing';
import './audio.css';

export default function Breathing({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { finished, phaseIndex, phase, scale, phaseRemaining, remaining } = breathingState(elapsed);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !element.open) return;
      const controls = Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(control => control.tabIndex >= 0 && control.getClientRects().length > 0);
      event.preventDefault();
      event.stopPropagation();
      if (!controls.length) { element.focus({ preventScroll: true }); return; }
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? event.shiftKey ? controls.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[next].focus({ preventScroll: true });
    };
    document.addEventListener('keydown', trapTab, true);
    const stop = startBreathingSession({
      clock: { now: () => performance.now(), schedule: (tick, delay) => window.setInterval(tick, delay), cancel: id => window.clearInterval(id) },
      onUpdate: setElapsed,
      onCue: frequency => audioEngine.cue(frequency),
      isMuted: () => mutedRef.current
    });
    return () => {
      stop();
      document.removeEventListener('keydown', trapTab, true);
      if (element.open) element.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} className="breath-dialog" aria-labelledby="breath-title" aria-describedby="breath-description" onCancel={event => { event.preventDefault(); closeRef.current(); }}>
    <div className="breath-top"><span className="eyebrow">NERVOUS SYSTEM RESET</span><button type="button" className="icon-button" aria-label="Закрыть дыхательный тренажёр" onClick={onClose}>×</button></div>
    <h2 id="breath-title">Сброс стресса</h2><p id="breath-description">Одна минута. Только вы и дыхание.</p>
    <div className="breath-instrument" aria-hidden="true">
      <svg className="breath-dial" viewBox="0 0 280 280"><circle cx="140" cy="140" r="126" fill="none" stroke="currentColor" opacity=".2" strokeWidth="2" strokeDasharray="1 7"/><circle cx="140" cy="140" r="116" fill="none" stroke="currentColor" opacity=".12" strokeWidth="2"/><circle cx="140" cy="140" r="126" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${(elapsed / 60) * 791.68} 791.68`} transform="rotate(-90 140 140)"/></svg>
      <div className="breath-square" style={{ transform: `scale(${scale})` }}><i/><i/><i/><i/></div>
      <div className="breath-center"><span>{finished ? 'ГОТОВО' : phase.title.toUpperCase()}</span><strong>{finished ? '✓' : phaseRemaining}</strong><small>{finished ? 'ВОЗВРАЩАЕМСЯ В ФОКУС' : 'СЕКУНДЫ'}</small></div>
    </div>
    <p className="breath-instruction" role="status" aria-live="polite">{finished ? 'Хорошо. Сделайте следующий маленький шаг.' : phase.instruction}</p>
    <div className="breath-phases" aria-label="Фазы дыхания">{phases.map((item, index) => <span key={item.title} className={!finished && index === phaseIndex ? 'is-current' : ''}>{item.title}<b>04</b></span>)}</div>
    <div className="breath-bottom"><span>{finished ? '60 / 60 СЕК' : `${String(remaining).padStart(2, '0')} СЕК ОСТАЛОСЬ`}</span><button type="button" className="breath-sound" aria-pressed={!muted} onClick={() => setMuted(value => !value)}>{muted ? 'Звук выключен' : 'Мягкий звук включён'}</button></div>
    {finished && <button type="button" className="button button-primary breath-return" onClick={onClose}>Вернуться к работе</button>}
  </dialog>;
}

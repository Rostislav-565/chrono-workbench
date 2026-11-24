import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SoundSettings } from './types';
import { audioEngine } from './audio';
import './audio.css';

type Props = { sound: SoundSettings; onChange: (sound: SoundSettings) => void; notify: (message: string) => void };
const channels = [
  { key: 'white', name: 'Белый шум', label: 'WHITE / BROADBAND', shape: 'M0 12l3-8 3 16 3-11 3 5 3-12 3 19 3-14 3 10 3-15 3 19 3-12 3 6 3-11 3 8 3-3 3 8' },
  { key: 'brown', name: 'Коричневый шум', label: 'BROWN / LOW FREQUENCY', shape: 'M0 15C8 15 8 4 16 4S24 21 32 21 40 8 48 8' },
  { key: 'gamma', name: 'Бинауральный ритм', label: 'GAMMA / 40 HZ', shape: 'M0 12C3-2 5-2 8 12S13 26 16 12 21-2 24 12 29 26 32 12 37-2 40 12 45 26 48 12' }
] as const;

export default function AudioPanel({ sound, onChange, notify }: Props) {
  const active = useSyncExternalStore(audioEngine.subscribe, audioEngine.getActive);
  const [pending, setPending] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  useEffect(() => { audioEngine.setClickEnabled(sound.clicks); }, [sound.clicks]);
  useEffect(() => {
    if (active) void audioEngine.setLevels({ ...sound, enabled: true }).catch(() => {
      audioEngine.stop();
      notify('Не удалось включить звук. Попробуйте ещё раз.');
    });
  }, [sound.white, sound.brown, sound.gamma, sound.clicks, active]);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    const next = { ...sound, enabled: !active };
    try {
      const applied = await audioEngine.setLevels(next);
      if (applied) onChange({ ...soundRef.current, enabled: next.enabled });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Звук недоступен.');
    } finally { setPending(false); }
  };

  return <section className="module audio-panel" aria-labelledby="audio-heading">
    <div className="module-head"><div><span className="eyebrow">SOUND ENVIRONMENT</span><h2 id="audio-heading">Акустическая среда</h2></div><button type="button" className={`audio-power ${active ? 'is-on' : ''}`} aria-label={active ? 'Выключить звуковой микшер' : 'Включить звуковой микшер'} aria-pressed={active} disabled={pending} onClick={() => void toggle()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v9M7 5.7a8 8 0 1 0 10 0"/></svg></button></div>
    <div className="audio-status"><span className={`audio-led ${active ? 'is-on' : ''}`}/>{active ? 'СИНТЕЗАТОР ВКЛЮЧЁН' : 'НАЖМИТЕ ⏻ ДЛЯ ЗВУКА'}<span>STEREO</span></div>
    <div className="audio-channels">{channels.map(channel => <div className="audio-channel" key={channel.key}>
      <div className="audio-channel-title"><label htmlFor={`audio-${channel.key}`}>{channel.name}</label><svg viewBox="0 0 48 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d={channel.shape}/></svg></div>
      <div className="audio-fader-row"><input id={`audio-${channel.key}`} type="range" min="0" max="100" step="1" value={sound[channel.key]} onChange={event => onChange({ ...sound, [channel.key]: Number(event.target.value) })} aria-valuetext={`${sound[channel.key]} процентов`} style={{ '--level': `${sound[channel.key]}%` } as React.CSSProperties}/><output htmlFor={`audio-${channel.key}`}>{String(sound[channel.key]).padStart(2, '0')}</output></div>
      <div className="audio-channel-meta"><span>{channel.label}</span><span>{channel.key === 'gamma' ? '200 L · 240 R' : '0 — 100'}</span></div>
    </div>)}</div>
    <div className="audio-footer"><span>Для 40 Гц используйте наушники</span><label className="audio-clicks"><input type="checkbox" checked={sound.clicks} onChange={event => onChange({ ...sound, clicks: event.target.checked })}/><span className="audio-toggle-track"/><span>Клики</span></label></div>
  </section>;
}

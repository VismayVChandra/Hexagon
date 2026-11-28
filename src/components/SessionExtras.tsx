import { useState } from 'react';
import type { FocusRating, PlanTask } from '../types';
import { addActiveTask, removeActiveTask, toggleActiveTask, updateSettings, useStore } from '../store/store';
import { AMBIENT_SOUNDS, previewAmbient, stopAmbient } from '../lib/ambient';
import { haptic, primeAudio, showToast } from '../hooks/hooks';
import { Icon } from './Icon';

/** The session's plan: tick things off as you go, add more as they come to mind. */
export function PlanCard({ tasks }: { tasks: PlanTask[] }) {
  const { data } = useStore();
  const [text, setText] = useState('');
  const done = tasks.filter((t) => t.done).length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (addActiveTask(text)) {
      setText('');
      haptic('tap', data.settings.haptics);
    } else showToast(tasks.length >= 12 ? 'That’s plenty for one session.' : 'That’s already on your list.', 'info');
  }

  return (
    <section className="card plan-card" aria-labelledby="plan-h">
      <div className="card-head">
        <h2 id="plan-h" className="card-title">
          Plan
        </h2>
        {tasks.length > 0 && (
          <span className="muted small" aria-live="polite">
            {done} of {tasks.length} done
          </span>
        )}
      </div>
      {tasks.length > 0 && (
        <ul className="task-list">
          {tasks.map((t) => (
            <li key={t.id} className={t.done ? 'is-done' : ''}>
              <label className="task">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => {
                    toggleActiveTask(t.id);
                    haptic(t.done ? 'tap' : 'success', data.settings.haptics);
                  }}
                />
                <span className="task-box" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <span className="task-text">{t.text}</span>
              </label>
              <button type="button" className="icon-btn task-x" aria-label={`Remove “${t.text}”`} onClick={() => removeActiveTask(t.id)}>
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="task-add" onSubmit={add}>
        <label className="sr-only" htmlFor="task-new">
          Add something to get done
        </label>
        <input id="task-new" value={text} maxLength={100} autoComplete="off" enterKeyHint="done" placeholder={tasks.length ? 'Add another' : 'What do you want to get done?'} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-secondary" disabled={!text.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

/**
 * Choose a background sound. While no session is running, tapping one also plays a few seconds of it so you can hear it first.
 * During a session it just switches, and plays as part of the session.
 */
export function SoundPicker({ canPreview, headingId }: { canPreview: boolean; headingId?: string }) {
  const { data } = useStore();
  const { ambient, ambientVolume } = data.settings;
  const [trying, setTrying] = useState<string | null>(null);
  const current = AMBIENT_SOUNDS.find((s) => s.id === ambient) ?? AMBIENT_SOUNDS[0];

  function choose(id: (typeof AMBIENT_SOUNDS)[number]['id']) {
    primeAudio(); // a tap is what lets the browser play sound
    updateSettings({ ambient: id });
    if (!canPreview) return;
    if (id === 'off') {
      stopAmbient();
      setTrying(null);
    } else {
      previewAmbient(id, ambientVolume, 12, () => setTrying(null));
      setTrying(id);
    }
  }

  const groups: { label: string; ids: string[] }[] = [
    { label: 'Nature', ids: AMBIENT_SOUNDS.filter((s) => s.group === 'nature').map((s) => s.id) },
    { label: 'Steady noise', ids: AMBIENT_SOUNDS.filter((s) => s.group === 'noise').map((s) => s.id) },
  ];

  return (
    <>
      <div role="radiogroup" aria-label="Study sound" aria-labelledby={headingId}>
      <div className="chips">
        <button type="button" role="radio" aria-checked={ambient === 'off'} className={`chip${ambient === 'off' ? ' is-on' : ''}`} onClick={() => choose('off')}>
          Off
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="eyebrow sound-group">{g.label}</p>
          <div role="group" aria-label={g.label} className="chips">
            {g.ids.map((id) => {
              const sound = AMBIENT_SOUNDS.find((x) => x.id === id)!;
              return (
                <button key={id} type="button" role="radio" aria-checked={ambient === id} className={`chip${ambient === id ? ' is-on' : ''}`} onClick={() => choose(sound.id)}>
                  {sound.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      </div>
      <p className="muted small" role="status">
        {trying
          ? `Playing a preview of ${current.label.toLowerCase()}…`
          : ambient === 'off'
            ? 'Study in silence, or add a calm background sound. They’re made on your device, so they work offline.'
            : `${current.blurb}. Plays while the timer runs, and rests during breaks and pauses.`}
        {trying && (
          <>
            {' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                stopAmbient();
                setTrying(null);
              }}
            >
              Stop
            </button>
          </>
        )}
      </p>
      {ambient !== 'off' && (
        <label className="volume">
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={ambientVolume} aria-label="Study sound volume" onChange={(e) => updateSettings({ ambientVolume: Number(e.target.value) })} />
        </label>
      )}
    </>
  );
}

/** The sound card on the session page. */
export function SoundCard() {
  const { data } = useStore();
  const running = !!data.active && data.active.resumedAt != null;
  return (
    <section className="card" aria-labelledby="sound-h">
      <h2 id="sound-h" className="card-title">
        Study sound
      </h2>
      <SoundPicker canPreview={!running} headingId="sound-h" />
    </section>
  );
}

export const FOCUS_LABELS: Record<FocusRating, string> = { 1: 'Scattered', 2: 'Drifting', 3: 'Okay', 4: 'Focused', 5: 'Locked in' };

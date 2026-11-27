import { useState } from 'react';
import type { FocusRating, PlanTask } from '../types';
import { addActiveTask, removeActiveTask, toggleActiveTask, updateSettings, useStore } from '../store/store';
import { AMBIENT_SOUNDS } from '../lib/ambient';
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

/** Pick a background sound. It plays while the timer runs and hushes during breaks and pauses. */
export function SoundCard() {
  const { data } = useStore();
  const { ambient, ambientVolume } = data.settings;
  const current = AMBIENT_SOUNDS.find((s) => s.id === ambient) ?? AMBIENT_SOUNDS[0];
  return (
    <section className="card" aria-labelledby="sound-h">
      <h2 id="sound-h" className="card-title">
        Sound
      </h2>
      <div role="radiogroup" aria-labelledby="sound-h" className="chips">
        {AMBIENT_SOUNDS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={ambient === s.id}
            className={`chip${ambient === s.id ? ' is-on' : ''}`}
            onClick={() => {
              primeAudio(); // a tap is what lets the browser play sound
              updateSettings({ ambient: s.id });
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted small">{ambient === 'off' ? 'Study in silence, or add a calm background sound. It’s made on your device, so it works offline.' : `${current.blurb}. Plays while the timer runs, and rests during breaks and pauses.`}</p>
      {ambient !== 'off' && (
        <label className="volume">
          <span>Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={ambientVolume} aria-label="Sound volume" onChange={(e) => updateSettings({ ambientVolume: Number(e.target.value) })} />
        </label>
      )}
    </section>
  );
}

const FOCUS_LABELS: Record<FocusRating, string> = { 1: 'Scattered', 2: 'Drifting', 3: 'Okay', 4: 'Focused', 5: 'Locked in' };

/** "How focused were you?" for the finish dialog. Optional; tapping the chosen one again clears it. */
export function FocusPicker({ value, onChange }: { value?: FocusRating; onChange: (v: FocusRating | undefined) => void }) {
  return (
    <div className="field">
      <span id="focus-label" className="field-label">
        How focused did it feel? <span className="muted">(optional)</span>
      </span>
      <div role="radiogroup" aria-labelledby="focus-label" className="focus-picker">
        {([1, 2, 3, 4, 5] as FocusRating[]).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5, ${FOCUS_LABELS[n]}`} className={`focus-dot${value != null && n <= value ? ' is-on' : ''}${value === n ? ' is-picked' : ''}`} onClick={() => onChange(value === n ? undefined : n)}>
            <span aria-hidden="true">{n}</span>
          </button>
        ))}
      </div>
      <p className="hint" aria-live="polite">
        {value ? FOCUS_LABELS[value] : 'Helps Progress show when you focus best.'}
      </p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { updateSettings, useStore } from '../store/store';
import { showToast } from '../hooks/hooks';
import { Toggle } from './bits';
import { SoundPicker } from './SessionExtras';
import { CUES, CUE_TONE_LABELS, previewCue } from '../lib/sfx';
import { anchorDayFor, nudgeSupport, notifyPermission, requestNotifyPermission, showNotification, type NotifyPermission } from '../lib/notify';
import { nudgeMessage } from '../lib/messages';
import { dayKey, daysBetween } from '../lib/time';
import { CUE_TONES, type CueTone } from '../types';

/** Settings → Sounds: the tunes for timers, plus the library of study sounds. */
export function SoundSettings() {
  const { data } = useStore();
  const s = data.settings;
  const active = data.active;
  const running = !!active && active.resumedAt != null;

  return (
    <>
      <section className="card" aria-labelledby="cues-h">
        <h2 id="cues-h" className="card-title">
          Timer sounds
        </h2>
        <Toggle id="s-sound" checked={s.sound} onChange={(v) => updateSettings({ sound: v })} label="Play timer sounds" description="Each moment has its own tune: starting, pausing, a finished timer, Pomodoro focus and break, stopwatch milestones and rewards." />

        <div className={s.sound ? '' : 'is-dim'}>
          <p className="field-label" id="tone-h">
            Voice
          </p>
          <div role="radiogroup" aria-labelledby="tone-h" className="chips">
            {CUE_TONES.map((t: CueTone) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={s.cueTone === t}
                disabled={!s.sound}
                className={`chip${s.cueTone === t ? ' is-on' : ''}`}
                onClick={() => {
                  updateSettings({ cueTone: t });
                  previewCue('timerDone', t, s.cueVolume);
                }}
              >
                {CUE_TONE_LABELS[t]}
              </button>
            ))}
          </div>
          <label className="volume">
            <span>Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={s.cueVolume} disabled={!s.sound} aria-label="Timer sound volume" onChange={(e) => updateSettings({ cueVolume: Number(e.target.value) })} onPointerUp={() => previewCue('start', s.cueTone, s.cueVolume)} onKeyUp={() => previewCue('start', s.cueTone, s.cueVolume)} />
          </label>
          <Toggle id="s-repeat" checked={s.cueRepeat} disabled={!s.sound} onChange={(v) => updateSettings({ cueRepeat: v })} label="Ring three times when a timer ends" description="So you notice it. Tap anywhere to silence it." />
          <div className="field">
            <label htmlFor="s-sw">Stopwatch chime</label>
            <select id="s-sw" value={s.stopwatchChimeMin} disabled={!s.sound} onChange={(e) => updateSettings({ stopwatchChimeMin: Number(e.target.value) })}>
              <option value={0}>Never</option>
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
            </select>
            <p className="hint">A soft ding while the stopwatch runs, so you know how long you’ve been at it.</p>
          </div>
        </div>

        <h3 className="mini-title">Hear each sound</h3>
        <ul className="cue-list">
          {CUES.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.label}</strong>
                <span className="muted small">{c.when}</span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => previewCue(c.id, s.cueTone, s.cueVolume)} aria-label={`Play the ${c.label.toLowerCase()} sound`}>
                Play
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">If you can’t hear anything, check that your phone isn’t on silent and that the volume is up. Sounds play with the screen off, as long as your browser allows sound.</p>
      </section>

      <section className="card" aria-labelledby="amb-h">
        <h2 id="amb-h" className="card-title">
          Study sounds
        </h2>
        <p className="muted small">Calm background sound while the timer runs. Tap one to hear it. It rests during breaks and pauses.</p>
        <SoundPicker canPreview={!running} headingId="amb-h" />
      </section>
    </>
  );
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'am' : 'pm'}`;

/** Settings → Notifications. */
export function NotificationSettings() {
  const { data } = useStore();
  const s = data.settings;
  const [perm, setPerm] = useState<NotifyPermission>(() => notifyPermission());
  const [background, setBackground] = useState(false);

  useEffect(() => {
    void nudgeSupport().then((n) => setBackground(n.background));
  }, []);

  async function toggleMaster(on: boolean) {
    if (!on) {
      updateSettings({ notify: false });
      return;
    }
    const p = await requestNotifyPermission();
    setPerm(p);
    if (p === 'granted') {
      updateSettings({ notify: true, notifyPromptDismissed: true });
      void showNotification({ title: 'Notifications are on 🐝', body: 'You’ll get alerts when timers end, and a note of what you earned.' }, { tag: 'hexagon-test', route: '/settings' });
    } else {
      updateSettings({ notify: false });
      showToast(p === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser’s site settings.' : 'This browser can’t show notifications.', 'error');
    }
  }

  const on = s.notify && perm === 'granted';

  return (
    <section className="card" aria-labelledby="notif-h">
      <h2 id="notif-h" className="card-title">
        Notifications
      </h2>
      <Toggle
        id="s-notify"
        checked={on}
        onChange={(v) => void toggleMaster(v)}
        disabled={perm === 'unsupported'}
        label="Allow notifications"
        description={
          perm === 'unsupported'
            ? 'This browser doesn’t support notifications. On iPhone, add Hexagon to your Home Screen first (iOS 16.4 or later).'
            : perm === 'denied'
              ? 'Blocked for this site. Allow notifications in your browser’s site settings, then switch this on.'
              : 'Alerts and rewards on your device. Nothing is sent to a server.'
        }
      />
      <div className={on ? '' : 'is-dim'}>
        <Toggle id="s-n-timer" checked={s.notifyTimer} disabled={!on} onChange={(v) => updateSettings({ notifyTimer: v })} label="Timer and break alerts" description="When a timer, focus block or break ends while Hexagon is in the background. If your phone puts the app to sleep, the alert arrives when you reopen it. A study sound keeps it awake." />
        <Toggle id="s-n-reward" checked={s.notifyRewards} disabled={!on} onChange={(v) => updateSettings({ notifyRewards: v })} label="Rewards and milestones" description="What you earned when you save a session (honey cells, streak, rank, cars), and when you reach your daily goal." />
        <Toggle
          id="s-n-nudge"
          checked={s.notifyNudges}
          disabled={!on}
          onChange={(v) => updateSettings({ notifyNudges: v })}
          label="Come-back reminders"
          description={background ? 'A friendly nudge if you haven’t studied for a day or more. Never at night, one a day at most, and they stop after two weeks away.' : 'A friendly nudge after a day or more away. Your browser can’t send these while Hexagon is closed (they need the installed app on Android Chrome), so you’ll see a come-back card when you open the app instead.'}
        />
        <div className="field">
          <label htmlFor="s-n-hour">Remind me from</label>
          <select id="s-n-hour" value={s.nudgeHour} disabled={!on || !s.notifyNudges} onChange={(e) => updateSettings({ nudgeHour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!on}
          onClick={() => void showNotification({ title: 'Time’s up — 25m of Biology', body: 'Open Hexagon to save it and collect your honey.' }, { tag: 'hexagon-test', route: '/settings' }).then((ok) => !ok && showToast('Couldn’t show a notification.', 'error'))}
        >
          Send a test notification
        </button>
      </div>
    </section>
  );
}

/** One-time card on Home: offer notifications once the student has studied at least once. */
export function NotifyPrompt() {
  const { data } = useStore();
  const s = data.settings;
  const hasStudied = data.sessions.some((x) => !x.demo);
  const [perm, setPerm] = useState<NotifyPermission>(() => notifyPermission());
  if (s.notifyPromptDismissed || s.notify || !hasStudied || data.active || perm !== 'default') return null;

  async function turnOn() {
    const p = await requestNotifyPermission();
    setPerm(p);
    updateSettings({ notify: p === 'granted', notifyPromptDismissed: true });
    if (p === 'granted') showToast('Notifications on. Adjust them in Settings.');
  }

  return (
    <section className="card prompt-card" aria-labelledby="np-h">
      <h2 id="np-h" className="card-title">
        Want a buzz when your timer ends?
      </h2>
      <p className="muted small">Hexagon can tell you when a timer or break is over, what you earned after a session, and give a gentle nudge if you’ve been away. You choose which, and can change it any time in Settings.</p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void turnOn()}>
          Turn on notifications
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => updateSettings({ notifyPromptDismissed: true })}>
          Not now
        </button>
      </div>
    </section>
  );
}

/** Shown on Home after two or more days away: a warm, small way back in. */
export function ComebackCard() {
  const { data } = useStore();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('hexagon.comeback') === dayKey(Date.now());
    } catch {
      return false;
    }
  });
  const real = data.sessions.filter((x) => !x.demo);
  if (hidden || data.active || real.length === 0) return null;
  const gap = daysBetween(anchorDayFor(real, Date.now()), dayKey(Date.now()));
  if (gap < 2) return null;
  const msg = nudgeMessage(gap, { name: data.settings.displayName.trim(), streak: 0 });

  return (
    <section className="card comeback-card" aria-labelledby="cb-h">
      <h2 id="cb-h" className="card-title">
        {msg.title}
      </h2>
      <p className="muted small">{msg.body}</p>
      <div className="row">
        <Link to="/study" className="btn btn-primary">
          Start a short session
        </Link>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            try {
              sessionStorage.setItem('hexagon.comeback', dayKey(Date.now()));
            } catch {
              /* just hide it for now */
            }
            setHidden(true);
          }}
        >
          Later
        </button>
      </div>
    </section>
  );
}

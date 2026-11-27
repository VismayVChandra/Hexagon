import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { exportJson, getState, hasDemoData, removeDemoData, resetEverything, updateSettings, useStore } from '../store/store';
import { hapticsSupported, showToast, useInstall, wakeLockSupported } from '../hooks/hooks';
import { Field, Toggle } from '../components/bits';
import { cloudConfigured } from '../cloud/config';
import { deleteCloudData, renameSelf, useCloud } from '../cloud/cloud';
import { formatFriendCode } from '../cloud/presence';
import type { ThemePref } from '../types';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { dayKey } from '../lib/time';
import type { Settings } from '../types';

function toForm(s: Settings) {
  return {
    name: s.displayName,
    daily: String(s.dailyGoalMin),
    weekly: String(Math.round((s.weeklyGoalMin / 60) * 100) / 100),
    focus: String(s.pomodoro.focusMin),
    brk: String(s.pomodoro.breakMin),
    long: String(s.pomodoro.longBreakMin),
    cycles: String(s.pomodoro.cyclesBeforeLong),
  };
}

const THEMES: { id: ThemePref; label: string; icon: 'sun' | 'moon' | 'device' }[] = [
  { id: 'system', label: 'System', icon: 'device' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
];

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

export default function SettingsPage() {
  const { data, storageKind } = useStore();
  const { settings } = data;
  const install = useInstall();
  const cloud = useCloud();
  const live = cloudConfigured && cloud.phase === 'signed-in';
  const [confirmDeleteCloud, setConfirmDeleteCloud] = useState(false);
  const [cloudName, setCloudName] = useState(cloud.profile?.displayName ?? '');
  const [cloudNameError, setCloudNameError] = useState<string>();
  const loc = useLocation();
  const [confirmReset, setConfirmReset] = useState(false);

  const [form, setForm] = useState(() => toForm(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (loc.hash === '#privacy') document.getElementById('privacy')?.scrollIntoView();
  }, [loc.hash]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const daily = num(form.daily);
    const weekly = num(form.weekly);
    const int = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
    if (form.name.length > 30) errs.name = 'Keep your name under 30 characters.';
    if (!int(daily, 5, 720)) errs.daily = 'Whole minutes, 5–720.';
    if (!(Number.isFinite(weekly) && weekly >= 0.25 && weekly <= 70)) errs.weekly = 'Hours between 0.25 and 70.';
    if (!int(num(form.focus), 1, 180)) errs.focus = '1–180 minutes.';
    if (!int(num(form.brk), 1, 60)) errs.brk = '1–60 minutes.';
    if (!int(num(form.long), 1, 90)) errs.long = '1–90 minutes.';
    if (!int(num(form.cycles), 1, 10)) errs.cycles = '1–10 blocks.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    updateSettings({
      displayName: form.name.trim(),
      dailyGoalMin: daily,
      weeklyGoalMin: Math.round(weekly * 60),
      pomodoro: { focusMin: num(form.focus), breakMin: num(form.brk), longBreakMin: num(form.long), cyclesBeforeLong: num(form.cycles) },
    });
    showToast('Settings saved.');
  }

  function download() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hexagon-export-${dayKey(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const f = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }), 'aria-invalid': !!errors[k] });

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <section className="card" aria-labelledby="look-h">
        <h2 id="look-h" className="card-title">
          Appearance
        </h2>
        <div role="radiogroup" aria-labelledby="look-h" className="segmented">
          {THEMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={settings.theme === t.id} className={`segment${settings.theme === t.id ? ' is-on' : ''}`} onClick={() => updateSettings({ theme: t.id })}>
              <Icon name={t.icon} size={18} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <p className="hint">{settings.theme === 'system' ? 'Follows your device’s light or dark setting.' : `Always ${settings.theme}, whatever your device is set to.`}</p>
      </section>

      <form onSubmit={save} noValidate className="stack">
        <section className="card" aria-labelledby="prof-h">
          <h2 id="prof-h" className="card-title">
            You & goals
          </h2>
          <Field label="Your name (shown on Home only)" htmlFor="s-name" error={errors.name}>
            <input id="s-name" autoComplete="given-name" maxLength={40} {...f('name')} />
          </Field>
          <div className="grid-2">
            <Field label="Daily goal (minutes)" htmlFor="s-daily" error={errors.daily}>
              <input id="s-daily" inputMode="numeric" {...f('daily')} />
            </Field>
            <Field label="Weekly goal (hours)" htmlFor="s-weekly" error={errors.weekly}>
              <input id="s-weekly" inputMode="decimal" {...f('weekly')} />
            </Field>
          </div>
        </section>

        <section className="card" aria-labelledby="pomo-h">
          <h2 id="pomo-h" className="card-title">
            Pomodoro defaults
          </h2>
          <div className="grid-4">
            <Field label="Focus (min)" htmlFor="s-focus" error={errors.focus}>
              <input id="s-focus" inputMode="numeric" {...f('focus')} />
            </Field>
            <Field label="Break (min)" htmlFor="s-brk" error={errors.brk}>
              <input id="s-brk" inputMode="numeric" {...f('brk')} />
            </Field>
            <Field label="Long break (min)" htmlFor="s-long" error={errors.long}>
              <input id="s-long" inputMode="numeric" {...f('long')} />
            </Field>
            <Field label="Blocks before long" htmlFor="s-cycles" error={errors.cycles}>
              <input id="s-cycles" inputMode="numeric" {...f('cycles')} />
            </Field>
          </div>
        </section>
        <button type="submit" className="btn btn-primary">
          Save changes
        </button>
      </form>

      <section className="card" aria-labelledby="sess-h">
        <h2 id="sess-h" className="card-title">
          During sessions
        </h2>
        <Toggle
          id="s-awake"
          checked={settings.keepAwake}
          onChange={(v) => updateSettings({ keepAwake: v })}
          disabled={!wakeLockSupported}
          label="Keep screen on while timing"
          description={wakeLockSupported ? 'Uses your browser’s screen wake lock.' : 'Not supported by this browser. The timer stays accurate regardless.'}
        />
        <Toggle id="s-haptics" checked={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} disabled={!hapticsSupported} label="Vibration feedback" description={hapticsSupported ? 'A light buzz when you start, pause and finish.' : 'Not supported by this browser (iPhone browsers don’t allow it).'} />
        <Toggle id="s-sound" checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} label="Chime when a block ends" description="Plays only while Hexagon is open on screen. It can’t alert you in the background." />
      </section>

      <section className="card" id="privacy" aria-labelledby="priv-h" tabIndex={-1}>
        <h2 id="priv-h" className="card-title">
          Privacy
        </h2>
        <p className="muted small">Your study data stays on this device. Nothing is uploaded, and there’s no analytics.</p>
        <Toggle id="s-presence" checked={settings.sharePresence} onChange={(v) => updateSettings({ sharePresence: v, ...(v ? {} : { shareSubject: false }) })} label="Let friends see when I’m studying" description={live ? 'Off by default. When on, friends you’ve accepted can see when you’re studying.' : cloudConfigured ? 'Off by default. Sign in on the Friends page to share with real friends. Until then it only affects simulated rooms.' : 'Off by default. In this demo it only affects how you appear in simulated rooms on this device.'} />
        <Toggle id="s-subject" checked={settings.shareSubject} disabled={!settings.sharePresence} onChange={(v) => updateSettings({ shareSubject: v })} label="Also show my subject" description="Only available if the setting above is on." />
      </section>

      {cloudConfigured && (
        <section className="card" aria-labelledby="acct-h">
          <h2 id="acct-h" className="card-title">
            Friends
          </h2>
          {live && cloud.profile ? (
            <>
              <p>
                Your friend code: <strong>{formatFriendCode(cloud.profile.friendCode)}</strong>{' '}
                <Link to="/friends" className="link-btn">
                  Share or replace it
                </Link>
              </p>
              <form
                className="inline-form"
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await renameSelf(cloudName);
                  setCloudNameError(r.ok ? undefined : r.error);
                  if (r.ok) showToast('Name updated.');
                }}
              >
                <Field label="Name shown to friends" htmlFor="cloud-rename" error={cloudNameError}>
                  <input id="cloud-rename" value={cloudName} maxLength={30} autoComplete="given-name" aria-invalid={!!cloudNameError} onChange={(e) => setCloudName(e.target.value)} />
                </Field>
                <button type="submit" className="btn btn-secondary btn-sm">
                  Save name
                </button>
              </form>
              <p className="hint">
                Your study sessions never leave this device. Friends only see your name, and your status if you share it. Your friends account lives in this browser: if you clear site data or switch phones, you’ll get a new code and need to add friends again.
              </p>
              <button type="button" className="btn btn-quiet btn-danger-text" disabled={cloud.busy} onClick={() => setConfirmDeleteCloud(true)}>
                Delete my friends data
              </button>
            </>
          ) : (
            <p className="muted">
              Friends isn’t turned on. <Link to="/friends" className="link-btn">Turn it on in the Friends tab</Link> to get a code to share.
            </p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmDeleteCloud}
        title="Delete your friends data?"
        message="This removes your name, friend code, friendships and shared status from the server and turns friends off on this device. Your study sessions here are not affected."
        confirmLabel="Delete friends data"
        danger
        onConfirm={() => {
          setConfirmDeleteCloud(false);
          void deleteCloudData().then(() => showToast('Friends data deleted.', 'info'));
        }}
        onCancel={() => setConfirmDeleteCloud(false)}
      />

      <section className="card" aria-labelledby="inst-h">
        <h2 id="inst-h" className="card-title">
          Install
        </h2>
        {install.standalone ? (
          <p>
            <Icon name="check" size={16} className="inline-icon" /> Hexagon is installed and running as an app.
          </p>
        ) : install.canPrompt ? (
          <button type="button" className="btn btn-secondary" onClick={() => void install.prompt()}>
            <Icon name="download" size={18} /> Install Hexagon
          </button>
        ) : install.ios ? (
          <p className="muted">
            In Safari, tap <Icon name="share" size={16} className="inline-icon" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>. It then opens full screen like an app.
          </p>
        ) : (
          <p className="muted">Use your browser’s menu (look for “Install app” or “Add to Home screen”). Some browsers only offer it once the site is served over HTTPS.</p>
        )}
      </section>

      <section className="card" aria-labelledby="data-h">
        <h2 id="data-h" className="card-title">
          Your data
        </h2>
        <p className="muted small">
          {storageKind === 'local'
            ? 'Saved in this browser’s local storage. Clearing site data, or using a different browser or device, starts you from scratch — export a copy if it matters.'
            : 'Browser storage is blocked, so data lasts only until you close this tab.'}
        </p>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={download}>
            <Icon name="download" size={18} /> Export as JSON
          </button>
          {hasDemoData(data) && (
            <button type="button" className="btn btn-secondary" onClick={() => { removeDemoData(); showToast('Demo data removed.'); }}>
              Remove demo data
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-danger-text" onClick={() => setConfirmReset(true)}>
            Delete everything
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="about-h">
        <h2 id="about-h" className="card-title">
          About this version
        </h2>
        <ul className="facts">
          <li>Timers use real timestamps, so they stay correct if the page is backgrounded, refreshed or reopened.</li>
          <li>Friends, rooms and presence are simulated demos — no server is connected.</li>
          <li>No push notifications or background alerts. Chimes only play while the app is open.</li>
          <li>Works offline after the first load.</li>
        </ul>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Delete everything?"
        message="All sessions, subjects, exams, friends and settings on this device will be erased and can’t be recovered. Export first if you might want them."
        confirmLabel="Delete everything"
        danger
        onConfirm={() => {
          setConfirmReset(false);
          void resetEverything().then(() => {
            setForm(toForm(getState().data.settings));
            showToast('All data deleted.', 'info');
          });
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

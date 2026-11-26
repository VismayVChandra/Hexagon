import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { discardSession, extendActive, finishSession, pauseActive, resumeActive, skipActiveBreak, updateSettings, useStore } from '../store/store';
import { chime, haptic, showToast, useMediaQuery, useNow, useWakeLock, wakeLockSupported } from '../hooks/hooks';
import { computeView, modeLabel } from '../lib/timer';
import { dayKey, formatClock, formatDuration, spokenDuration, MIN } from '../lib/time';
import { todayMs } from '../lib/stats';
import { ROOMS, friendPresence } from '../data/friendsSim';
import { Bar, DemoBadge, FriendAvatar, ProgressRing, StateBadge, SubjectDot, Toggle } from '../components/bits';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Dialog } from '../components/Dialog';

function encouragement(studiedMs: number, todayTotal: number, goalMs: number, isBreak: boolean): string {
  if (isBreak) return 'Rest well. You’ve earned it.';
  if (todayTotal >= goalMs) return 'Daily goal reached. Everything from here is a bonus.';
  const m = studiedMs / MIN;
  if (m < 2) return 'Settle in. The first few minutes are the hardest.';
  if (m < 25) return 'You’re finding your rhythm.';
  if (m < 60) return 'Deep focus. Keep going.';
  return 'A long, strong session. Rest your eyes when you can.';
}

export default function Session() {
  const { data } = useStore();
  const navigate = useNavigate();
  const active = data.active;
  const running = !!active && active.resumedAt != null;
  const now = useNow(true, 250);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [notes, setNotes] = useState('');
  // Set just before we clear the session ourselves, so the "no session -> go to Study" redirect doesn't race our own navigation.
  const leaving = useRef(false);
  const wake = useWakeLock(running && data.settings.keepAwake);
  // Smaller ring on short screens so the controls stay in view without scrolling.
  const compact = useMediaQuery('(max-height: 780px)');

  const view = active ? computeView(active, now) : null;
  const subject = active ? data.subjects.find((s) => s.id === active.subjectId) : undefined;

  // Chime when a block ends or a break ends — only while the app is open and sound is on.
  const lastKey = useRef<string | null>(null);
  const phaseKey = view ? `${view.phase}:${view.block}` : null;
  const phase = view?.phase;
  useEffect(() => {
    if (phaseKey == null) return;
    const prev = lastKey.current;
    lastKey.current = phaseKey;
    if (prev == null || prev === phaseKey || !running || !data.settings.sound) return;
    chime(phase === 'focus' ? 'start' : 'end');
  }, [phaseKey, phase, running, data.settings.sound]);

  // Show the time in the tab title so it's visible when the tab is in the background.
  useEffect(() => {
    if (!active || !view) return;
    const label = view.phase === 'break' ? 'Break' : view.done ? 'Done' : subject?.name ?? 'Studying';
    document.title = `${formatClock(view.displayMs)} · ${label} — Hexagon`;
    return () => {
      document.title = 'Hexagon — study, together and quietly';
    };
  });

  if (!active || !view) {
    if (leaving.current) return null;
    return <Navigate to="/study" replace />;
  }

  const room = ROOMS.find((r) => r.id === active.roomId);
  const companions = data.friends.filter((f) => active.friendIds.includes(f.id));
  const isBreak = view.phase === 'break';
  const stateLabel = view.done ? 'Time’s up' : isBreak ? 'Break' : !view.running ? 'Paused' : active.config.mode === 'pomodoro' ? `Focus ${view.block}` : 'Studying';
  const ringProgress = view.progress ?? (view.totalRunMs % 60_000) / 60_000;
  const mode = active.config.mode;

  function openFinish() {
    haptic('tap', data.settings.haptics);
    pauseActive();
    setFinishing(true);
  }

  function save() {
    leaving.current = true;
    const r = finishSession(notes);
    if (r.ok) {
      setFinishing(false);
      setNotes('');
      haptic('success', data.settings.haptics);
      navigate('/', { replace: true });
    } else {
      leaving.current = false;
      showToast(r.error, 'error');
    }
  }

  function discard() {
    leaving.current = true;
    discardSession();
    setDiscarding(false);
    setFinishing(false);
    navigate('/study', { replace: true });
  }

  const shortSession = view.studiedMs < MIN;

  function toggleRun() {
    haptic('tap', data.settings.haptics);
    if (view!.running) pauseActive();
    else resumeActive();
  }

  const goalMs = data.settings.dailyGoalMin * MIN;
  const todayTotal = todayMs(data.sessions, now) + (dayKey(active.startedAt) === dayKey(now) ? view.studiedMs : 0);
  const note = encouragement(view.studiedMs, todayTotal, goalMs, isBreak);

  return (
    <div className="page session">
      <div className="session-top">
        <Link to="/" className="link-btn session-back">
          <Icon name="home" size={16} /> Home — timer keeps running
        </Link>
      </div>

      <div className="session-head">
        <p className="eyebrow">
          {modeLabel(mode)}
          {room ? ` · ${room.name}` : ''}
        </p>
        <h1 className="session-subject">
          <SubjectDot subject={subject} size={14} /> {subject?.name ?? 'Study session'}
        </h1>
        {(active.topic || active.goal) && (
          <p className="muted session-topic">
            {active.topic}
            {active.topic && active.goal ? ' — ' : ''}
            {active.goal && <em>{active.goal}</em>}
          </p>
        )}
      </div>

      <div className={`timer-stage${isBreak ? ' is-break' : ''}${!view.running && !view.done ? ' is-paused' : ''}`}>
        <div className={`ring-timer${mode === 'stopwatch' ? ' ring-wrap' : ''}`}>
          <ProgressRing value={ringProgress} size={compact ? 224 : 280} stroke={12} label={`${stateLabel}. ${formatClock(view.displayMs)} ${mode === 'stopwatch' ? 'elapsed' : 'remaining'}`}>
            <div role="timer" aria-label="Session timer" className="timer-readout">
              <span className="timer-digits">{formatClock(view.displayMs)}</span>
              <span className="timer-state">
                {isBreak ? <Icon name="coffee" size={16} /> : null}
                {stateLabel}
              </span>
            </div>
          </ProgressRing>
        </div>
        <p className="sr-only" role="status">
          {spokenDuration(view.studiedMs)} studied. {stateLabel}.
        </p>

        {isBreak ? (
          <p className="timer-note">Breathe, stretch, have some water. Break time isn’t counted as study time.</p>
        ) : view.done ? (
          <p className="timer-note">You studied the full {formatDuration(view.studiedMs)}. Finish up, or add a little more time.</p>
        ) : mode === 'pomodoro' ? (
          <p className="timer-note">{view.nextBreakLong ? 'A long break follows this block.' : 'A short break follows this block.'}</p>
        ) : (
          <p className="timer-note">{!view.running ? 'Paused — time isn’t counting.' : mode === 'countdown' ? 'Counting down your study time.' : 'Counting up. Stop whenever you’re ready.'}</p>
        )}

        <dl className="session-stats">
          <div>
            <dt>Studied</dt>
            <dd>{formatDuration(view.studiedMs)}</dd>
          </div>
          {mode === 'pomodoro' && (
            <div>
              <dt>Breaks</dt>
              <dd>{formatDuration(view.breakMs)}</dd>
            </div>
          )}
        </dl>

        <div className="today-progress">
          <div className="subject-bars-top small">
            <span className="muted">Today including this session</span>
            <span className="muted">
              {formatDuration(todayTotal)} / {formatDuration(goalMs)}
            </span>
          </div>
          <Bar value={todayTotal / goalMs} color={todayTotal >= goalMs ? 'var(--honey)' : 'var(--primary)'} label="Today's goal progress" />
          <p className="encourage">{note}</p>
        </div>

        <div className="controls">
          {view.done ? (
            <>
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => extendActive(5)}>
                +5 min
              </button>
              <button type="button" className="btn btn-secondary btn-lg" onClick={() => extendActive(10)}>
                +10 min
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-lg ctl-main" onClick={toggleRun}>
              <Icon name={view.running ? 'pause' : 'play'} size={20} />
              {view.running ? 'Pause' : 'Resume'}
            </button>
          )}
          {isBreak && (
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => skipActiveBreak()}>
              <Icon name="skip" size={18} /> Skip break
            </button>
          )}
          <button type="button" className={`btn btn-lg ${view.done ? 'btn-primary' : 'btn-secondary'}`} onClick={openFinish}>
            <Icon name="flag" size={18} /> Finish
          </button>
        </div>
        <button type="button" className="link-btn danger-link" onClick={() => setDiscarding(true)}>
          Discard session
        </button>
      </div>

      {(companions.length > 0 || room) && (
        <section className="card" aria-labelledby="with-h">
          <div className="card-head">
            <h2 id="with-h" className="card-title">
              Studying alongside
            </h2>
            <DemoBadge>Simulated</DemoBadge>
          </div>
          {room && companions.length === 0 ? (
            <p className="muted small">You’re in <strong>{room.name}</strong>. Friends in this demo room are simulated on this device.</p>
          ) : (
            <ul className="companions">
              {companions.map((f) => {
                const p = friendPresence(f, now);
                return (
                  <li key={f.id}>
                    <FriendAvatar friend={f} state={p.state} size={36} />
                    <span className="pick-name">{f.name}</span>
                    <span className="muted small">{p.state === 'studying' ? formatDuration(p.sessionMs) : ''}</span>
                    <StateBadge state={p.state} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="card-title">This session</h2>
        <Toggle
          id="keep-awake"
          checked={data.settings.keepAwake}
          onChange={(v) => updateSettings({ keepAwake: v })}
          disabled={!wakeLockSupported}
          label="Keep screen on"
          description={
            !wakeLockSupported
              ? 'Not supported by this browser. The timer stays accurate even if your screen locks.'
              : wake === 'on'
                ? 'Your screen won’t dim while the timer runs.'
                : 'Off, or waiting for the timer to run. The timer stays accurate either way.'
          }
        />
        <p className="hint lock-note">
          <Icon name="lock" size={14} /> {data.settings.sharePresence ? `Visible to friends in demo rooms${data.settings.shareSubject ? ', with your subject' : ''}.` : 'Private. Nobody can see this session.'}
        </p>
      </section>

      <Dialog open={finishing} onClose={() => { setFinishing(false); }} title="Finish session">
        <div className="finish-summary">
          <div>
            <span className="eyebrow">Studied</span>
            <strong className="big-num">{formatDuration(view.studiedMs)}</strong>
          </div>
          {view.breakMs > 0 && (
            <div>
              <span className="eyebrow">Breaks (not counted)</span>
              <strong className="big-num dim">{formatDuration(view.breakMs)}</strong>
            </div>
          )}
        </div>
        <p className="muted small">
          {subject?.name}
          {active.topic ? ` · ${active.topic}` : ''}
        </p>
        {shortSession && <p className="banner banner-info small">That’s under a minute. You can still save it, or discard it.</p>}
        <div className="field">
          <label htmlFor="notes">What did you study? (optional)</label>
          <textarea id="notes" rows={4} maxLength={600} value={notes} placeholder="Problems finished, chapters read, what to revisit…" onChange={(e) => setNotes(e.target.value)} />
          <p className="hint">{notes.length}/600</p>
        </div>
        <div className="dialog-actions dialog-actions-stack">
          <button type="button" className="btn btn-primary btn-lg" onClick={save}>
            Save session
          </button>
          <div className="row row-split">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setFinishing(false);
                resumeActive();
              }}
            >
              Keep studying
            </button>
            <button type="button" className="btn btn-quiet btn-danger-text" onClick={() => setDiscarding(true)}>
              Discard
            </button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={discarding}
        title="Discard this session?"
        message={`You’ve studied ${formatDuration(view.studiedMs)} so far. If you discard, none of it is saved and it won’t count toward your progress.`}
        confirmLabel="Discard session"
        cancelLabel="Keep it"
        danger
        onConfirm={discard}
        onCancel={() => setDiscarding(false)}
      />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { discardSession, extendActive, finishSession, getState, pauseActive, resumeActive, skipActiveBreak, updateSettings, useStore } from '../store/store';
import { haptic, showToast, useMediaQuery, useNow, useWakeLock, wakeLockSupported } from '../hooks/hooks';
import { computeView } from '../lib/timer';
import { dayKey, formatClock, formatDuration, spokenDuration, MIN } from '../lib/time';
import { todayMs } from '../lib/stats';
import { ROOMS, friendPresence } from '../data/friendsSim';
import { useFriendRows } from '../cloud/useFriendRows';
import { Bar, DemoBadge, FriendAvatar, ProgressRing, StateBadge, SubjectDot, Toggle } from '../components/bits';
import { Icon } from '../components/Icon';
import { Bee } from '../components/Bee';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { HoneycombScene } from '../components/CombView';
import { CarScene } from '../components/CarArt';
import { buildMs, carById } from '../data/cars';
import { CELL_MS } from '../lib/hive';
import { FocusPicker, PlanCard, SoundCard } from '../components/SessionExtras';
import type { FocusRating } from '../types';

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
  const [sheet, setSheet] = useState<null | 'plan' | 'options'>(null);
  const [notes, setNotes] = useState('');
  const [focus, setFocus] = useState<FocusRating | undefined>();
  // Opening the finish sheet pauses the clock; if it is dismissed rather than saved, pick up where the student was.
  const resumeOnClose = useRef(false);
  // Set just before we clear the session ourselves, so the "no session -> go to Study" redirect doesn't race our own navigation.
  const leaving = useRef(false);
  const wake = useWakeLock(running && data.settings.keepAwake);
  const { live, rows: friendRows } = useFriendRows(now);
  // Smaller ring on short screens so the controls stay in view without scrolling.
  const compact = useMediaQuery('(max-height: 780px)');

  const view = active ? computeView(active, now) : null;
  const subject = active ? data.subjects.find((s) => s.id === active.subjectId) : undefined;

  // Building a car: progress carries over from earlier sessions, so add what's already in the workshop.
  const car = active?.scene === 'car' ? carById(active.carId) : undefined;
  const carProgress = car && view ? ((data.builds[car.id] ?? 0) + view.studiedMs) / buildMs(car) : 0;

  // Space (or K) pauses and resumes, for desktop use. Ignored while typing, on buttons and links, and while a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key !== ' ' && e.key.toLowerCase() !== 'k') return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable], dialog')) return;
      if (document.querySelector('dialog[open]')) return;
      const a = getState().data.active;
      if (!a || computeView(a, Date.now()).done) return;
      e.preventDefault();
      if (a.resumedAt != null) pauseActive();
      else resumeActive();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  const companions = live ? [] : data.friends.filter((f) => active.friendIds.includes(f.id));
  const liveStudying = live ? friendRows.filter((r) => r.state === 'studying') : [];
  const isBreak = view.phase === 'break';
  const stateLabel = view.done ? 'Time’s up' : isBreak ? 'Break' : !view.running ? 'Paused' : active.config.mode === 'pomodoro' ? `Focus ${view.block}` : 'Studying';
  const ringProgress = view.progress ?? (view.totalRunMs % 60_000) / 60_000;
  const mode = active.config.mode;
  const scene = active.scene === 'car' && car ? 'car' : active.scene === 'minimal' ? 'minimal' : 'honeycomb';
  const sceneState = view.done ? 'done' : isBreak ? 'break' : !view.running ? 'paused' : 'working';

  // Honeycomb: outline the cells that make up this session's goal (a countdown, or the current Pomodoro block).
  let goalRange: { fromMs: number; toMs: number } | null = null;
  if (mode === 'countdown') goalRange = { fromMs: 0, toMs: (active.config.targetMin ?? 25) * MIN };
  else if (mode === 'pomodoro' && active.config.pomodoro) {
    const focus = active.config.pomodoro.focusMin * MIN;
    const idx = isBreak ? view.block : view.block - 1; // during a break, preview the next block
    goalRange = { fromMs: idx * focus, toMs: (idx + 1) * focus };
  }
  const cellsNow = Math.floor(view.studiedMs / CELL_MS);

  function openFinish() {
    haptic('tap', data.settings.haptics);
    resumeOnClose.current = !!view?.running;
    pauseActive();
    setFinishing(true);
  }

  function closeFinish() {
    setFinishing(false);
    if (resumeOnClose.current) resumeActive();
    resumeOnClose.current = false;
  }

  function save() {
    leaving.current = true;
    const r = finishSession(notes, focus);
    if (r.ok) {
      setFinishing(false);
      setNotes('');
      setFocus(undefined);
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

  const paused = !view.running && !view.done && !isBreak;
  const cycles = mode === 'pomodoro' ? (active.config.pomodoro?.cyclesBeforeLong ?? 0) : 0;
  const round = cycles > 0 ? ((Math.max(1, view.block) - 1) % cycles) + 1 : 0;
  const tasks = active.tasks ?? [];
  const tasksDone = tasks.filter((t) => t.done).length;
  const cellsLine =
    scene === 'honeycomb' ? `+${cellsNow} ${cellsNow === 1 ? 'cell' : 'cells'} so far` : scene === 'car' && car ? `${car.brand} ${car.model} · ${Math.min(100, Math.floor(carProgress * 100))}% built` : '';
  const timerSub = [view.done ? 'Time’s up' : mode === 'stopwatch' ? 'studied' : 'left in focus', cellsLine].filter(Boolean).join(' · ');
  const nextFocusMin = active.config.pomodoro?.focusMin;

  const friendsSection =
    companions.length > 0 || room || liveStudying.length > 0 ? (
      <section className="sheet-block" aria-labelledby="with-h">
        <div className="card-head">
          <h3 id="with-h" className="card-title">
            {live ? 'Friends studying now' : 'Studying alongside'}
          </h3>
          {!live && <DemoBadge>Simulated</DemoBadge>}
        </div>
        {live ? (
          liveStudying.length === 0 ? (
            <p className="muted small">None of your friends are studying right now{room ? `, but you’re in ${room.name}` : ''}.</p>
          ) : (
            <ul className="companions">
              {liveStudying.map((r) => (
                <li key={r.removeId}>
                  <FriendAvatar friend={r} state={r.state} size={36} />
                  <span className="pick-name">{r.name}</span>
                </li>
              ))}
            </ul>
          )
        ) : room && companions.length === 0 ? (
          <p className="muted small">
            You’re in <strong>{room.name}</strong>. Friends in this demo room are simulated on this device.
          </p>
        ) : (
          <ul className="companions">
            {companions.map((f) => {
              const p = friendPresence(f, now);
              return (
                <li key={f.id}>
                  <FriendAvatar friend={f} state={p.state} size={36} />
                  <span className="pick-name">{f.name}</span>
                  <StateBadge state={p.state} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    ) : null;

  return (
    <div className="page session">
      <div className={`fm${isBreak ? ' is-break' : ''}${paused ? ' is-paused' : ''}`}>
        <div className="fm-top">
          <Link to="/" className="fm-icon" aria-label="Home. The timer keeps running.">
            <Icon name="home" size={20} />
          </Link>
          <span className="fm-pill">
            <SubjectDot subject={subject} size={12} />
            <span className="fm-pill-text">
              {subject?.name ?? 'Study session'}
              {active.topic ? ` · ${active.topic}` : ''}
            </span>
          </span>
          {paused && <span className="fm-badge">Paused</span>}
          <button type="button" className="fm-icon" aria-label="Session options: sound, friends, screen" onClick={() => setSheet('options')}>
            <Icon name="headphones" size={20} />
          </button>
        </div>

        {cycles > 0 && (
          <div className="fm-rounds" role="img" aria-label={`${isBreak ? 'Break after' : 'Round'} ${round} of ${cycles}`}>
            {Array.from({ length: cycles }, (_, i) => (
              <span key={i} className={i < round ? 'on' : ''} />
            ))}
          </div>
        )}

        <div className="fm-stage">
          {isBreak ? (
            <>
              <div className="fm-break-pip">
                <div className="pip-float">
                  <Bee pose="sleepy" size={150} />
                </div>
              </div>
              <div role="timer" aria-label="Break timer" className="fm-timer">
                <span className="fm-digits fm-digits-sm">{formatClock(view.displayMs)}</span>
              </div>
              <p className="fm-break-title">Stretch, sip water.</p>
              <p className="fm-sub">
                Next: {subject?.name ?? 'Study'} focus{nextFocusMin ? ` · ${nextFocusMin} min` : ''}
              </p>
            </>
          ) : (
            <>
              {scene === 'minimal' ? (
                <div className="ring-timer">
                  <ProgressRing value={ringProgress} size={compact ? 224 : 280} stroke={12} label={`${stateLabel}. ${formatClock(view.displayMs)} ${mode === 'stopwatch' ? 'elapsed' : 'remaining'}`}>
                    <div role="timer" aria-label="Session timer" className="fm-timer">
                      <span className="fm-digits fm-digits-sm">{formatClock(view.displayMs)}</span>
                      <span className="fm-sub">{timerSub}</span>
                    </div>
                  </ProgressRing>
                </div>
              ) : (
                <>
                  <div className="scene-wrap fm-scene">{scene === 'car' && car ? <CarScene car={car} progress={carProgress} state={sceneState} /> : <HoneycombScene studiedMs={view.studiedMs} state={sceneState} goal={goalRange} />}</div>
                  <div role="timer" aria-label="Session timer" className="fm-timer">
                    <span className="fm-digits">{formatClock(view.displayMs)}</span>
                    <span className="fm-sub">{timerSub}</span>
                  </div>
                </>
              )}
              {paused && <p className="fm-note">Take your time. Pausing never costs you cells or your streak.</p>}
              {view.done && <p className="fm-note">You studied the full {formatDuration(view.studiedMs)}. Finish up, or add a little more time.</p>}
            </>
          )}
          <p className="sr-only" role="status">
            {spokenDuration(view.studiedMs)} studied. {stateLabel}.
          </p>
        </div>

        <div className="fm-controls">
          {view.done ? (
            <>
              <div className="fm-row">
                <button type="button" className="fm-btn" onClick={() => extendActive(5)}>
                  +5 min
                </button>
                <button type="button" className="fm-btn" onClick={() => extendActive(10)}>
                  +10 min
                </button>
              </div>
              <button type="button" className="fm-btn fm-btn-honey" onClick={openFinish}>
                <Icon name="flag" size={18} /> Finish
              </button>
            </>
          ) : isBreak ? (
            <>
              <button type="button" className="fm-btn fm-btn-light" onClick={() => skipActiveBreak()}>
                <Icon name="skip" size={18} /> Skip break
              </button>
              <button type="button" className="fm-btn" onClick={openFinish}>
                Finish session
              </button>
            </>
          ) : paused ? (
            <>
              <button type="button" className="fm-btn fm-btn-honey" onClick={toggleRun}>
                <Icon name="play" size={18} /> Resume
              </button>
              <button type="button" className="fm-btn" onClick={openFinish}>
                Finish session
              </button>
            </>
          ) : (
            <div className="fm-main-row">
              <button type="button" className="fm-ghost fm-ghost-start" onClick={openFinish}>
                Finish
              </button>
              <button type="button" className="fm-pause" aria-label="Pause" onClick={toggleRun}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4.2" height="14" rx="1.3" />
                  <rect x="13.8" y="5" width="4.2" height="14" rx="1.3" />
                </svg>
              </button>
              <button type="button" className="fm-ghost fm-ghost-end" onClick={() => setSheet('plan')} aria-label={tasks.length ? `Plan: ${tasksDone} of ${tasks.length} done` : 'Add a plan'}>
                <Icon name="list" size={18} /> {tasks.length ? `${tasksDone}/${tasks.length}` : 'Plan'}
              </button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={sheet === 'plan'} onClose={() => setSheet(null)} title="Plan">
        <PlanCard tasks={tasks} />
      </Dialog>

      <Dialog open={sheet === 'options'} onClose={() => setSheet(null)} title="Session options">
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
        <SoundCard />
        {friendsSection}
        <section className="sheet-block">
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
            <Icon name="lock" size={14} /> {data.settings.sharePresence ? 'Friends can see that you’re studying.' : 'Private. Nobody can see this session.'}
          </p>
        </section>
        <button
          type="button"
          className="btn btn-quiet btn-danger-text"
          onClick={() => {
            setSheet(null);
            setDiscarding(true);
          }}
        >
          Discard session
        </button>
      </Dialog>

      <Dialog open={finishing} onClose={closeFinish} title="Finish session">
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
        {active.tasks && active.tasks.length > 0 && (
          <p className="muted small">
            Plan: {active.tasks.filter((t) => t.done).length} of {active.tasks.length} done
          </p>
        )}
        <FocusPicker value={focus} onChange={setFocus} />
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
                resumeOnClose.current = false;
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

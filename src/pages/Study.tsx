import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { addSubject, startSession, useStore, validateSubjectName } from '../store/store';
import { PRESET_COUNTDOWNS } from '../data/seed';
import { ROOMS, friendPresence } from '../data/friendsSim';
import { useFriendRows } from '../cloud/useFriendRows';
import { haptic, primeAudio, useNow } from '../hooks/hooks';
import { formatDuration, MIN } from '../lib/time';
import type { PomodoroConfig, Scene, TimerMode } from '../types';
import { CARS, TIERS, buildMs, carById, carsInTier } from '../data/cars';
import { CarArt } from '../components/CarArt';
import { CarPhoto } from '../components/CarPhoto';
import { Bar, DemoBadge, Field, FriendAvatar, StateBadge, SubjectDot } from '../components/bits';
import { Icon } from '../components/Icon';

const MODES: { id: TimerMode; label: string; blurb: string }[] = [
  { id: 'stopwatch', label: 'Stopwatch', blurb: 'Count up. Stop when you’re done.' },
  { id: 'countdown', label: 'Countdown', blurb: 'Study for a set time.' },
  { id: 'pomodoro', label: 'Pomodoro', blurb: 'Focus and break cycles.' },
];

function omit(o: Record<string, string>, ...keys: string[]) {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
}

const toNum = (s: string) => (s.trim() === '' ? NaN : Number(s));

export default function Study() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const now = useNow(true, 30_000);

  const room = ROOMS.find((r) => r.id === params.get('room')) ?? null;

  const [subjectId, setSubjectId] = useState(() => {
    const last = data.settings.lastSubjectId;
    return data.subjects.some((s) => s.id === last) ? (last as string) : (data.subjects[0]?.id ?? '');
  });
  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [mode, setMode] = useState<TimerMode>(room?.mode ?? 'stopwatch');
  const [countdown, setCountdown] = useState('45');
  const [pomo, setPomo] = useState({
    focus: String(room?.focusMin ?? data.settings.pomodoro.focusMin),
    brk: String(room?.breakMin ?? data.settings.pomodoro.breakMin),
    long: String(data.settings.pomodoro.longBreakMin),
    cycles: String(data.settings.pomodoro.cyclesBeforeLong),
  });
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const collected = new Set(data.garage.map((g) => g.carId));
  const todo = CARS.filter((c) => !collected.has(c.id));
  const allCollected = todo.length === 0;
  // Offer the car you've made the most progress on first, otherwise the cheapest one left.
  const bestIn = (cars: typeof CARS) => [...cars].filter((c) => !collected.has(c.id)).sort((a, b) => (data.builds[b.id] ?? 0) / buildMs(b) - (data.builds[a.id] ?? 0) / buildMs(a) || a.tier - b.tier)[0];
  const [carId, setCarId] = useState<string | undefined>(() => bestIn(CARS)?.id);
  const [tier, setTier] = useState<number>(() => carById(bestIn(CARS)?.id)?.tier ?? 1);
  const [scene, setScene] = useState<Scene>(() => (data.settings.scene === 'car' && allCollected ? 'honeycomb' : data.settings.scene));
  const [addingSubject, setAddingSubject] = useState(data.subjects.length === 0);
  const [newSubject, setNewSubject] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const { live, rows } = useFriendRows(now);
  const presences = useMemo(() => data.friends.map((f) => ({ f, p: friendPresence(f, now) })), [data.friends, now]);

  if (data.active) return <Navigate to="/session" replace />;

  const locked = room != null;

  function createSubject() {
    const err = validateSubjectName(newSubject, data.subjects);
    if (err) {
      setErrors((e) => ({ ...e, newSubject: err }));
      return;
    }
    const r = addSubject(newSubject);
    if (r.ok) {
      setSubjectId(r.value.id);
      setNewSubject('');
      setAddingSubject(false);
      setErrors((e) => omit(e, 'newSubject', 'subject'));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!subjectId) errs.subject = 'Choose a subject, or add a new one.';
    if (topic.length > 80) errs.topic = 'Keep the topic under 80 characters.';
    if (goal.length > 120) errs.goal = 'Keep the goal under 120 characters.';

    const cd = toNum(countdown);
    if (mode === 'countdown' && !(Number.isInteger(cd) && cd >= 1 && cd <= 600)) errs.countdown = 'Enter whole minutes between 1 and 600.';

    let pomodoro: PomodoroConfig | undefined;
    if (mode === 'pomodoro') {
      const focusMin = toNum(pomo.focus);
      const breakMin = toNum(pomo.brk);
      const longBreakMin = toNum(pomo.long);
      const cyclesBeforeLong = toNum(pomo.cycles);
      const int = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
      if (!int(focusMin, 1, 180)) errs.focus = 'Focus: 1–180 minutes.';
      if (!int(breakMin, 1, 60)) errs.brk = 'Break: 1–60 minutes.';
      if (!int(longBreakMin, 1, 90)) errs.long = 'Long break: 1–90 minutes.';
      if (!int(cyclesBeforeLong, 1, 10)) errs.cycles = 'Cycles: 1–10.';
      pomodoro = { focusMin, breakMin, longBreakMin, cyclesBeforeLong };
    }

    if (scene === 'car' && !carId) errs.car = 'Choose a car to build.';

    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => (formRef.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
      return;
    }

    primeAudio(); // allows the end-of-block chime to play later
    haptic('press', data.settings.haptics);
    const r = startSession({
      subjectId,
      topic,
      goal,
      config: mode === 'countdown' ? { mode, targetMin: cd } : mode === 'pomodoro' ? { mode, pomodoro } : { mode },
      scene,
      carId: scene === 'car' ? carId : undefined,
      friendIds: room || live ? [] : friendIds,
      roomId: room?.id,
    });
    if (r.ok) navigate('/session', { replace: true });
    else setErrors({ form: r.error });
  }

  const toggleFriend = (id: string) => setFriendIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const roomMates = room ? rows.filter((r) => r.state === 'studying' && r.roomId === room.id) : [];

  return (
    <div className="page">
      <h1 className="page-title">Start studying</h1>
      <p className="page-sub">Pick a subject and begin. Everything else is optional.</p>

      <form ref={formRef} onSubmit={submit} noValidate className="stack">
        {room && (
          <div className="banner banner-info">
            <Icon name="users" />
            <div>
              <p>
                <strong>{room.name}</strong> <DemoBadge>Demo room</DemoBadge>
              </p>
              <p className="muted">
                {room.blurb} The timer settings come from the room.{' '}
                <button type="button" className="link-btn" onClick={() => setParams({}, { replace: true })}>
                  Leave room
                </button>
              </p>
            </div>
          </div>
        )}

        <section className="card" aria-labelledby="subj-h">
          <h2 id="subj-h" className="card-title">
            Subject
          </h2>
          {data.subjects.length > 0 && (
            <div role="radiogroup" aria-labelledby="subj-h" className="chips">
              {data.subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={subjectId === s.id}
                  className={`chip${subjectId === s.id ? ' is-on' : ''}`}
                  onClick={() => {
                    setSubjectId(s.id);
                    setErrors((e) => omit(e, 'subject'));
                  }}
                >
                  <SubjectDot subject={s} />
                  {s.name}
                </button>
              ))}
              {!addingSubject && (
                <button type="button" className="chip chip-add" onClick={() => setAddingSubject(true)}>
                  <Icon name="plus" size={16} /> New subject
                </button>
              )}
            </div>
          )}
          {errors.subject && (
            <p className="field-error" role="alert">
              {errors.subject}
            </p>
          )}
          {addingSubject && (
            <div className="inline-form">
              <Field label="New subject name" htmlFor="new-subject" error={errors.newSubject}>
                <input
                  id="new-subject"
                  value={newSubject}
                  maxLength={60}
                  autoComplete="off"
                  aria-invalid={!!errors.newSubject}
                  aria-describedby={errors.newSubject ? 'new-subject-err' : undefined}
                  placeholder="e.g. Physics"
                  onChange={(e) => setNewSubject(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      createSubject();
                    }
                  }}
                />
              </Field>
              <div className="row">
                <button type="button" className="btn btn-secondary" onClick={createSubject}>
                  Add subject
                </button>
                {data.subjects.length > 0 && (
                  <button type="button" className="btn btn-quiet" onClick={() => { setAddingSubject(false); setNewSubject(''); setErrors((e) => omit(e, 'newSubject')); }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="grid-2">
            <Field label="Topic (optional)" htmlFor="topic" error={errors.topic}>
              <input id="topic" value={topic} maxLength={100} autoComplete="off" placeholder="e.g. Integration by parts" aria-invalid={!!errors.topic} onChange={(e) => setTopic(e.target.value)} />
            </Field>
            <Field label="Goal for this session (optional)" htmlFor="goal" error={errors.goal}>
              <input id="goal" value={goal} maxLength={140} autoComplete="off" placeholder="e.g. Finish problem set 4" aria-invalid={!!errors.goal} onChange={(e) => setGoal(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="card" aria-labelledby="mode-h">
          <h2 id="mode-h" className="card-title">
            Timer
          </h2>
          <div role="radiogroup" aria-labelledby="mode-h" className="segmented">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                disabled={locked && room?.mode !== m.id}
                className={`segment${mode === m.id ? ' is-on' : ''}`}
                onClick={() => setMode(m.id)}
              >
                <span>{m.label}</span>
                <small>{m.blurb}</small>
              </button>
            ))}
          </div>

          {mode === 'countdown' && (
            <div className="mode-panel">
              <div className="chips" role="group" aria-label="Countdown presets">
                {PRESET_COUNTDOWNS.map((m) => (
                  <button key={m} type="button" className={`chip${countdown === String(m) ? ' is-on' : ''}`} aria-pressed={countdown === String(m)} onClick={() => setCountdown(String(m))}>
                    {m} min
                  </button>
                ))}
              </div>
              <Field label="Minutes" htmlFor="cd" error={errors.countdown}>
                <input id="cd" inputMode="numeric" value={countdown} aria-invalid={!!errors.countdown} onChange={(e) => setCountdown(e.target.value)} />
              </Field>
            </div>
          )}

          {mode === 'pomodoro' && (
            <div className="mode-panel">
              <p className="muted small">
                Focus blocks are counted as study time. Breaks are not. After {pomo.cycles || '…'} focus blocks you get a long break.
              </p>
              <div className="grid-4">
                <Field label="Focus (min)" htmlFor="pf" error={errors.focus}>
                  <input id="pf" inputMode="numeric" value={pomo.focus} disabled={locked} aria-invalid={!!errors.focus} onChange={(e) => setPomo({ ...pomo, focus: e.target.value })} />
                </Field>
                <Field label="Break (min)" htmlFor="pb" error={errors.brk}>
                  <input id="pb" inputMode="numeric" value={pomo.brk} disabled={locked} aria-invalid={!!errors.brk} onChange={(e) => setPomo({ ...pomo, brk: e.target.value })} />
                </Field>
                <Field label="Long break (min)" htmlFor="pl" error={errors.long}>
                  <input id="pl" inputMode="numeric" value={pomo.long} disabled={locked} aria-invalid={!!errors.long} onChange={(e) => setPomo({ ...pomo, long: e.target.value })} />
                </Field>
                <Field label="Blocks before long" htmlFor="pc" error={errors.cycles}>
                  <input id="pc" inputMode="numeric" value={pomo.cycles} disabled={locked} aria-invalid={!!errors.cycles} onChange={(e) => setPomo({ ...pomo, cycles: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="scene-h">
          <h2 id="scene-h" className="card-title">
            While you study
          </h2>
          <div role="radiogroup" aria-labelledby="scene-h" className="segmented">
            <button type="button" role="radio" aria-checked={scene === 'honeycomb'} className={`segment${scene === 'honeycomb' ? ' is-on' : ''}`} onClick={() => setScene('honeycomb')}>
              <span>Honeycomb</span>
              <small>Fill honey cells</small>
            </button>
            <button type="button" role="radio" aria-checked={scene === 'car'} disabled={allCollected} className={`segment${scene === 'car' ? ' is-on' : ''}`} onClick={() => setScene('car')}>
              <span>Build a car</span>
              <small>{allCollected ? 'Garage full' : 'Collect cars'}</small>
            </button>
            <button type="button" role="radio" aria-checked={scene === 'minimal'} className={`segment${scene === 'minimal' ? ' is-on' : ''}`} onClick={() => setScene('minimal')}>
              <span>Minimal</span>
              <small>Just a ring</small>
            </button>
          </div>

          {scene === 'honeycomb' && <p className="muted small">Every 5 minutes of focus fills a honey cell, and your cells grow into your hive.</p>}
          {scene === 'minimal' && <p className="muted small">A plain progress ring. Honey from timed sessions still goes into your hive.</p>}
          {scene === 'car' && (
            <>
              <p className="muted small">Pick a car. The longer you focus, the more of it gets built: frame, wheels, suspension, engine, body, paint. Progress carries over between sessions, and finished cars go in your garage.</p>
              <div role="radiogroup" aria-label="Car tier" className="tier-chips">
                {TIERS.map((t) => {
                  const inTier = carsInTier(t.n);
                  const left = inTier.filter((c) => !collected.has(c.id)).length;
                  return (
                    <button
                      key={t.n}
                      type="button"
                      role="radio"
                      aria-checked={tier === t.n}
                      className={`chip${tier === t.n ? ' is-on' : ''}`}
                      onClick={() => {
                        setTier(t.n);
                        const pick = bestIn(inTier);
                        if (pick) setCarId(pick.id);
                        setErrors((e) => omit(e, 'car'));
                      }}
                    >
                      {t.name} · {t.buildMin >= 60 ? `${t.buildMin / 60}h` : `${t.buildMin}m`}
                      <span className="sr-only">, {left} left to build</span>
                    </button>
                  );
                })}
              </div>
              <p className="muted small">{TIERS[tier - 1].blurb}</p>
              <div role="radiogroup" aria-label="Choose a car" className="car-picker">
                {carsInTier(tier as 1 | 2 | 3 | 4 | 5).map((car) => {
                  const owned = collected.has(car.id);
                  const progress = owned ? 1 : Math.min(1, (data.builds[car.id] ?? 0) / buildMs(car));
                  const selected = carId === car.id;
                  return (
                    <button
                      key={car.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={owned}
                      className={`car-option${selected ? ' is-on' : ''}${owned ? ' is-owned' : ''}`}
                      onClick={() => {
                        setCarId(car.id);
                        setErrors((e) => omit(e, 'car'));
                      }}
                    >
                      {owned ? <CarPhoto car={car} /> : <CarArt car={car} locked label="" />}
                      {!owned && progress > 0 && <Bar value={progress} label={`${car.name} build progress`} />}
                      <small className="car-brand">{car.brand}</small>
                      <span className="car-option-name">{car.model}</span>
                      <small className="muted">{owned ? 'In your garage' : progress > 0 ? `${Math.floor(progress * 100)}% built` : 'Not started'}</small>
                    </button>
                  );
                })}
              </div>
              <p className="muted small">
                <Link to="/garage" className="link-btn">
                  See your whole garage
                </Link>
              </p>
              {errors.car && (
                <p className="field-error" role="alert">
                  {errors.car}
                </p>
              )}
            </>
          )}
        </section>

        {!room && live && (
          <section className="card" aria-labelledby="fr-h">
            <h2 id="fr-h" className="card-title">
              Study with friends
            </h2>
            <p className="muted small">
              Friends you’ve accepted can see when you’re studying if you share your status.{' '}
              <Link to="/settings#privacy" className="link-btn">
                Privacy settings
              </Link>
            </p>
          </section>
        )}

        {!room && !live && (
          <section className="card" aria-labelledby="fr-h">
            <div className="card-head">
              <h2 id="fr-h" className="card-title">
                Study with friends
              </h2>
              <DemoBadge>Demo</DemoBadge>
            </div>
            {presences.length === 0 ? (
              <p className="muted">Add friends on the Friends tab to study alongside them.</p>
            ) : (
              <>
                <p className="muted small">Chosen friends show next to your timer. They’re simulated on this device — nobody is invited or notified.</p>
                <ul className="pick-list">
                  {presences.map(({ f, p }) => (
                    <li key={f.id}>
                      <label className="pick">
                        <input type="checkbox" checked={friendIds.includes(f.id)} onChange={() => toggleFriend(f.id)} />
                        <FriendAvatar friend={f} state={p.state} size={34} />
                        <span className="pick-name">{f.name}</span>
                        <StateBadge state={p.state} />
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {room && (
          <section className="card" aria-label="Friends in this room">
            <h2 className="card-title">In the room now</h2>
            {roomMates.length === 0 ? (
              <p className="muted">{live ? 'None of your friends are in this room right now.' : 'No simulated friends are in this room right now. You’ll have it to yourself.'}</p>
            ) : (
              <ul className="avatar-row">
                {roomMates.map((r) => (
                  <li key={r.removeId}>
                    <FriendAvatar friend={r} state={r.state} size={36} /> {r.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}

        <div className="sticky-action">
          <button type="submit" className="btn btn-primary btn-lg btn-block">
            <Icon name="play" size={18} /> Begin session
            {mode === 'countdown' && Number.isInteger(toNum(countdown)) && toNum(countdown) > 0 ? ` · ${formatDuration(toNum(countdown) * MIN)}` : ''}
          </button>
        </div>
      </form>
    </div>
  );
}

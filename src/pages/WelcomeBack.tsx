import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { startSession, useStore } from '../store/store';
import { haptic, primeAudio, showToast } from '../hooks/hooks';
import { useSetupFor } from '../hooks/quickStart';
import { Bee } from '../components/Bee';
import { HiveMini, MINI_CELLS } from '../components/HiveMini';
import { subjectColor } from '../components/bits';
import { COMB_CAPACITY, hiveSummary } from '../lib/hive';
import { examPlan } from '../lib/goals';
import { longestStreak } from '../lib/stats';
import { MIN, dayKey, formatDuration, relativeDays, daysBetween } from '../lib/time';

/** Shown once a day after two or more days away. It never counts or mentions missed days. */
export default function WelcomeBack() {
  const { data } = useStore();
  const navigate = useNavigate();
  const setupOf = useSetupFor();
  const now = Date.now();
  const today = dayKey(now);
  const name = data.settings.displayName.trim();

  useEffect(() => {
    try {
      sessionStorage.setItem('hexagon.comeback', today);
    } catch {
      /* it just may show again */
    }
  }, [today]);

  const real = useMemo(() => data.sessions.filter((s) => !s.demo), [data.sessions]);
  const best = useMemo(() => longestStreak(real), [real]);
  const hive = useMemo(() => hiveSummary(data.sessions), [data.sessions]);
  const miniFilled = hive.inCurrent === 0 ? 0 : Math.max(1, Math.round((hive.inCurrent / COMB_CAPACITY) * MINI_CELLS));
  const subject = data.subjects.find((s) => s.id === data.settings.lastSubjectId && !s.demo) ?? data.subjects.find((s) => !s.demo);

  // The nearest upcoming exam, with the small daily amount that gets there.
  const exam = useMemo(() => {
    const upcoming = data.exams.filter((e) => !e.demo && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!upcoming) return null;
    const plan = examPlan(upcoming, data.sessions, now);
    const days = Math.max(1, plan.daysLeft);
    const perDayMin = Math.max(15, Math.ceil(plan.remainingMs / days / MIN / 5) * 5);
    return { subject: data.subjects.find((s) => s.id === upcoming.subjectId), daysLeft: daysBetween(today, upcoming.date), perDayMin, done: plan.remainingMs <= 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.exams, data.sessions, data.subjects, today]);

  function easeIn() {
    if (!subject) return navigate('/study', { replace: true });
    primeAudio();
    haptic('press', data.settings.haptics);
    const s = setupOf(subject.id);
    const r = startSession({ subjectId: subject.id, topic: '', goal: '', config: { mode: 'countdown', targetMin: 10 }, scene: s.scene, carId: s.carId, friendIds: [] });
    if (r.ok) navigate('/session', { replace: true });
    else showToast(r.error, 'error');
  }

  return (
    <div className="wb">
      <div className="wb-body">
        <div className="pip-float">
          <Bee pose="waving" size={150} />
        </div>
        <h1 className="wb-title">Welcome back{name ? `, ${name}` : ''}.</h1>
        <p className="wb-lead">Your hive kept warm while you were away.</p>
        <section className="card wb-card" aria-label="Where things stand">
          <div className="wb-item">
            <HiveMini filled={miniFilled} width={64} />
            <span className="wb-item-text">
              {best >= 2 ? (
                <>
                  <strong>Your {best}-day best is saved</strong>
                  <span className="muted small">A fresh streak starts with today.</span>
                </>
              ) : (
                <>
                  <strong>Your hive and history are all here</strong>
                  <span className="muted small">{hive.cells} honey {hive.cells === 1 ? 'cell' : 'cells'} and counting.</span>
                </>
              )}
            </span>
          </div>
          {exam && (
            <>
              <hr className="wb-rule" />
              <div className="wb-item">
                <span className="wb-hex" style={{ background: exam.subject ? subjectColor(exam.subject) : 'var(--s1)' }} aria-hidden="true" />
                <span className="wb-item-text">
                  <strong>
                    {exam.subject?.name ?? 'Your exam'} {relativeDays(exam.daysLeft).toLowerCase()}
                  </strong>
                  <span className="muted small">{exam.done ? 'You’ve already hit your study target. Keep it ticking.' : `About ${formatDuration(exam.perDayMin * MIN)} a day gets you there.`}</span>
                </span>
              </div>
            </>
          )}
        </section>
      </div>
      <div className="wb-actions">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={easeIn} autoFocus>
          Ease in · 10 minutes
        </button>
        <button type="button" className="btn btn-quiet btn-block" onClick={() => navigate('/', { replace: true })}>
          Go to Home
        </button>
      </div>
    </div>
  );
}

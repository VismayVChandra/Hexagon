import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { dismissSummary, setSessionFocus, useStore } from '../store/store';
import { haptic } from '../hooks/hooks';
import { Bee, type BeePose } from '../components/Bee';
import { CarPhoto } from '../components/CarPhoto';
import { Icon } from '../components/Icon';
import { Bar } from '../components/bits';
import { FOCUS_LABELS } from '../components/SessionExtras';
import { shareSummary } from '../components/SummaryCard';
import { carById } from '../data/cars';
import { STREAK_MILESTONES } from '../lib/stats';
import { MIN, formatDuration } from '../lib/time';
import type { FocusRating } from '../types';

interface Row {
  icon: 'flame' | 'flag' | 'check';
  title: string;
  sub?: string;
  badge?: string;
}

/** One reward screen after every saved session: honey, streak, goal, car and a focus rating. Celebrates once, in one place. */
export default function Reward() {
  const { data, summary } = useStore();
  const navigate = useNavigate();
  const session = summary ? data.sessions.find((s) => s.id === summary.sessionId) : undefined;
  const [rating, setRating] = useState<FocusRating | undefined>(session?.focus);
  if (!summary) return <Navigate to="/" replace />;

  const subject = data.subjects.find((s) => s.id === summary.subjectId);
  const short = summary.studiedMs < MIN;
  const milestone = summary.streakExtended && STREAK_MILESTONES.includes(summary.streakDays);
  const car = summary.car ? carById(summary.car.id) : undefined;
  const title = summary.car?.completed ? 'Car complete!' : summary.rankUp ? 'New bee rank!' : summary.goalReached ? 'Goal reached!' : short ? 'Saved.' : 'Nice focus.';
  const pose: BeePose = short ? 'idle' : 'celebrating';

  const rows: Row[] = [];
  if (summary.rankUp) rows.push({ icon: 'flag', title: `New bee rank: ${summary.rankUp.to}`, sub: `Up from ${summary.rankUp.from}` });
  if (milestone) rows.push({ icon: 'flag', title: `${summary.streakDays} days in a row`, sub: 'A milestone', badge: '+1' });
  else if (summary.streakExtended) rows.push({ icon: 'flame', title: summary.streakDays > 1 ? `${summary.streakDays}-day streak` : 'Streak started', badge: summary.streakDays > 1 ? '+1' : undefined });
  if (summary.newBestStreak && !milestone) rows.push({ icon: 'check', title: 'Your longest streak yet' });
  if (summary.goalReached) rows.push({ icon: 'check', title: 'Daily goal reached', sub: `${formatDuration(summary.todayMs)} today` });
  if (summary.tasks && summary.tasks.total > 0) rows.push({ icon: 'check', title: summary.tasks.done === summary.tasks.total ? `Plan complete: all ${summary.tasks.total} done` : `Plan: ${summary.tasks.done} of ${summary.tasks.total} done` });

  const detail = [formatDuration(summary.studiedMs), subject?.name, session?.topic].filter(Boolean).join(' · ');
  const todayPct = summary.dailyGoalMs > 0 ? summary.todayMs / summary.dailyGoalMs : 0;

  function rate(n: FocusRating) {
    const next = rating === n ? undefined : n;
    setRating(next);
    setSessionFocus(summary!.sessionId, next);
    haptic('tap', data.settings.haptics);
  }

  function leave(to: string) {
    dismissSummary();
    navigate(to, { replace: true });
  }

  return (
    <div className="rw">
      <header className="rw-head">
        <div className="pop-in">
          <Bee pose={pose} size={120} />
        </div>
        <h1 className="rw-title">{title}</h1>
        <p className="muted">{detail}</p>
      </header>

      {summary.cellsAdded > 0 && (
        <section className="card rw-cells" aria-label="Honey earned">
          <span className="rw-hex pop-in" aria-hidden="true">
            +{summary.cellsAdded}
          </span>
          <div className="rw-cells-text">
            <strong>
              {summary.cellsAdded} honey {summary.cellsAdded === 1 ? 'cell' : 'cells'}
            </strong>
            {summary.goldenEarned && <span className="rw-golden">Incl. a golden cell · 25 min straight</span>}
          </div>
        </section>
      )}

      {(rows.length > 0 || summary.car || !summary.goalReached) && (
        <ul className="rw-rows" aria-label="What this session did">
          {rows.map((r, i) => (
            <li key={r.title} className="rw-row rise" style={{ animationDelay: `${120 + i * 100}ms` }}>
              <span className={`rw-ico ${r.icon === 'check' ? 'green' : 'honey'}`}>
                <Icon name={r.icon} size={20} />
              </span>
              <span className="rw-row-text">
                <strong>{r.title}</strong>
                {r.sub && <span className="muted small">{r.sub}</span>}
              </span>
              {r.badge && <span className="tag tag-green">{r.badge}</span>}
            </li>
          ))}
          {summary.car && (
            <li className="rw-row rw-car rise" style={{ animationDelay: `${120 + rows.length * 100}ms` }}>
              {summary.car.completed && car && <CarPhoto car={car} className="rw-car-photo" />}
              <span className="rw-row-text">
                <strong>{summary.car.completed ? `${summary.car.name} is in your garage` : `${summary.car.name}: ${Math.floor(summary.car.progress * 100)}% built`}</strong>
                {!summary.car.completed && <Bar value={summary.car.progress} color="var(--honey)" label={`${summary.car.name} build progress`} />}
              </span>
            </li>
          )}
          {!summary.goalReached && (
            <li className="rw-row rise" style={{ animationDelay: `${120 + (rows.length + (summary.car ? 1 : 0)) * 100}ms` }}>
              <span className="rw-ico green">
                <Icon name="clock" size={20} />
              </span>
              <span className="rw-row-text">
                <strong>Today</strong>
                <span className="muted small">
                  {formatDuration(summary.todayMs)} of {formatDuration(summary.dailyGoalMs)}
                </span>
                <Bar value={todayPct} label="Today's goal" />
              </span>
            </li>
          )}
        </ul>
      )}

      <div className="rw-rate">
        <p id="rw-rate-h" className="rw-rate-title">
          How focused did it feel?
        </p>
        <div role="radiogroup" aria-labelledby="rw-rate-h" className="rw-hexes">
          {([1, 2, 3, 4, 5] as FocusRating[]).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} of 5, ${FOCUS_LABELS[n]}`} className={`rw-rate-hex${rating != null && n <= rating ? ' on' : ''}`} onClick={() => rate(n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="muted small" aria-live="polite">
          {rating ? FOCUS_LABELS[rating] : 'Optional. It helps Progress show when you focus best.'}
        </p>
      </div>

      <div className="rw-actions">
        <button type="button" className="btn btn-secondary rw-another" onClick={() => leave('/study')}>
          Another round
        </button>
        <button type="button" className="btn btn-primary rw-done" onClick={() => leave('/')} autoFocus>
          Done
        </button>
      </div>
      {!short && (
        <button type="button" className="link-btn rw-share" onClick={() => void shareSummary(summary, subject)}>
          <Icon name="share" size={16} /> Share with a friend
        </button>
      )}
    </div>
  );
}

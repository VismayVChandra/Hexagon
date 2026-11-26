import { Link } from 'react-router-dom';
import type { SessionSummary, Subject } from '../types';
import { STREAK_MILESTONES } from '../lib/stats';
import { MIN, formatDuration } from '../lib/time';
import { Bar, SubjectDot, subjectColor } from './bits';
import { Icon } from './Icon';

/** Shown once on Home right after a session is saved. */
export function SummaryCard({ summary, subject, onDismiss }: { summary: SessionSummary; subject?: Subject; onDismiss: () => void }) {
  const milestone = summary.streakExtended && STREAK_MILESTONES.includes(summary.streakDays);
  const short = summary.studiedMs < MIN;
  const title = summary.goalReached ? 'Daily goal reached' : short ? 'Session saved' : 'Nice work';

  const wins: { icon: 'flame' | 'flag' | 'check'; text: string }[] = [];
  if (milestone) wins.push({ icon: 'flag', text: `Milestone: ${summary.streakDays} days in a row` });
  else if (summary.streakExtended && summary.streakDays > 1) wins.push({ icon: 'flame', text: `${summary.streakDays}-day streak` });
  else if (summary.streakExtended) wins.push({ icon: 'flame', text: 'Streak started' });
  if (summary.newBestStreak && !milestone) wins.push({ icon: 'check', text: 'Your longest streak yet' });

  return (
    <section className="card summary-card" aria-labelledby="sum-h">
      <div className="summary-head">
        <span className="summary-badge" aria-hidden="true">
          <Icon name="check" size={26} />
        </span>
        <div>
          <p className="eyebrow">Session complete</p>
          <h2 id="sum-h" className="summary-title">
            {title}
          </h2>
        </div>
      </div>

      <p className="summary-main">
        <span className="big-num">{formatDuration(summary.studiedMs)}</span>
        <span className="muted">
          {' '}
          of <SubjectDot subject={subject} size={10} /> {subject?.name ?? 'study'}
        </span>
      </p>

      {wins.length > 0 && (
        <ul className="wins">
          {wins.map((w) => (
            <li key={w.text}>
              <Icon name={w.icon} size={16} /> {w.text}
            </li>
          ))}
        </ul>
      )}

      <div className="summary-progress">
        <div className="subject-bars-top">
          <span>Today</span>
          <span className="muted">
            {formatDuration(summary.todayMs)} / {formatDuration(summary.dailyGoalMs)}
          </span>
        </div>
        <Bar value={summary.todayMs / summary.dailyGoalMs} color={summary.todayMs >= summary.dailyGoalMs ? 'var(--honey)' : subjectColor(subject)} label="Today's goal" />
        <div className="subject-bars-top">
          <span>This week</span>
          <span className="muted">
            {formatDuration(summary.weekMs)} / {formatDuration(summary.weeklyGoalMs)}
          </span>
        </div>
        <Bar value={summary.weekMs / summary.weeklyGoalMs} label="This week's goal" />
      </div>

      <div className="row">
        <Link to="/study" className="btn btn-primary" onClick={onDismiss}>
          Study again
        </Link>
        <button type="button" className="btn btn-quiet" onClick={onDismiss}>
          Done
        </button>
      </div>
    </section>
  );
}

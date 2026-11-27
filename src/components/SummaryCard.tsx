import { Link } from 'react-router-dom';
import { showToast } from '../hooks/hooks';
import type { SessionSummary, Subject } from '../types';
import { STREAK_MILESTONES } from '../lib/stats';
import { MIN, formatDuration } from '../lib/time';
import { Bar, SubjectDot, subjectColor } from './bits';
import { Icon } from './Icon';
import { CarPhoto } from './CarPhoto';
import { carById } from '../data/cars';

/** Shown once on Home right after a session is saved. */
export function SummaryCard({ summary, subject, onDismiss }: { summary: SessionSummary; subject?: Subject; onDismiss: () => void }) {
  const milestone = summary.streakExtended && STREAK_MILESTONES.includes(summary.streakDays);
  const short = summary.studiedMs < MIN;
  const title = summary.car?.completed ? 'Car complete' : summary.goalReached ? 'Daily goal reached' : short ? 'Saved' : 'Nice work';

  const wins: { icon: 'flame' | 'flag' | 'check'; text: string }[] = [];
  if (summary.cellsAdded > 0) wins.push({ icon: 'check', text: `+${summary.cellsAdded} honey ${summary.cellsAdded === 1 ? 'cell' : 'cells'} for your hive` });
  if (summary.rankUp) wins.push({ icon: 'flag', text: `New bee rank: ${summary.rankUp.to}` });
  if (summary.goldenEarned) wins.push({ icon: 'flag', text: 'Golden cell earned today' });
  if (summary.car) {
    wins.push(summary.car.completed ? { icon: 'flag', text: `${summary.car.name} finished and added to your garage` } : { icon: 'check', text: `${summary.car.name}: ${Math.floor(summary.car.progress * 100)}% built` });
  }
  if (summary.tasks && summary.tasks.total > 0) wins.push({ icon: 'check', text: summary.tasks.done === summary.tasks.total ? `Plan complete: all ${summary.tasks.total} done` : `Plan: ${summary.tasks.done} of ${summary.tasks.total} done` });
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
          <p className="eyebrow">{short ? 'Quick session' : 'Session complete'}</p>
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

      {summary.car?.completed && carById(summary.car.id) && <CarPhoto car={carById(summary.car.id)!} className="summary-car" />}

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
        {!short && (
          <button type="button" className="btn btn-quiet" onClick={() => void shareSummary(summary, subject)}>
            <Icon name="share" size={16} /> Share
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={onDismiss}>
          Done
        </button>
      </div>
    </section>
  );
}

/** A short, friendly line to send a friend. It never includes a name; the student chooses to send it. */
export function shareText(summary: SessionSummary, subject?: Subject): string {
  const what = subject ? ` of ${subject.name}` : '';
  const honey = summary.cellsAdded > 0 ? `, ${summary.cellsAdded} honey ${summary.cellsAdded === 1 ? 'cell' : 'cells'} added to my hive` : '';
  const streak = summary.streakDays > 1 ? ` ${summary.streakDays}-day streak.` : '';
  return `I just studied ${formatDuration(summary.studiedMs)}${what}${honey}.${streak}`;
}

async function shareSummary(summary: SessionSummary, subject?: Subject) {
  const text = shareText(summary, subject);
  const url = window.location.origin + window.location.pathname;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Hexagon', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast('Copied. Paste it anywhere.', 'success');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // they closed the share sheet
    showToast('Couldn’t share from this browser.', 'error');
  }
}

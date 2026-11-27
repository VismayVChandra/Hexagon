import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { dismissSummary, isDemoMode, startSession, updateSettings, useStore } from '../store/store';
import { haptic, useInstall, useNow, primeAudio, showToast } from '../hooks/hooks';
import { SummaryCard } from '../components/SummaryCard';
import { currentStreak, nextMilestone, sessionDay, STREAK_MIN_MS, subjectTotals, sessionsInRange, sum, todayMs, totalsByDay, weekMs } from '../lib/stats';
import { MIN, addDays, daysBetween, dayKey, formatDayLabel, formatDuration, greeting, relativeDays, weekStartKey, parseDayKey, formatShortDate } from '../lib/time';
import type { StudySession, Subject } from '../types';
import { useFriendRows } from '../cloud/useFriendRows';
import { Bar, DemoBadge, FriendAvatar, ProgressRing, StateBadge, SubjectDot, subjectColor, EmptyState } from '../components/bits';
import { Icon } from '../components/Icon';

export default function Home() {
  const { data, summary } = useStore();
  const navigate = useNavigate();
  const now = useNow(true, 30_000);
  const install = useInstall();
  const { settings, sessions, subjects, exams, active } = data;
  const { live, rows } = useFriendRows(now);

  const today = dayKey(now);
  const todayStudied = todayMs(sessions, now);
  const dailyGoal = settings.dailyGoalMin * MIN;
  const weekStudied = weekMs(sessions, now);
  const weeklyGoal = settings.weeklyGoalMin * MIN;
  const streak = useMemo(() => currentStreak(sessions, now), [sessions, now]);
  const totals = useMemo(() => totalsByDay(sessions), [sessions]);
  const milestone = streak.days > 0 ? nextMilestone(streak.days) : null;

  const weekStart = weekStartKey(today);
  const weekSubjects = useMemo(() => subjectTotals(sessionsInRange(sessions, weekStart, today)), [sessions, weekStart, today]);
  const weekMax = Math.max(1, ...weekSubjects.map((s) => s.ms));
  const upcoming = useMemo(
    () => exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3),
    [exams, today],
  );
  const lastSubject = subjects.find((s) => s.id === settings.lastSubjectId) ?? subjects[0];
  const studyingNow = rows.filter((r) => r.state === 'studying' || r.state === 'online');
  const nStudying = studyingNow.filter((r) => r.state === 'studying').length;

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const name = settings.displayName.trim();
  const hasAnySession = sessions.length > 0;

  function quickStart() {
    if (!lastSubject) return navigate('/study');
    primeAudio();
    haptic('press', settings.haptics);
    const r = startSession({ subjectId: lastSubject.id, topic: '', goal: '', config: { mode: 'stopwatch' }, friendIds: [] });
    if (r.ok) navigate('/session');
    else showToast(r.error, 'error');
  }

  const ringLabel = `Today: ${formatDuration(todayStudied)} of ${formatDuration(dailyGoal)} goal`;

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="page-title serif">
          {greeting(now)}
          {name ? `, ${name}` : ''}.
        </h1>
      </header>

      {summary && <SummaryCard summary={summary} subject={subjects.find((s) => s.id === summary.subjectId)} onDismiss={dismissSummary} />}

      <section className="card hero" aria-labelledby="hero-h">
        <div className="hero-copy">
          <h2 id="hero-h" className="hero-title">
            {active ? 'You have a session in progress' : todayStudied > 0 ? 'Ready for another round?' : 'Ready when you are.'}
          </h2>
          <p className="muted">
            {active
              ? 'Pick up right where you left off.'
              : isDemoMode(data)
                ? 'Take a look around the sample data. When you start a session of your own, you’ll land in a fresh space.'
                : streak.days > 0 && !streak.todayDone
                ? `Study ${formatDuration(STREAK_MIN_MS)} today to keep your ${streak.days}-day streak.`
                : 'Choose a subject and begin in a couple of taps.'}
          </p>
        </div>
        <div className="hero-actions">
          {active ? (
            <Link to="/session" className="btn btn-primary btn-lg">
              <Icon name="clock" size={18} /> Return to session
            </Link>
          ) : (
            <>
              <Link to="/study" className="btn btn-primary btn-lg">
                <Icon name="play" size={18} /> Start studying
              </Link>
              {lastSubject && (
                <button type="button" className="btn btn-secondary" onClick={quickStart}>
                  Quick start: {lastSubject.name}
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {!install.standalone && !settings.installHintDismissed && (install.canPrompt || install.ios) && (
        <section className="card install-card" aria-labelledby="inst-h">
          <div className="card-head">
            <h2 id="inst-h" className="card-title">
              Add Hexagon to your home screen
            </h2>
            <button type="button" className="icon-btn" aria-label="Dismiss install tip" onClick={() => updateSettings({ installHintDismissed: true })}>
              <Icon name="x" />
            </button>
          </div>
          {install.canPrompt ? (
            <>
              <p className="muted">Open it like an app, full screen, and use it offline.</p>
              <button type="button" className="btn btn-secondary" onClick={() => void install.prompt()}>
                <Icon name="download" size={18} /> Install app
              </button>
            </>
          ) : (
            <p className="muted">
              On iPhone or iPad: tap <Icon name="share" size={16} className="inline-icon" /> <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.
            </p>
          )}
        </section>
      )}

      <div className="grid-cards">
        <section className="card goal-card" aria-labelledby="today-h">
          <h2 id="today-h" className="card-title">
            Today
          </h2>
          <div className="goal-body">
            <ProgressRing value={todayStudied / dailyGoal} label={ringLabel}>
              <span className="ring-num">{formatDuration(todayStudied)}</span>
              <span className="ring-sub">of {formatDuration(dailyGoal)}</span>
            </ProgressRing>
            <div className="goal-side">
              <p className="stat-line">
                <strong>{todayStudied >= dailyGoal ? 'Goal reached' : `${formatDuration(dailyGoal - todayStudied)} to go`}</strong>
              </p>
              <p className="muted small">
                This week: {formatDuration(weekStudied)} of {formatDuration(weeklyGoal)}
              </p>
              <Bar value={weekStudied / weeklyGoal} label="Weekly goal progress" />
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="streak-h">
          <h2 id="streak-h" className="card-title">
            Consistency
          </h2>
          <p className="streak-line">
            <Icon name="flame" size={26} className={streak.days > 0 ? 'flame on' : 'flame'} />
            <span className="big-num">{streak.days}</span>
            <span className="muted">day streak</span>
          </p>
          <ol className="week-dots" aria-label="Last 7 days">
            {last7.map((d) => {
              const ms = totals.get(d) ?? 0;
              const done = ms >= STREAK_MIN_MS;
              const dow = parseDayKey(d).toLocaleDateString(undefined, { weekday: 'narrow' });
              return (
                <li key={d} className={`${done ? 'done' : ''}${d === today ? ' today' : ''}`}>
                  <span className="hex-day" aria-hidden="true" />
                  <span aria-hidden="true">{dow}</span>
                  <span className="sr-only">
                    {formatShortDate(d)}: {done ? `studied ${formatDuration(ms)}` : 'no qualifying study'}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="hint">
            {milestone ? `${milestone.remaining} more ${milestone.remaining === 1 ? 'day' : 'days'} to a ${milestone.target}-day milestone. ` : ''}
            A day counts after {formatDuration(STREAK_MIN_MS)} of study.
          </p>
        </section>

        <section className="card" aria-labelledby="subj-week-h">
          <div className="card-head">
            <h2 id="subj-week-h" className="card-title">
              This week by subject
            </h2>
            <Link to="/progress" className="link-btn">
              Progress
            </Link>
          </div>
          {weekSubjects.length === 0 ? (
            <EmptyState title={hasAnySession ? 'Nothing logged this week yet' : 'Your first session starts the chart'} body="Study time you save shows up here by subject." />
          ) : (
            <ul className="subject-bars">
              {weekSubjects.map(({ subjectId, ms }) => {
                const s = subjects.find((x) => x.id === subjectId);
                return (
                  <li key={subjectId}>
                    <div className="subject-bars-top">
                      <span className="subject-label">
                        <SubjectDot subject={s} /> {s?.name ?? 'Removed subject'}
                      </span>
                      <span className="muted">{formatDuration(ms)}</span>
                    </div>
                    <Bar value={ms / weekMax} color={subjectColor(s)} label={`${s?.name ?? 'Subject'} this week`} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="exam-h">
          <div className="card-head">
            <h2 id="exam-h" className="card-title">
              Upcoming exams
            </h2>
            <Link to="/exams" className="link-btn">
              {upcoming.length ? 'All exams' : 'Add'}
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState title="No exams on the horizon" body="Add one and Hexagon can suggest a realistic weekly study goal." action={<Link to="/exams" className="btn btn-secondary btn-sm">Add an exam</Link>} />
          ) : (
            <ul className="exam-list">
              {upcoming.map((e) => {
                const s = subjects.find((x) => x.id === e.subjectId);
                const days = daysBetween(today, e.date);
                return (
                  <li key={e.id}>
                    <span className={`days-badge${days <= 7 ? ' soon' : ''}`}>
                      <strong>{days}</strong>
                      <small>{days === 1 ? 'day' : 'days'}</small>
                    </span>
                    <div>
                      <p className="item-title">{s?.name ?? 'Exam'}</p>
                      <p className="muted small">
                        {relativeDays(days)} · {formatShortDate(e.date)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="fr-h">
          <div className="card-head">
            <h2 id="fr-h" className="card-title">
              Friends
            </h2>
            {rows.length > 0 && !live && <DemoBadge>Demo</DemoBadge>}
          </div>
          {rows.length === 0 ? (
            <EmptyState title="Study is better together" body={live ? 'Type a friend’s code to see when they’re focusing. No chat, no rankings.' : 'Add a friend to see when they’re focusing — no chat, no rankings.'} action={<Link to="/friends" className="btn btn-secondary btn-sm">Go to Friends</Link>} />
          ) : studyingNow.length === 0 ? (
            <p className="muted">Nobody’s around right now. A quiet moment of your own.</p>
          ) : (
            <>
              <p className="muted small">{nStudying > 0 ? `${nStudying} studying now${live ? '' : ' · simulated'}` : `Friends are around${live ? '' : ' · simulated'}`}</p>
              <ul className="friend-mini">
                {studyingNow.slice(0, 4).map((r) => (
                  <li key={r.removeId}>
                    <FriendAvatar friend={r} state={r.state} size={36} />
                    <div>
                      <p className="item-title">{r.name}</p>
                      <p className="muted small">{r.state === 'studying' ? `${r.subject ?? 'Studying'} · ${formatDuration(r.sessionMs)}` : 'Online'}</p>
                    </div>
                    <StateBadge state={r.state} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link to="/friends" className="link-btn">
            Focus rooms
          </Link>
        </section>
      </div>

      <RecentSessions sessions={sessions} subjects={subjects} now={now} />
    </div>
  );

}

function RecentSessions({ sessions, subjects, now }: { sessions: StudySession[]; subjects: Subject[]; now: number }) {
  const recent = [...sessions].sort((a, b) => b.endedAt - a.endedAt).slice(0, 3);
  if (recent.length === 0) return null;
  return (
    <section className="card" aria-labelledby="rec-h">
      <div className="card-head">
        <h2 id="rec-h" className="card-title">
          Recent sessions
        </h2>
        <Link to="/progress" className="link-btn">
          History
        </Link>
      </div>
      <ul className="history-list">
        {recent.map((s) => {
          const sub = subjects.find((x) => x.id === s.subjectId);
          return (
            <li key={s.id}>
              <SubjectDot subject={sub} size={12} />
              <div>
                <p className="item-title">{sub?.name ?? 'Removed subject'}</p>
                <p className="muted small">
                  {s.topic || 'Study session'} · {formatDayLabel(sessionDay(s), now)}
                </p>
              </div>
              <strong>{formatDuration(s.studiedMs)}</strong>
            </li>
          );
        })}
      </ul>
      <p className="hint">
        Total logged: {formatDuration(sum(sessions))} across {sessions.length} sessions
      </p>
    </section>
  );
}

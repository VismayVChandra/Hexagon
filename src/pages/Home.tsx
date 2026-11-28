import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { dismissSummary, updateSettings, useStore } from '../store/store';
import { useInstall, useNow } from '../hooks/hooks';
import { SummaryCard } from '../components/SummaryCard';
import { AdminLink, UsageNotice } from '../components/AdminLink';
import { AccountPrompt, PresencePrompt } from '../components/AccountCard';
import { SubjectTiles } from '../components/Courses';
import { ComebackCard, NotifyPrompt } from '../components/AlertSettings';
import { Bee, type BeePose } from '../components/Bee';
import { HiveMini, MINI_CELLS } from '../components/HiveMini';
import { FriendAvatar } from '../components/bits';
import { Icon } from '../components/Icon';
import { COMB_CAPACITY, hiveSummary } from '../lib/hive';
import { currentStreak, todayMs } from '../lib/stats';
import { MIN, dayKey, formatDuration, greeting } from '../lib/time';
import { useFriendRows } from '../cloud/useFriendRows';

/** Today's progress as a hexagon outline that fills up, with Pip in the middle. */
function HexRing({ value, pose, label }: { value: number; pose: BeePose; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const d = 'M50 5 L91 28.5 L91 79.5 L50 103 L9 79.5 L9 28.5 Z';
  return (
    <div className="hex-ring" role="img" aria-label={label}>
      <svg viewBox="0 0 100 108" width="112" height="120" aria-hidden="true">
        <path d={d} fill="none" strokeWidth="9" strokeLinejoin="round" style={{ stroke: 'var(--sunken)' }} />
        {pct > 0 && <path d={d} fill="none" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`} className="hex-ring-fill" />}
      </svg>
      <div className="pip-float">
        <Bee pose={pose} size={62} />
      </div>
    </div>
  );
}

export default function Home() {
  const { data, summary } = useStore();
  const now = useNow(true, 30_000);
  const install = useInstall();
  const { settings, sessions, subjects } = data;
  const { live, rows } = useFriendRows(now);

  const today = dayKey(now);
  const todayStudied = todayMs(sessions, now);
  const dailyGoal = settings.dailyGoalMin * MIN;
  const streak = useMemo(() => currentStreak(sessions, now), [sessions, now]);
  const hive = useMemo(() => hiveSummary(sessions), [sessions]);
  const name = settings.displayName.trim();
  const hour = new Date(now).getHours();

  const goalReached = dailyGoal > 0 && todayStudied >= dailyGoal;
  const pct = dailyGoal > 0 ? Math.round(Math.min(1, todayStudied / dailyGoal) * 100) : 0;
  const pose: BeePose = goalReached ? 'cheering' : todayStudied === 0 && (hour >= 22 || hour < 5) ? 'sleepy' : 'idle';
  const ringLabel = `Today: ${formatDuration(todayStudied)} of ${formatDuration(dailyGoal)} goal`;

  const studyingNow = rows.filter((r) => r.state === 'studying' || r.state === 'online');
  const nStudying = studyingNow.filter((r) => r.state === 'studying').length;
  const miniFilled = hive.inCurrent === 0 ? 0 : Math.max(1, Math.round((hive.inCurrent / COMB_CAPACITY) * MINI_CELLS));

  const showInstall = !install.standalone && !settings.installHintDismissed && (install.canPrompt || install.ios);

  return (
    <div className="page home">
      <header className="home-head">
        <div className="home-head-text">
          <p className="t-small home-date">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          <h1 className="home-title">
            {greeting(now)}
            {name ? `, ${name}` : ''}
          </h1>
        </div>
        <Link to="/settings" className="icon-btn home-settings" aria-label="Settings">
          <Icon name="settings" size={22} />
        </Link>
      </header>

      {summary && <SummaryCard summary={summary} subject={subjects.find((s) => s.id === summary.subjectId)} onDismiss={dismissSummary} />}

      <section className="card today-card" aria-label="Today’s progress">
        <HexRing value={dailyGoal > 0 ? todayStudied / dailyGoal : 0} pose={pose} label={ringLabel} />
        <div className="today-copy">
          <p className="eyebrow">Today</p>
          <p className="today-num num">{formatDuration(todayStudied)}</p>
          <p className="muted small">{goalReached ? `Goal reached · ${formatDuration(dailyGoal)}` : `of your ${formatDuration(dailyGoal)} goal · ${pct}%`}</p>
          <div className="today-badges">
            {streak.days > 0 && (
              <span className="tag tag-honey">
                <Icon name="flame" size={14} /> {streak.days} {streak.days === 1 ? 'day' : 'days'}
              </span>
            )}
            <span className="tag tag-green">
              {hive.cells} {hive.cells === 1 ? 'cell' : 'cells'}
            </span>
          </div>
        </div>
      </section>

      <SubjectTiles today={today} />

      {/* One gentle prompt at a time: the first one that applies is shown, the rest wait their turn. */}
      <div className="prompt-slot">
        <ComebackCard />
        {showInstall && (
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
        <AccountPrompt />
        <PresencePrompt />
        <NotifyPrompt />
        <UsageNotice />
      </div>

      <Link to="/friends" className="card strip friends-strip">
        {rows.length === 0 ? (
          <>
            <span className="strip-icon" aria-hidden="true">
              <Icon name="users" size={20} />
            </span>
            <span className="strip-text">
              <strong>Study is better together</strong>
              <span className="muted small">Add a friend to see when they’re focusing. No chat, no rankings.</span>
            </span>
          </>
        ) : studyingNow.length === 0 ? (
          <>
            <span className="strip-icon" aria-hidden="true">
              <Icon name="users" size={20} />
            </span>
            <span className="strip-text">
              <strong>Friends</strong>
              <span className="muted small">Nobody’s around right now. A quiet moment of your own.</span>
            </span>
          </>
        ) : (
          <>
            <span className="strip-avatars" aria-hidden="true">
              {studyingNow.slice(0, 3).map((r) => (
                <FriendAvatar key={r.removeId} friend={r} size={34} />
              ))}
            </span>
            <span className="strip-text">
              <strong>
                {nStudying > 0 ? `${nStudying} ${nStudying === 1 ? 'friend' : 'friends'} studying now` : `${studyingNow.length} ${studyingNow.length === 1 ? 'friend' : 'friends'} around`}
              </strong>
              <span className="muted small strip-live">
                <span className="live-dot" aria-hidden="true" />
                Quietly, together{live ? '' : ' · demo'}
              </span>
            </span>
          </>
        )}
        <Icon name="chevron" size={20} className="strip-go" />
      </Link>

      <Link to="/progress" className="card strip hive-strip" aria-label={`Your hive: ${hive.rank.name}. See your hive and progress`}>
        <HiveMini filled={miniFilled} width={104} />
        <span className="strip-text">
          <span className="eyebrow">Your hive</span>
          <strong>{hive.rank.name}</strong>
          <span className="muted small">{hive.next ? `${formatDuration(hive.hoursToNext * 3_600_000)} of focus to ${hive.next.name}` : 'You’ve reached the top of the hive'}</span>
        </span>
        <Icon name="chevron" size={20} className="strip-go" />
      </Link>

      <AdminLink />
    </div>
  );
}

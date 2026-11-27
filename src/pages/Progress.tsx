import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addManualSession, deleteSession, useStore, validateManualSession } from '../store/store';
import { showToast, useNow } from '../hooks/hooks';
import { DAY_PARTS, MIN_SESSIONS_FOR_PATTERN, RANGES, buildBuckets, calendarCells, currentStreak, focusInsights, longestStreak, sessionDay, sessionsInRange, subjectTotals, sum, totalsByDay, weekMs, type RangeId } from '../lib/stats';
import { MIN, addDays, daysBetween, dayKey, formatDayLabel, formatDuration, formatShortDate, formatTimeOfDay, parseDayKey } from '../lib/time';
import { Bar, EmptyState, Field, SubjectDot, subjectColor } from '../components/bits';
import { CalendarHeat, StackedChart } from '../components/Charts';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';

const PAGE = 40;

export default function Progress() {
  const { data } = useStore();
  const now = useNow(true, 60_000);
  const { sessions, subjects, settings } = data;
  const [range, setRange] = useState<RangeId>('7d');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const today = dayKey(now);
  const filtered = useMemo(() => (subjectFilter === 'all' ? sessions : sessions.filter((s) => s.subjectId === subjectFilter)), [sessions, subjectFilter]);

  const rangeDef = RANGES.find((r) => r.id === range)!;
  const earliest = useMemo(() => filtered.reduce((m, s) => (sessionDay(s) < m ? sessionDay(s) : m), today), [filtered, today]);
  const startKey = rangeDef.days ? addDays(today, -(rangeDef.days - 1)) : earliest;
  const spanDays = daysBetween(startKey, today) + 1;
  const inRange = useMemo(() => sessionsInRange(filtered, startKey, today), [filtered, startKey, today]);
  const total = sum(inRange);
  const weekly = spanDays > 31;
  const buckets = useMemo(
    () =>
      buildBuckets(
        inRange,
        spanDays < 7 && !rangeDef.days ? addDays(today, -6) : startKey,
        today,
        (k) => parseDayKey(k).toLocaleDateString(undefined, { weekday: 'short' }),
        formatShortDate,
      ),
    [inRange, startKey, today, spanDays, rangeDef.days],
  );
  const bySubject = useMemo(() => subjectTotals(inRange), [inRange]);
  const dayTotals = useMemo(() => totalsByDay(inRange), [inRange]);
  const bestDay = [...dayTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const dailyGoal = settings.dailyGoalMin * MIN;
  const goalDays = [...dayTotals.values()].filter((ms) => ms >= dailyGoal).length;
  const activeDays = [...dayTotals.values()].filter((ms) => ms >= MIN).length;
  const avgPerDay = total / Math.max(1, spanDays);

  const streak = currentStreak(sessions, now);
  const best = longestStreak(sessions);
  const week = weekMs(sessions, now);
  const cells = useMemo(() => calendarCells(sessions, now, 12), [sessions, now]);
  const insights = useMemo(() => focusInsights(filtered), [filtered]);

  const history = useMemo(() => [...inRange].sort((a, b) => b.startedAt - a.startedAt), [inRange]);
  const grouped = useMemo(() => {
    const out: { day: string; items: typeof history }[] = [];
    for (const s of history.slice(0, shown)) {
      const d = sessionDay(s);
      const g = out[out.length - 1];
      if (g && g.day === d) g.items.push(s);
      else out.push({ day: d, items: [s] });
    }
    return out;
  }, [history, shown]);

  const deleting = toDelete ? sessions.find((s) => s.id === toDelete) : null;

  return (
    <div className="page">
      <header className="page-head row row-split">
        <div>
          <h1 className="page-title">Progress</h1>
          <p className="page-sub">Everything here is calculated from your saved sessions.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)} disabled={subjects.length === 0}>
          <Icon name="plus" size={16} /> Log past session
        </button>
      </header>

      <div className="filters">
        <div role="radiogroup" aria-label="Date range" className="segmented segmented-sm">
          {RANGES.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={range === r.id} className={`segment${range === r.id ? ' is-on' : ''}`} onClick={() => { setRange(r.id); setShown(PAGE); }}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="select-wrap">
          <label htmlFor="subj-filter" className="sr-only">
            Filter by subject
          </label>
          <select id="subj-filter" value={subjectFilter} onChange={(e) => { setSubjectFilter(e.target.value); setShown(PAGE); }}>
            <option value="all">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {sessions.length === 0 ? (
        <section className="card">
          <EmptyState title="No sessions yet" body="Your first saved session will start building these charts. You can also log a past session if you studied before using Hexagon." action={<Link to="/study" className="btn btn-primary">Start studying</Link>} />
        </section>
      ) : (
        <>
          <section className="tiles" aria-label="Summary for the selected range">
            <div className="tile">
              <span className="eyebrow">Total</span>
              <strong className="big-num">{formatDuration(total)}</strong>
            </div>
            <div className="tile">
              <span className="eyebrow">Daily average</span>
              <strong className="big-num">{formatDuration(avgPerDay)}</strong>
            </div>
            <div className="tile">
              <span className="eyebrow">Sessions</span>
              <strong className="big-num">{inRange.length}</strong>
            </div>
            <div className="tile">
              <span className="eyebrow">Best day</span>
              <strong className="big-num">{bestDay ? formatDuration(bestDay[1]) : '—'}</strong>
              {bestDay && <span className="muted small">{formatShortDate(bestDay[0])}</span>}
            </div>
          </section>

          <section className="card" aria-labelledby="chart-h">
            <div className="card-head">
              <h2 id="chart-h" className="card-title">
                {weekly ? 'Weekly' : 'Daily'} study time
              </h2>
              <span className="muted small">{weekly ? 'Each bar is a week' : 'Each bar is a day'}</span>
            </div>
            {inRange.length === 0 ? (
              <EmptyState title="Nothing in this range" body="Try a longer range or a different subject." />
            ) : (
              <StackedChart buckets={buckets} subjects={subjects} goalMs={weekly ? settings.weeklyGoalMin * MIN : dailyGoal} weekly={weekly} />
            )}
          </section>

          <div className="grid-cards">
            <section className="card" aria-labelledby="goal-h">
              <h2 id="goal-h" className="card-title">
                Goals
              </h2>
              <div className="goal-row">
                <div className="subject-bars-top">
                  <span>This week</span>
                  <span className="muted">
                    {formatDuration(week)} / {formatDuration(settings.weeklyGoalMin * MIN)}
                  </span>
                </div>
                <Bar value={week / (settings.weeklyGoalMin * MIN)} label="Weekly goal" />
              </div>
              <ul className="facts">
                <li>
                  <Icon name="check" size={16} />
                  <span>
                    Hit your {formatDuration(dailyGoal)} daily goal on <strong>{goalDays}</strong> of {spanDays} days
                  </span>
                </li>
                <li>
                  <Icon name="calendar" size={16} />
                  <span>
                    Studied on <strong>{activeDays}</strong> {activeDays === 1 ? 'day' : 'days'} in this range
                  </span>
                </li>
                <li>
                  <Icon name="flame" size={16} />
                  <span>
                    Current streak <strong>{streak.days}</strong> · longest <strong>{best}</strong>
                  </span>
                </li>
              </ul>
            </section>

            <section className="card" aria-labelledby="by-subj-h">
              <h2 id="by-subj-h" className="card-title">
                By subject
              </h2>
              {bySubject.length === 0 ? (
                <p className="muted">No study time in this range.</p>
              ) : (
                <ul className="subject-bars">
                  {bySubject.map(({ subjectId, ms, count }) => {
                    const s = subjects.find((x) => x.id === subjectId);
                    return (
                      <li key={subjectId}>
                        <div className="subject-bars-top">
                          <span className="subject-label">
                            <SubjectDot subject={s} /> {s?.name ?? 'Removed subject'}
                          </span>
                          <span className="muted">
                            {formatDuration(ms)} · {Math.round((ms / total) * 100)}%
                          </span>
                        </div>
                        <Bar value={ms / bySubject[0].ms} color={subjectColor(s)} label={`${s?.name ?? 'Subject'}: ${formatDuration(ms)} in ${count} sessions`} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="card" aria-labelledby="pattern-h">
            <div className="card-head">
              <h2 id="pattern-h" className="card-title">
                When you focus
              </h2>
            </div>
            {insights.bestPart ? (
              <>
                <p className="insight-lead">
                  You study most in the <strong>{insights.bestPart}</strong>
                  <span className="muted"> · {Math.round((insights.parts.find((p) => p.id === insights.bestPart)?.share ?? 0) * 100)}% of your focus time</span>
                </p>
                <ul className="part-bars">
                  {DAY_PARTS.map((dp) => {
                    const p = insights.parts.find((x) => x.id === dp.id)!;
                    const top = Math.max(...insights.parts.map((x) => x.ms), 1);
                    return (
                      <li key={dp.id}>
                        <div className="subject-bars-top small">
                          <span>
                            {dp.label} <span className="muted">{dp.hours}</span>
                          </span>
                          <span className="muted">
                            {formatDuration(p.ms)}
                            {p.avgFocus != null ? ` · focus ${p.avgFocus.toFixed(1)}` : ''}
                          </span>
                        </div>
                        <Bar value={p.ms / top} color={dp.id === insights.bestPart ? 'var(--honey)' : 'var(--primary)'} label={`${dp.label}: ${formatDuration(p.ms)}`} />
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="muted">
                {insights.sessions === 0 ? 'Timed sessions will show here.' : `After ${MIN_SESSIONS_FOR_PATTERN} timed sessions Hexagon can show when you focus best. You’ve done ${insights.sessions}.`}
              </p>
            )}
            {insights.sessions > 0 && (
              <dl className="insight-stats">
                <div>
                  <dt>Average session</dt>
                  <dd>{formatDuration(insights.avgMs)}</dd>
                </div>
                <div>
                  <dt>Longest</dt>
                  <dd>{formatDuration(insights.longestMs)}</dd>
                </div>
                <div>
                  <dt>Felt focused</dt>
                  <dd>{insights.avgFocus != null ? `${insights.avgFocus.toFixed(1)} / 5` : '—'}</dd>
                </div>
                {insights.tasksTotal > 0 && (
                  <div>
                    <dt>Plan done</dt>
                    <dd>
                      {insights.tasksDone} of {insights.tasksTotal}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            {insights.rated === 0 && insights.sessions > 0 && <p className="hint">Rate how focused a session felt when you finish it, and it shows up here.</p>}
          </section>

          <section className="card" aria-labelledby="cal-h">
            <div className="card-head">
              <h2 id="cal-h" className="card-title">
                Consistency · last 12 weeks
              </h2>
            </div>
            <CalendarHeat cells={cells} goalMs={dailyGoal} />
          </section>

          <section className="card" aria-labelledby="hist-h">
            <div className="card-head">
              <h2 id="hist-h" className="card-title">
                Session history
              </h2>
              <span className="muted small">{history.length} in range</span>
            </div>
            {history.length === 0 ? (
              <EmptyState title="No sessions to show" body="Sessions you save appear here with their notes." />
            ) : (
              <>
                {grouped.map((g) => {
                  const dayTotal = sum(g.items);
                  return (
                    <div key={g.day} className="history-day">
                      <h3 className="history-day-head">
                        <span>{formatDayLabel(g.day, now)}</span>
                        <span className="muted">{formatDuration(dayTotal)}</span>
                      </h3>
                      <ul className="history-list">
                        {g.items.map((s) => {
                          const sub = subjects.find((x) => x.id === s.subjectId);
                          return (
                            <li key={s.id} className="history-item">
                              <SubjectDot subject={sub} size={12} />
                              <div className="history-main">
                                <p className="item-title">
                                  {sub?.name ?? 'Removed subject'}
                                  {s.topic ? <span className="muted"> · {s.topic}</span> : null}
                                </p>
                                <p className="muted small">
                                  {s.manual ? 'Logged by hand' : `${formatTimeOfDay(s.startedAt)} · ${s.mode}`}
                                  {s.breakMs > 0 ? ` · ${formatDuration(s.breakMs)} break` : ''}
                                  {s.focus ? ` · focus ${s.focus}/5` : ''}
                                  {s.tasks?.length ? ` · ${s.tasks.filter((t) => t.done).length}/${s.tasks.length} tasks` : ''}
                                  {s.demo ? ' · demo' : ''}
                                </p>
                                {s.notes && <p className="note">{s.notes}</p>}
                              </div>
                              <strong>{formatDuration(s.studiedMs)}</strong>
                              <button type="button" className="icon-btn" aria-label={`Delete ${sub?.name ?? ''} session of ${formatDuration(s.studiedMs)}`} onClick={() => setToDelete(s.id)}>
                                <Icon name="trash" size={18} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {history.length > shown && (
                  <button type="button" className="btn btn-quiet btn-block" onClick={() => setShown((n) => n + PAGE)}>
                    Show more
                  </button>
                )}
              </>
            )}
          </section>
        </>
      )}

      <ManualDialog open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete this session?"
        message={deleting ? `${formatDuration(deleting.studiedMs)} will be removed from your history and totals. This can’t be undone.` : ''}
        confirmLabel="Delete session"
        danger
        onConfirm={() => {
          if (toDelete) deleteSession(toDelete);
          setToDelete(null);
          showToast('Session deleted.', 'info');
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function ManualDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStore();
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(() => dayKey(Date.now()));
  const [minutes, setMinutes] = useState('45');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const today = dayKey(Date.now());
  const sid = subjectId || data.subjects[0]?.id || '';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { subjectId: sid, date, minutes: minutes.trim() === '' ? NaN : Number(minutes), notes };
    const errs = validateManualSession(input, data.subjects);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = addManualSession(input);
    if (r.ok) {
      showToast(`Logged ${formatDuration(r.value.studiedMs)}.`);
      setNotes('');
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log a past session">
      <form onSubmit={submit} noValidate className="stack">
        <Field label="Subject" htmlFor="m-subj" error={errors.subjectId}>
          <select id="m-subj" value={sid} onChange={(e) => setSubjectId(e.target.value)} aria-invalid={!!errors.subjectId}>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="Date" htmlFor="m-date" error={errors.date}>
            <input id="m-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />
          </Field>
          <Field label="Minutes studied" htmlFor="m-min" error={errors.minutes}>
            <input id="m-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={!!errors.minutes} />
          </Field>
        </div>
        <Field label="Notes (optional)" htmlFor="m-notes" error={errors.notes}>
          <textarea id="m-notes" rows={3} maxLength={600} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add session
          </button>
        </div>
      </form>
    </Dialog>
  );
}

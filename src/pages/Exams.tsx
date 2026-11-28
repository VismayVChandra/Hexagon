import { useMemo, useState } from 'react';
import { deleteExam, saveExam, updateSettings, useStore, validateExam } from '../store/store';
import { showToast, useNow } from '../hooks/hooks';
import { dailyMinFromWeeklyMs, examPlan, suggestWeeklyGoal } from '../lib/goals';
import { recentWeeklyAverage } from '../lib/stats';
import { HOUR, MIN, daysBetween, dayKey, formatDuration, formatShortDate, parseDayKey, relativeDays } from '../lib/time';
import { Bar, EmptyState, Field, SubjectDot } from '../components/bits';
import { Bee } from '../components/Bee';
import { useQuickStart } from '../hooks/quickStart';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { CourseSetupDialog } from '../components/Courses';

export default function Exams() {
  const { data } = useStore();
  const now = useNow(true, 60_000);
  const { exams, subjects, sessions, settings } = data;
  const today = dayKey(now);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [customGoal, setCustomGoal] = useState('');
  const [goalError, setGoalError] = useState<string>();

  const upcoming = useMemo(() => exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [exams, today]);
  const past = useMemo(() => exams.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date)), [exams, today]);
  const recentAvg = useMemo(() => recentWeeklyAverage(sessions, now), [sessions, now]);
  const suggestion = useMemo(() => suggestWeeklyGoal(exams, sessions, recentAvg, now), [exams, sessions, recentAvg, now]);
  const nextExam = upcoming[0];
  const rest = upcoming.slice(1);
  const nextSubject = nextExam ? subjects.find((x) => x.id === nextExam.subjectId) : undefined;
  const nextPlan = nextExam ? examPlan(nextExam, sessions, now) : undefined;
  const study = useQuickStart();
  const editingExam = editing && editing !== 'new' ? exams.find((e) => e.id === editing) : undefined;
  const deleting = exams.find((e) => e.id === toDelete);

  function applyGoal(ms: number) {
    const weeklyGoalMin = Math.round(ms / MIN);
    updateSettings({ weeklyGoalMin, dailyGoalMin: dailyMinFromWeeklyMs(ms) });
    showToast(`Weekly goal set to ${formatDuration(ms)}.`);
  }

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    const h = Number(customGoal);
    if (customGoal.trim() === '' || !Number.isFinite(h) || h < 0.5 || h > 70) return setGoalError('Enter hours between 0.5 and 70.');
    setGoalError(undefined);
    applyGoal(h * HOUR);
    setCustomGoal('');
  }

  return (
    <div className="page">
      <header className="page-head row row-split">
        <div>
          <h1 className="page-title">Exams</h1>
          <p className="page-sub">Keep dates in view and set a goal you can actually keep.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('new')} disabled={subjects.length === 0}>
          <Icon name="plus" size={16} /> Add exam
        </button>
      </header>

      {subjects.length === 0 && (
        <p className="banner banner-info">
          Add your subjects first, then their exam dates.{' '}
          <button type="button" className="link-btn" onClick={() => setSetup(true)}>
            Add my subjects
          </button>
        </p>
      )}
      {setup && <CourseSetupDialog open onClose={() => setSetup(false)} />}

      {upcoming.length === 0 ? (
        <section className="card" aria-labelledby="up-h">
          <h2 id="up-h" className="sr-only">
            Upcoming exams
          </h2>
          <EmptyState title="No upcoming exams" body="Add an exam with its date. You’ll see a countdown and a suggested weekly goal." action={subjects.length > 0 ? <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>Add exam</button> : undefined} />
        </section>
      ) : (
        <>
          {nextExam && (
            <section className="card ex-next" aria-labelledby="next-h">
              <div className="ex-next-top">
                <span className={`ex-hex ex-hex-lg${nextPlan!.daysLeft <= 7 ? ' soon' : ''}`} aria-hidden="true">
                  <strong className="num">{nextPlan!.daysLeft}</strong>
                  <small>{nextPlan!.daysLeft === 1 ? 'day' : 'days'}</small>
                </span>
                <div className="ex-next-text">
                  <p className="eyebrow">Next up</p>
                  <h2 id="next-h" className="t-title">
                    {nextSubject?.name ?? 'Removed subject'}
                  </h2>
                  <p className="muted small">
                    {parseDayKey(nextExam.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {relativeDays(nextPlan!.daysLeft)}
                  </p>
                </div>
                <div className="exam-actions">
                  <button type="button" className="icon-btn" aria-label={`Edit ${nextSubject?.name ?? ''} exam`} onClick={() => setEditing(nextExam.id)}>
                    <Icon name="edit" size={18} />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Delete ${nextSubject?.name ?? ''} exam`} onClick={() => setToDelete(nextExam.id)}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
              {nextExam.notes && <p className="note">{nextExam.notes}</p>}
              <div className="ex-next-bar">
                <div className="subject-bars-top small">
                  <span className="ex-bold">
                    {formatDuration(nextPlan!.loggedMs)} of {nextExam.targetHours}h target
                  </span>
                  {nextPlan!.remainingMs > 0 && <span className="muted">~{formatDuration(nextPlan!.perWeekMs / 7)}/day</span>}
                </div>
                <Bar value={nextPlan!.loggedMs / (nextExam.targetHours * HOUR)} label={`Preparation for ${nextSubject?.name ?? 'exam'}`} />
              </div>
              {nextSubject && !nextSubject.demo && (
                <button type="button" className="btn btn-primary btn-block" disabled={!!data.active} onClick={() => study(nextSubject)}>
                  <Icon name="play" size={16} /> Study {nextSubject.name}
                </button>
              )}
            </section>
          )}

          {rest.length > 0 && (
            <ul className="group-list" aria-label="More exams">
              {rest.map((e) => {
                const s = subjects.find((x) => x.id === e.subjectId);
                const plan = examPlan(e, sessions, now);
                return (
                  <li key={e.id} className="group-row">
                    <span className={`ex-hex${plan.daysLeft <= 7 ? ' soon' : ''}`} aria-hidden="true">
                      <strong className="num">{plan.daysLeft}</strong>
                    </span>
                    <div className="group-row-text">
                      <p className="item-title">
                        <SubjectDot subject={s} /> {s?.name ?? 'Removed subject'}
                      </p>
                      <p className="muted small">
                        {parseDayKey(e.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {plan.loggedMs > 0 ? `${formatDuration(plan.loggedMs)} of ${e.targetHours}h` : 'not started'}
                      </p>
                    </div>
                    <button type="button" className="icon-btn" aria-label={`Edit ${s?.name ?? ''} exam`} onClick={() => setEditing(e.id)}>
                      <Icon name="edit" size={18} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Delete ${s?.name ?? ''} exam`} onClick={() => setToDelete(e.id)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <section className="card-flat ex-goal" aria-labelledby="goal-h">
        <Bee pose="idle" size={48} />
        <div className="ex-goal-text">
          <h2 id="goal-h" className="ex-bold">
            {suggestion ? `Weekly goal → ${formatDuration(suggestion.suggestedMs)}?` : `Weekly goal: ${formatDuration(settings.weeklyGoalMin * MIN)}`}
          </h2>
          <span className="muted small">{suggestion ? suggestion.reason : 'Add an exam and Pip will suggest one.'}</span>
        </div>
        {suggestion && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => applyGoal(suggestion.suggestedMs)} disabled={Math.round(suggestion.suggestedMs / MIN) === settings.weeklyGoalMin}>
            {Math.round(suggestion.suggestedMs / MIN) === settings.weeklyGoalMin ? 'Set' : 'Use'}
          </button>
        )}
      </section>

      <details className="card goal-helper">
        <summary className="card-title">Goal details</summary>
        <p>
          Current goal: <strong>{formatDuration(settings.weeklyGoalMin * MIN)}</strong> a week
          <span className="muted"> · about {formatDuration(settings.dailyGoalMin * MIN)} a day</span>
        </p>
        <p className="muted small">Your recent pace: {recentAvg > 0 ? `${formatDuration(recentAvg)} a week` : 'no history yet'}.</p>

        {suggestion && (
          <div className="suggestion">
            {suggestion.rampUp && (
              <p className="muted small">
                Full need: {formatDuration(suggestion.neededMs)} a week. Revisit this in a week or two.
              </p>
            )}
            <ul className="facts">
              {suggestion.plans.map((p) => {
                const s = subjects.find((x) => x.id === p.exam.subjectId);
                return (
                  <li key={p.exam.id}>
                    <SubjectDot subject={s} />
                    <span>
                      {s?.name}: {formatDuration(p.remainingMs)} still to do over {p.daysLeft} {p.daysLeft === 1 ? 'day' : 'days'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <form onSubmit={applyCustom} noValidate className="inline-form">
          <Field label="Set your own (hours per week)" htmlFor="custom-goal" error={goalError}>
            <input id="custom-goal" inputMode="decimal" value={customGoal} placeholder="e.g. 10" aria-invalid={!!goalError} onChange={(e) => setCustomGoal(e.target.value)} />
          </Field>
          <button type="submit" className="btn btn-secondary">
            Set goal
          </button>
        </form>
      </details>

      {past.length > 0 && (
        <details className="card">
          <summary className="card-title">Past exams ({past.length})</summary>
          <ul className="history-list">
            {past.map((e) => {
              const s = subjects.find((x) => x.id === e.subjectId);
              return (
                <li key={e.id}>
                  <SubjectDot subject={s} size={12} />
                  <div>
                    <p className="item-title">{s?.name ?? 'Removed subject'}</p>
                    <p className="muted small">
                      {formatShortDate(e.date)} · {-daysBetween(today, e.date)} days ago
                    </p>
                  </div>
                  <button type="button" className="icon-btn" aria-label={`Delete past ${s?.name ?? ''} exam`} onClick={() => setToDelete(e.id)}>
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {editing && <ExamDialog key={editing} id={editing === 'new' ? undefined : editing} initial={editingExam} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={!!deleting}
        title="Delete this exam?"
        message="It will be removed from your reminders. Your study sessions are not affected."
        confirmLabel="Delete exam"
        danger
        onConfirm={() => {
          if (toDelete) deleteExam(toDelete);
          setToDelete(null);
          showToast('Exam deleted.', 'info');
        }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function ExamDialog({ id, initial, onClose }: { id?: string; initial?: { subjectId: string; date: string; notes: string; targetHours: number }; onClose: () => void }) {
  const { data } = useStore();
  const today = dayKey(Date.now());
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? data.subjects[0]?.id ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [hours, setHours] = useState(String(initial?.targetHours ?? 10));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = { subjectId, date, notes, targetHours: hours.trim() === '' ? NaN : Number(hours) };
    const errs = validateExam(input, data.subjects, !id, today);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const r = saveExam(input, id);
    if (r.ok) {
      showToast(id ? 'Exam updated.' : 'Exam added.');
      onClose();
    } else showToast(r.error, 'error');
  }

  return (
    <Dialog open onClose={onClose} title={id ? 'Edit exam' : 'Add exam'}>
      <form onSubmit={submit} noValidate className="stack">
        <Field label="Subject" htmlFor="e-subj" error={errors.subjectId}>
          <select id="e-subj" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-invalid={!!errors.subjectId}>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Exam date" htmlFor="e-date" error={errors.date}>
          <input id="e-date" type="date" min={id ? undefined : today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!errors.date} />
        </Field>
        <Field label="Hours you’d like to study for it" htmlFor="e-hours" error={errors.targetHours} hint="Used to suggest a weekly goal. Counted from when you add the exam.">
          <input id="e-hours" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} aria-invalid={!!errors.targetHours} />
        </Field>
        <Field label="Notes (optional)" htmlFor="e-notes" error={errors.notes}>
          <textarea id="e-notes" rows={3} maxLength={300} value={notes} placeholder="Topics, room, what to bring…" onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {id ? 'Save changes' : 'Add exam'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { addSubject, saveExam, useStore, validateSubjectName } from '../store/store';
import { showToast } from '../hooks/hooks';
import { useQuickStart } from '../hooks/quickStart';
import { dayKey, daysBetween, formatDuration, isValidDayKey, relativeDays } from '../lib/time';
import { sessionDay } from '../lib/stats';
import type { Exam, Subject } from '../types';
import { Bee } from './Bee';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { SubjectDot, subjectColor } from './bits';

/** The next exam (today or later) for each subject, soonest first. */
export function nextExamBySubject(exams: Exam[], today: string): Map<string, Exam> {
  const out = new Map<string, Exam>();
  for (const e of [...exams].filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date))) if (!out.has(e.subjectId)) out.set(e.subjectId, e);
  return out;
}

/** "Exam today", "Exam tomorrow", "Exam in 12 days". */
export function examLine(date: string, today: string): string {
  const n = daysBetween(today, date);
  return n === 0 ? 'Exam today' : n === 1 ? 'Exam tomorrow' : `Exam ${relativeDays(n).toLowerCase()}`;
}

interface Row {
  name: string;
  date: string;
}
const blank = (): Row => ({ name: '', date: '' });

export interface SetupInput {
  /** New subjects, each with an optional exam date. Blank rows are ignored. */
  rows: Row[];
  /** Exam dates typed against subjects that already exist (by id). */
  dates: Record<string, string>;
}

export interface SetupProblems {
  rows: Record<number, { name?: string; date?: string }>;
  dates: Record<string, string>;
}

/** Checks everything typed in the setup form without changing anything. Pure, so it can be tested. */
export function checkSetup(input: SetupInput, subjects: Subject[], exams: Exam[], today: string): SetupProblems {
  const problems: SetupProblems = { rows: {}, dates: {} };
  const seen = new Set<string>();
  input.rows.forEach((r, i) => {
    const name = r.name.trim();
    const date = r.date.trim();
    if (!name && !date) return;
    const p: { name?: string; date?: string } = {};
    if (!name) p.name = 'Give the subject a name.';
    else {
      const err = validateSubjectName(name, subjects);
      if (err) p.name = err;
      else if (seen.has(name.toLowerCase())) p.name = 'You typed this one twice.';
      seen.add(name.toLowerCase());
    }
    if (date) {
      if (!isValidDayKey(date)) p.date = 'Pick a valid date.';
      else if (date < today) p.date = 'The exam date should be today or later.';
    }
    if (p.name || p.date) problems.rows[i] = p;
  });
  const next = nextExamBySubject(exams, today);
  for (const [id, date] of Object.entries(input.dates)) {
    const d = date.trim();
    if (!d || d === next.get(id)?.date) continue;
    if (!isValidDayKey(d)) problems.dates[id] = 'Pick a valid date.';
    else if (!next.get(id) && d < today) problems.dates[id] = 'The exam date should be today or later.';
  }
  return problems;
}

export const hasProblems = (p: SetupProblems) => Object.keys(p.rows).length > 0 || Object.keys(p.dates).length > 0;

/**
 * Add the subjects of a course (and their exam dates) in one go, and set exam dates for subjects you already have.
 * Used from Home ("My subjects") and the Exams page.
 */
export function CourseSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStore();
  const today = dayKey(Date.now());
  const mine = useMemo(() => data.subjects.filter((s) => !s.demo), [data.subjects]);
  const next = useMemo(() => nextExamBySubject(data.exams, today), [data.exams, today]);
  const [rows, setRows] = useState<Row[]>(() => (mine.length === 0 ? [blank(), blank(), blank()] : [blank()]));
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(mine.map((s) => [s.id, next.get(s.id)?.date ?? ''])));
  const [problems, setProblems] = useState<SetupProblems>({ rows: {}, dates: {} });
  const [empty, setEmpty] = useState(false);

  const setRow = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input: SetupInput = { rows, dates };
    const found = checkSetup(input, data.subjects, data.exams, today);
    setProblems(found);
    setEmpty(false);
    if (hasProblems(found)) return;

    let subjectsAdded = 0;
    let examsSaved = 0;
    for (const r of rows) {
      const name = r.name.trim();
      if (!name) continue;
      const res = addSubject(name);
      if (!res.ok) {
        showToast(res.error, 'error');
        return;
      }
      subjectsAdded++;
      if (r.date.trim()) {
        const ex = saveExam({ subjectId: res.value.id, date: r.date.trim(), notes: '', targetHours: 10 });
        if (ex.ok) examsSaved++;
      }
    }
    for (const [id, date] of Object.entries(dates)) {
      const d = date.trim();
      const cur = next.get(id);
      if (!d || d === cur?.date) continue;
      const ex = saveExam({ subjectId: id, date: d, notes: cur?.notes ?? '', targetHours: cur?.targetHours ?? 10 }, cur?.id);
      if (ex.ok) examsSaved++;
    }
    if (!subjectsAdded && !examsSaved) {
      setEmpty(true);
      return;
    }
    const bits = [subjectsAdded ? `${subjectsAdded} ${subjectsAdded === 1 ? 'subject' : 'subjects'}` : '', examsSaved ? `${examsSaved} ${examsSaved === 1 ? 'exam date' : 'exam dates'}` : ''].filter(Boolean);
    showToast(`Saved ${bits.join(' and ')}.`);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="My subjects and exams">
      <form onSubmit={submit} noValidate className="stack">
        <p className="muted small">Type the subjects from your coursework. Add an exam date if you know it: you’ll get a countdown and a suggested weekly goal. You can leave dates empty and add them later.</p>

        {mine.length > 0 && (
          <fieldset className="course-fieldset">
            <legend>Your subjects</legend>
            {mine.map((s) => (
              <div key={s.id} className="course-row">
                <span className="course-name">
                  <SubjectDot subject={s} /> {s.name}
                </span>
                <label className="sr-only" htmlFor={`d-${s.id}`}>
                  Exam date for {s.name}
                </label>
                <input id={`d-${s.id}`} type="date" value={dates[s.id] ?? ''} aria-invalid={!!problems.dates[s.id]} onChange={(e) => setDates({ ...dates, [s.id]: e.target.value })} />
                {problems.dates[s.id] && (
                  <p className="field-error" role="alert">
                    {problems.dates[s.id]}
                  </p>
                )}
              </div>
            ))}
          </fieldset>
        )}

        <fieldset className="course-fieldset">
          <legend>{mine.length > 0 ? 'Add more subjects' : 'New subjects'}</legend>
          {rows.map((r, i) => (
            <div key={i} className="course-row">
              <label className="sr-only" htmlFor={`n-${i}`}>
                Subject {i + 1}
              </label>
              <input id={`n-${i}`} value={r.name} maxLength={40} placeholder="Subject name, e.g. Thermodynamics" autoComplete="off" data-autofocus={i === 0 ? true : undefined} aria-invalid={!!problems.rows[i]?.name} onChange={(e) => setRow(i, { name: e.target.value })} />
              <label className="sr-only" htmlFor={`nd-${i}`}>
                Exam date for subject {i + 1} (optional)
              </label>
              <input id={`nd-${i}`} type="date" min={today} value={r.date} aria-invalid={!!problems.rows[i]?.date} onChange={(e) => setRow(i, { date: e.target.value })} />
              {(problems.rows[i]?.name || problems.rows[i]?.date) && (
                <p className="field-error" role="alert">
                  {problems.rows[i]?.name ?? problems.rows[i]?.date}
                </p>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRows([...rows, blank()])}>
            <Icon name="plus" size={16} /> Add another subject
          </button>
        </fieldset>

        {empty && (
          <p className="field-error" role="alert">
            Type at least one subject name, or an exam date.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Short exam badge for a subject tile: "Exam today", "Exam tomorrow", "Exam in 18d". */
export function examBadge(date: string, today: string): string {
  const n = daysBetween(today, date);
  return n === 0 ? 'Exam today' : n === 1 ? 'Exam tomorrow' : `Exam in ${n}d`;
}

/** Home: "Start studying". Every subject is a big one-tap tile with its exam countdown. */
export function SubjectTiles({ today }: { today: string }) {
  const { data } = useStore();
  const study = useQuickStart();
  const [open, setOpen] = useState(false);
  const mine = data.subjects.filter((s) => !s.demo);
  const next = nextExamBySubject(data.exams, today);
  const busy = !!data.active;
  const doneToday = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of data.sessions) if (sessionDay(s) === today) out.set(s.subjectId, (out.get(s.subjectId) ?? 0) + s.studiedMs);
    return out;
  }, [data.sessions, today]);

  if (mine.length === 0) {
    return (
      <section className="card start-empty" aria-labelledby="start-h">
        <Bee pose="waving" size={72} />
        <div className="start-empty-copy">
          <h2 id="start-h" className="t-title">
            Add your subjects
          </h2>
          <p className="muted small">Add them once, then start any of them with one tap. Exam dates are optional and give you a countdown.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          <Icon name="plus" size={18} /> Add my subjects
        </button>
        {open && <CourseSetupDialog open onClose={() => setOpen(false)} />}
      </section>
    );
  }

  return (
    <section className="start" aria-labelledby="start-h">
      <div className="start-head">
        <h2 id="start-h" className="t-title">
          Start studying
        </h2>
        <button type="button" className="link-btn" onClick={() => setOpen(true)}>
          Edit
        </button>
      </div>
      {busy && <p className="muted small">A session is in progress. Return to it to start another.</p>}
      <div className="subject-tiles">
        {mine.map((s) => {
          const ex = next.get(s.id);
          const soon = ex ? daysBetween(today, ex.date) <= 7 : false;
          const ms = doneToday.get(s.id) ?? 0;
          return (
            <button key={s.id} type="button" className="subject-tile" disabled={busy} onClick={() => study(s)} aria-label={`Start ${s.name}`}>
              <span className="tile-top">
                <span className="tile-hex" style={{ background: subjectColor(s) }} aria-hidden="true" />
                <span className={`tag${soon ? ' tag-honey' : ''}`}>{ex ? examBadge(ex.date, today) : 'No exam'}</span>
              </span>
              <span className="tile-bottom">
                <span className="tile-name">{s.name}</span>
                <span className="tile-foot">
                  <span className="tile-sub">{ms > 0 ? `Today · ${formatDuration(ms)}` : 'Not yet today'}</span>
                  <span className="tile-play" aria-hidden="true">
                    <Icon name="play" size={14} />
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {open && <CourseSetupDialog open onClose={() => setOpen(false)} />}
    </section>
  );
}

/** Exams page: every subject as a one-tap "start studying" button, with the exam countdown. */
export function MySubjectsCard() {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const today = dayKey(Date.now());
  const mine = data.subjects.filter((s) => !s.demo);
  const next = nextExamBySubject(data.exams, today);
  const busy = !!data.active;
  const study = useQuickStart();

  return (
    <section className="card" aria-labelledby="mysub-h">
      <div className="card-head">
        <h2 id="mysub-h" className="card-title">
          {mine.length ? 'My subjects' : 'Add your subjects'}
        </h2>
        {mine.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setOpen(true)}>
            Edit subjects and exams
          </button>
        )}
      </div>
      {mine.length === 0 ? (
        <>
          <p className="muted small">Add the subjects from your coursework once. Then start studying any of them with one tap, and add exam dates to get countdowns and a suggested weekly goal.</p>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            <Icon name="plus" size={18} /> Add my subjects
          </button>
        </>
      ) : (
        <>
          <p className="muted small">{busy ? 'A session is in progress. Finish or return to it to start another.' : 'Tap a subject to start the timer straight away.'}</p>
          <div className="subject-grid">
            {mine.map((s) => {
              const ex = next.get(s.id);
              return (
                <button key={s.id} type="button" className="subject-btn" disabled={busy} onClick={() => study(s)}>
                  <span className="subject-btn-name">
                    <SubjectDot subject={s} size={12} /> {s.name}
                  </span>
                  <small className={ex && daysBetween(today, ex.date) <= 7 ? 'is-soon' : 'muted'}>{ex ? examLine(ex.date, today) : 'No exam date'}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
      {open && <CourseSetupDialog open onClose={() => setOpen(false)} />}
    </section>
  );
}

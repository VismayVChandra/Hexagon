import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addSubject, getState, removeDemoData, saveExam, updateSettings, useStore } from '../store/store';
import { showToast } from '../hooks/hooks';
import { Bee } from '../components/Bee';
import { HiveMini } from '../components/HiveMini';
import { SkinPicker } from '../components/SkinPicker';
import { Icon } from '../components/Icon';
import { PRESET_SUBJECTS, addCustomName, stepGoal, suggestDailyMin, toggleName } from '../lib/onboarding';
import { dayKey, daysBetween, formatDuration, isValidDayKey, MIN } from '../lib/time';

const STEPS = 4; // look, name, subjects, pace

/** First run: a short welcome, then four quick questions. Everything can be skipped and changed later. */
export default function Welcome() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.settings.displayName);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const [customError, setCustomError] = useState<string>();
  const [examSubject, setExamSubject] = useState('');
  const [examDate, setExamDate] = useState('');
  const [goal, setGoal] = useState(data.settings.dailyGoalMin);
  const goalTouched = useRef(false);

  const today = dayKey(Date.now());
  const examValid = isValidDayKey(examDate) && examDate >= today;
  const examDays = examValid ? daysBetween(today, examDate) : null;
  const examFor = picked.includes(examSubject) ? examSubject : (picked[0] ?? '');
  const first = name.trim();
  const choices = [...PRESET_SUBJECTS, ...picked.filter((p) => !PRESET_SUBJECTS.some((x) => x.toLowerCase() === p.toLowerCase()))];

  function addOwn() {
    const r = addCustomName(picked, custom);
    if (r.error) {
      setCustomError(r.error);
      return;
    }
    setPicked(r.list);
    setCustom('');
    setCustomError(undefined);
    setAdding(false);
  }

  function onExamDate(v: string) {
    setExamDate(v);
    if (!goalTouched.current && isValidDayKey(v) && v >= today) setGoal(suggestDailyMin(daysBetween(today, v)));
  }

  function changeGoal(dir: 1 | -1) {
    goalTouched.current = true;
    setGoal((g) => stepGoal(g, dir));
  }

  function finish() {
    // The sample data goes once the student has told us something real. Their subjects replace it.
    const toldUsSomething = first !== '' || picked.length > 0 || (examFor !== '' && examValid);
    if (toldUsSomething) removeDemoData();
    const ids = new Map<string, string>();
    for (const n of picked) {
      const r = addSubject(n);
      if (r.ok) ids.set(n, r.value.id);
    }
    const subjectId = ids.get(examFor);
    if (subjectId && examValid) saveExam({ subjectId, date: examDate, notes: '', targetHours: 10 });
    updateSettings({ onboarded: true, displayName: first.slice(0, 30), dailyGoalMin: goal });
    // Make the first tap on Home land on the first subject.
    const firstId = [...ids.values()][0];
    if (firstId && getState().data.settings.lastSubjectId == null) updateSettings({ lastSubjectId: firstId });
    if (picked.length > 0) showToast('Your hive is ready. Tap a subject to start.');
    navigate('/', { replace: true });
  }

  function alreadyHaveAccount() {
    updateSettings({ onboarded: true });
    navigate('/settings#account', { replace: true });
  }

  const next = () => setStep((s) => Math.min(STEPS, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (step === 0) {
    return (
      <div className="ob ob-welcome">
        <div className="ob-hero">
          <div className="ob-art">
            <div className="ob-hive">
              <HiveMini filled={9} width={240} golden={false} />
            </div>
            <div className="pip-float ob-bee">
              <Bee pose="waving" size={130} />
            </div>
          </div>
          <h1 className="ob-brand">Hexagon</h1>
          <p className="ob-tagline">study, together and quietly.</p>
          <p className="muted ob-lead">Every 5 focused minutes fills a honey cell. Watch your hive grow.</p>
        </div>
        <div className="ob-actions">
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={next} autoFocus>
            Get started
          </button>
          <button type="button" className="btn btn-quiet btn-block" onClick={alreadyHaveAccount}>
            I already have an account
          </button>
        </div>
      </div>
    );
  }

  const last = step === STEPS;
  return (
    <div className="ob">
      <div className="ob-top">
        <button type="button" className="icon-btn" aria-label="Back" onClick={back}>
          <Icon name="chevron" className="flip-x" />
        </button>
        <div className="ob-steps" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={STEPS} aria-label={`Step ${step} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} className={i < step ? 'on' : ''} />
          ))}
        </div>
        <button type="button" className="ob-skip" onClick={last ? finish : next}>
          Skip
        </button>
      </div>

      {step === 1 && (
        <section className="ob-body" aria-labelledby="ob-h">
          <h1 id="ob-h" className="ob-title">
            How should Hexagon feel?
          </h1>
          <p className="muted">You can change this any time in Settings.</p>
          <p id="ob-skin" className="sr-only">
            Style
          </p>
          <SkinPicker labelledBy="ob-skin" />
        </section>
      )}

      {step === 2 && (
        <section className="ob-body" aria-labelledby="ob-h">
          <div className="ob-pip">
            <Bee pose="idle" size={64} />
            <p className="ob-bubble">Hi! I’m Pip. I’ll keep you company.</p>
          </div>
          <h1 id="ob-h" className="ob-title">
            What should I call you?
          </h1>
          <div className="field">
            <label htmlFor="ob-name">First name</label>
            <input id="ob-name" autoComplete="given-name" maxLength={30} value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} />
          </div>
          <p className="muted small">Only you and friends you add see this.</p>
        </section>
      )}

      {step === 3 && (
        <section className="ob-body" aria-labelledby="ob-h">
          <h1 id="ob-h" className="ob-title">
            What are you studying{first ? `, ${first}` : ''}?
          </h1>
          <p className="muted">Pick a few. Each becomes a one-tap start button.</p>
          <div className="chips" role="group" aria-label="Subjects">
            {choices.map((c) => {
              const on = picked.some((p) => p.toLowerCase() === c.toLowerCase());
              return (
                <button key={c} type="button" aria-pressed={on} className={`chip${on ? ' is-on' : ''}`} onClick={() => setPicked((cur) => toggleName(cur, c))}>
                  {c}
                </button>
              );
            })}
            {!adding && (
              <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
                <Icon name="plus" size={16} /> Your own
              </button>
            )}
          </div>
          {adding && (
            <div className="field">
              <label htmlFor="ob-own">Your own subject</label>
              <div className="task-add">
                <input id="ob-own" value={custom} maxLength={40} autoComplete="off" autoFocus aria-invalid={!!customError} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addOwn())} />
                <button type="button" className="btn btn-secondary" onClick={addOwn}>
                  Add
                </button>
              </div>
              {customError && (
                <p className="field-error" role="alert">
                  {customError}
                </p>
              )}
            </div>
          )}
          <p className="muted small ob-count" role="status">
            {picked.length === 0 ? 'Nothing picked yet. You can add subjects later.' : `${picked.length} selected · change anytime`}
          </p>
        </section>
      )}

      {step === 4 && (
        <section className="ob-body" aria-labelledby="ob-h">
          <h1 id="ob-h" className="ob-title">
            Pace yourself.
          </h1>
          {picked.length > 0 && (
            <div className="card ob-card">
              <p className="eyebrow">Next exam (optional)</p>
              <div className="chips" role="radiogroup" aria-label="Exam subject">
                {picked.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={examFor === p} className={`chip${examFor === p ? ' is-on' : ''}`} onClick={() => setExamSubject(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="field">
                <label htmlFor="ob-exam">Exam date</label>
                <input id="ob-exam" type="date" min={today} value={examDate} onChange={(e) => onExamDate(e.target.value)} />
              </div>
              {examDays != null && <span className="tag tag-honey ob-tag">{examDays === 0 ? 'Today' : examDays === 1 ? 'Tomorrow' : `${examDays} days away`}</span>}
            </div>
          )}
          <div className="card ob-card ob-goal">
            <p className="eyebrow ob-goal-label">Daily goal</p>
            <div className="ob-stepper">
              <button type="button" className="ob-round" aria-label="Less time" onClick={() => changeGoal(-1)} disabled={goal <= 15}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
              <div className="ob-goal-hex" role="status" aria-label={`Daily goal ${formatDuration(goal * MIN)}`}>
                <span className="ob-goal-num num">{formatDuration(goal * MIN)}</span>
                <span className="ob-goal-cells">{Math.round(goal / 5)} cells</span>
              </div>
              <button type="button" className="ob-round" aria-label="More time" onClick={() => changeGoal(1)} disabled={goal >= 720}>
                <Icon name="plus" size={22} />
              </button>
            </div>
            <p className="muted small">{examDays != null && examDays >= 0 && !goalTouched.current ? `Pip suggests ${formatDuration(suggestDailyMin(examDays) * MIN)} with an exam in ${examDays} ${examDays === 1 ? 'day' : 'days'}.` : 'A small, steady goal beats a big one. Change it any time.'}</p>
          </div>
        </section>
      )}

      <div className="ob-actions">
        <button type="button" className={`btn btn-lg btn-block ${last ? 'btn-honey' : 'btn-primary'}`} onClick={last ? finish : next}>
          {last ? 'Start my hive' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

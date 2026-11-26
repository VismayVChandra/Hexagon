import { useState } from 'react';
import type { Subject } from '../types';
import type { Bucket } from '../lib/stats';
import { HOUR, MIN, formatDuration, formatShortDate, parseDayKey, spokenDuration } from '../lib/time';
import { subjectColor, SubjectDot } from './bits';

function niceMax(ms: number): number {
  // Round the axis top up to a friendly number of minutes.
  const min = Math.max(30, Math.ceil(ms / MIN));
  const steps = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 900, 1200, 1800, 2400, 3000, 3600, 6000];
  return (steps.find((s) => s >= min) ?? Math.ceil(min / 600) * 600) * MIN;
}

const axisLabel = (ms: number) => (ms >= HOUR ? `${Math.round((ms / HOUR) * 10) / 10}h` : `${Math.round(ms / MIN)}m`);

interface StackedProps {
  buckets: Bucket[];
  subjects: Subject[];
  /** Optional goal per bucket (drawn as a line). */
  goalMs?: number;
  weekly: boolean;
}

/** Stacked bars by subject. Built from buttons so each bar is focusable and tappable on touch. */
export function StackedChart({ buckets, subjects, goalMs, weekly }: StackedProps) {
  const [sel, setSel] = useState<number | null>(null);
  const max = niceMax(Math.max(goalMs ?? 0, ...buckets.map((b) => b.totalMs)));
  const labelStep = buckets.length > 20 ? Math.ceil(buckets.length / 6) : buckets.length > 10 ? 2 : 1;
  const subj = (id: string) => subjects.find((s) => s.id === id);
  const selected = sel != null ? buckets[sel] : null;

  const summary = `${weekly ? 'Weekly' : 'Daily'} study time by subject. ${buckets
    .filter((b) => b.totalMs > 0)
    .map((b) => `${formatShortDate(b.key)}${weekly ? ' week' : ''}: ${spokenDuration(b.totalMs)}`)
    .join('; ') || 'No study time in this range.'}`;

  return (
    <div className="chart">
      <p className="sr-only">{summary}</p>
      <div className="chart-plot" aria-hidden={false}>
        <div className="chart-axis" aria-hidden="true">
          <span>{axisLabel(max)}</span>
          <span>{axisLabel(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="chart-area">
          <div className="chart-grid" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          {goalMs != null && goalMs <= max && <div className="chart-goal" style={{ bottom: `${(goalMs / max) * 100}%` }} aria-hidden="true"><span>Goal</span></div>}
          <div className="chart-cols" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }} role="group" aria-label="Select a bar to see its breakdown">
            {buckets.map((b, i) => (
              <button
                key={b.key}
                type="button"
                className={`chart-col${sel === i ? ' is-selected' : ''}`}
                aria-pressed={sel === i}
                aria-label={`${weekly ? 'Week of ' : ''}${formatShortDate(b.key)}: ${b.totalMs ? spokenDuration(b.totalMs) : 'no study'}`}
                onClick={() => setSel(sel === i ? null : i)}
              >
                <span className="chart-stack" style={{ height: `${(b.totalMs / max) * 100}%` }}>
                  {b.bySubject.map((p) => (
                    <span key={p.subjectId} className="chart-seg" style={{ flexGrow: p.ms, background: subjectColor(subj(p.subjectId)) }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="chart-labels" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {buckets.map((b, i) => (
          <span key={b.key} className={i % labelStep === 0 ? '' : 'is-hidden'}>
            {b.label}
          </span>
        ))}
      </div>
      <div className="chart-detail" aria-live="polite">
        {selected ? (
          <>
            <strong>
              {weekly ? `Week of ${formatShortDate(selected.key)}` : parseDayKey(selected.key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </strong>
            <span className="muted"> · {selected.totalMs ? formatDuration(selected.totalMs) : 'No study'}</span>
            {selected.bySubject.length > 0 && (
              <ul className="chip-list">
                {selected.bySubject.map((p) => (
                  <li key={p.subjectId}>
                    <SubjectDot subject={subj(p.subjectId)} /> {subj(p.subjectId)?.name ?? 'Removed'} {formatDuration(p.ms)}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <span className="muted">Tap a bar for the breakdown.</span>
        )}
      </div>
    </div>
  );
}

export function CalendarHeat({ cells, goalMs }: { cells: { key: string; ms: number; future: boolean }[]; goalMs: number }) {
  const level = (ms: number) => (ms <= 0 ? 0 : ms < goalMs * 0.5 ? 1 : ms < goalMs ? 2 : 3);
  const days = cells.filter((c) => !c.future && c.ms >= 10 * MIN).length;
  const past = cells.filter((c) => !c.future).length;
  const label = `Consistency calendar: studied on ${days} of the last ${past} days.`;
  return (
    <div>
      <div className="heat" role="img" aria-label={label}>
        {cells.map((c) => (
          <span
            key={c.key}
            className={`heat-cell heat-${c.future ? 'future' : level(c.ms)}`}
            title={c.future ? undefined : `${formatShortDate(c.key)}: ${c.ms ? formatDuration(c.ms) : 'no study'}`}
          />
        ))}
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span className="muted">Less</span>
        {[0, 1, 2, 3].map((l) => (
          <span key={l} className={`heat-cell heat-${l}`} />
        ))}
        <span className="muted">Goal met</span>
      </div>
    </div>
  );
}

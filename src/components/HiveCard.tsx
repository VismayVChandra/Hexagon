import type { StudySession } from '../types';
import { COMB_CAPACITY, GOLDEN_SESSION_MS, goldenDayKeys, hiveSummary } from '../lib/hive';
import { capacityFor, ringsFor } from '../lib/hexGeom';
import { dayKey, formatDuration } from '../lib/time';
import { Bar } from './bits';
import { CombSvg } from './Comb';

/** Your hive: every 5 minutes of timed focus is a honey cell, kept forever. Total hours raise your bee rank. */
export function HiveCard({ sessions, now }: { sessions: StudySession[]; now: number }) {
  const h = hiveSummary(sessions);
  const goldenToday = goldenDayKeys(sessions).has(dayKey(now));
  // Show the smallest comb that holds what you've made, so it visibly grows into a bigger hive.
  const capacity = Math.min(COMB_CAPACITY, capacityFor(Math.max(2, ringsFor(h.inCurrent + 1))));
  const combs = h.fullCombs;

  return (
    <section className="card hive-card" aria-labelledby="hive-h">
      <div className="card-head">
        <h2 id="hive-h" className="card-title">
          Your hive
        </h2>
        <span className="rank-badge">{h.rank.name}</span>
      </div>

      <CombSvg
        capacity={capacity}
        filled={h.inCurrent}
        label={`Your hive: ${h.cells} honey cells, ${combs} full ${combs === 1 ? 'comb' : 'combs'}`}
        quality="lite"
        className="comb-hive"
      />

      <p className="hive-count">
        <span className="big-num">{h.cells}</span> <span className="muted">honey {h.cells === 1 ? 'cell' : 'cells'}</span>
        {combs > 0 && (
          <span className="muted">
            {' '}
            · {combs} full {combs === 1 ? 'comb' : 'combs'}
          </span>
        )}
      </p>

      <div className="hive-rank">
        <div className="subject-bars-top small">
          <span>
            <strong>{h.rank.name}</strong> <span className="muted">· {h.rank.blurb}</span>
          </span>
        </div>
        {h.next ? (
          <>
            <Bar value={h.rankProgress} label={`Progress to ${h.next.name}`} />
            <p className="hint">
              {formatDuration(h.hoursToNext * 3_600_000)} more focus to become a <strong>{h.next.name}</strong>
            </p>
          </>
        ) : (
          <p className="hint">You’ve reached the top of the hive.</p>
        )}
      </div>

      <p className={`golden${goldenToday ? ' is-earned' : ''}`}>
        <span className="golden-cell" aria-hidden="true" />
        <span>
          {goldenToday ? 'Golden cell earned today.' : `Study ${formatDuration(GOLDEN_SESSION_MS)} in one session to earn today’s golden cell.`}
          {h.goldenDays > 0 && <span className="muted"> {h.goldenDays} earned so far.</span>}
        </span>
      </p>
      <p className="hint">Every 5 minutes of timed focus fills a cell. Past sessions you log by hand don’t earn honey.</p>
    </section>
  );
}

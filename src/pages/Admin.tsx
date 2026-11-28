import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { cloudConfigured } from '../cloud/config';
import { loadAdminStats, useCloud } from '../cloud/cloud';
import { CloudError } from '../cloud/types';
import { pct, shortDay, sumDaily, visitorFunnel, type AdminStats, type DailyPoint, type FunnelStep } from '../cloud/adminStats';
import { Bar } from '../components/bits';
import { Icon } from '../components/Icon';

type Tab = 'overview' | 'visitors' | 'accounts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'visitors', label: 'Visitors' },
  { id: 'accounts', label: 'Accounts' },
];

const n = (v: number) => v.toLocaleString();

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="tile">
      <span className="eyebrow">{label}</span>
      <strong className="big-num">{typeof value === 'number' ? n(value) : value}</strong>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

function Funnel({ steps }: { steps: FunnelStep[] }) {
  return (
    <ol className="funnel">
      {steps.map((s) => (
        <li key={s.id}>
          <div className="funnel-top">
            <span className="funnel-label">{s.label}</span>
            <span>
              <strong>{n(s.count)}</strong> <span className="muted small">· {s.share}%</span>
            </span>
          </div>
          <Bar value={s.share / 100} label={`${s.label}: ${s.count} devices, ${s.share}% of visitors`} color={s.id === 'open' ? 'var(--primary)' : 'var(--honey, var(--primary))'} />
          <span className="hint">{s.hint}</span>
        </li>
      ))}
    </ol>
  );
}

type SeriesKey = 'visitors' | 'newVisitors' | 'started' | 'finished' | 'signups';

function DailyBars({ data, field, label }: { data: DailyPoint[]; field: SeriesKey; label: string }) {
  const W = 300;
  const H = 84;
  const gap = 2;
  const max = Math.max(1, ...data.map((d) => d[field]));
  const avg = data.length ? Math.round(sumDaily(data, field) / data.length) : 0;
  const bw = data.length ? (W - gap * (data.length - 1)) / data.length : W;
  return (
    <figure className="admin-chart">
      <figcaption>
        <strong>{label}</strong>
        <span className="muted small">
          about {n(avg)} a day · best day {n(max)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, last ${data.length} days. About ${avg} a day, best day ${max}.`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = d[field] === 0 ? 1 : Math.max(3, (d[field] / max) * (H - 4));
          return (
            <rect key={d.day || i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1.5} className={d[field] === 0 ? 'bar-zero' : 'bar-on'}>
              <title>{`${shortDay(d.day)}: ${d[field]}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="admin-axis muted small" aria-hidden="true">
        <span>{data[0] ? shortDay(data[0].day) : ''}</span>
        <span>{data.length ? shortDay(data[data.length - 1].day) : ''}</span>
      </div>
    </figure>
  );
}

function DailyTable({ data }: { data: DailyPoint[] }) {
  return (
    <details className="admin-table">
      <summary>Show the day-by-day numbers</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Visitors</th>
              <th scope="col">New</th>
              <th scope="col">Started studying</th>
              <th scope="col">Finished</th>
              <th scope="col">Sign-ups</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day}>
                <th scope="row">{shortDay(d.day)}</th>
                <td>{d.visitors}</td>
                <td>{d.newVisitors}</td>
                <td>{d.started}</td>
                <td>{d.finished}</td>
                <td>{d.signups}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Overview({ s }: { s: AdminStats }) {
  const o = s.overview;
  const a = s.accounts;
  return (
    <>
      <section className="tiles" aria-label="The journey in four numbers">
        <Tile label="Visited" value={o.visitorsTotal} hint={`${n(o.visitorsToday)} today · ${n(o.visitors7d)} this week`} />
        <Tile label="Signed up" value={a.total} hint={`${n(a.signups7d)} new this week`} />
        <Tile label="Started studying" value={o.startedStudying} hint={`${pct(o.startedStudying, o.visitorsTotal)}% of visitors`} />
        <Tile label="Made friends" value={a.withFriends} hint={`${n(a.friendships)} friendships in all`} />
      </section>

      <section className="card" aria-labelledby="ov-funnel">
        <h2 id="ov-funnel" className="card-title">
          From first visit to friends
        </h2>
        <p className="muted small">Each bar is a share of everyone who opened the app. One phone counts once.</p>
        <Funnel steps={visitorFunnel(o)} />
      </section>

      <section className="card" aria-labelledby="ov-days">
        <h2 id="ov-days" className="card-title">
          Last 30 days
        </h2>
        <DailyBars data={s.daily} field="visitors" label="Visitors per day" />
        <DailyBars data={s.daily} field="signups" label="Sign-ups per day" />
      </section>

      <section className="tiles" aria-label="More numbers">
        <Tile label="Came back" value={o.returningVisitors} hint="Opened on 2+ days" />
        <Tile label="Installed the app" value={o.installed} hint="Added to home screen" />
        <Tile label="Sessions finished" value={o.sessionsFinished} hint={`${n(o.sessionsStarted)} started`} />
        <Tile label="Cars built" value={o.carsBuilt} />
      </section>
    </>
  );
}

function Visitors({ s }: { s: AdminStats }) {
  const o = s.overview;
  const newish = sumDaily(s.daily, 'newVisitors');
  return (
    <>
      <p className="muted small">
        Anonymous: a random id on each device, never a name. This counts everyone who opens the app, signed in or not. {s.trackingSince ? `Counting since ${new Date(s.trackingSince).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}; earlier visits weren’t recorded.` : 'No visits recorded yet.'}
      </p>
      <section className="tiles" aria-label="Visitors">
        <Tile label="Today" value={o.visitorsToday} />
        <Tile label="Last 7 days" value={o.visitors7d} />
        <Tile label="Last 30 days" value={o.visitors30d} />
        <Tile label="All time" value={o.visitorsTotal} hint={`${n(newish)} new in 30 days`} />
      </section>
      <section className="card" aria-labelledby="vi-funnel">
        <h2 id="vi-funnel" className="card-title">
          What visitors do
        </h2>
        <Funnel steps={visitorFunnel(o)} />
      </section>
      <section className="card" aria-labelledby="vi-days">
        <h2 id="vi-days" className="card-title">
          Day by day
        </h2>
        <DailyBars data={s.daily} field="visitors" label="Visitors" />
        <DailyBars data={s.daily} field="newVisitors" label="New visitors" />
        <DailyBars data={s.daily} field="started" label="Started studying" />
        <DailyBars data={s.daily} field="finished" label="Finished sessions" />
        <DailyTable data={s.daily} />
      </section>
      <section className="tiles" aria-label="Studying">
        <Tile label="Sessions started" value={o.sessionsStarted} />
        <Tile label="Sessions finished" value={o.sessionsFinished} hint="A minute or more" />
        <Tile label="Cars built" value={o.carsBuilt} />
        <Tile label="Installed" value={o.installed} hint="Home-screen installs" />
        <Tile label="Finished the welcome" value={o.welcomed} hint="New devices since the welcome screens launched" />
      </section>
    </>
  );
}

function Accounts({ s }: { s: AdminStats }) {
  const a = s.accounts;
  return (
    <>
      <p className="muted small">Real accounts, straight from the database. Emails are shortened so this screen doesn’t show whole addresses.</p>
      <section className="tiles" aria-label="Accounts">
        <Tile label="Accounts" value={a.total} hint={`${n(a.signups7d)} new this week`} />
        <Tile label="Email confirmed" value={a.confirmed} hint={`${pct(a.confirmed, a.total)}% of accounts`} />
        <Tile label="Chose a name" value={a.named} hint="Have a friend code" />
        <Tile label="Have friends" value={a.withFriends} hint={`${pct(a.withFriends, a.named)}% of named accounts`} />
      </section>
      <section className="tiles" aria-label="Friends and sharing">
        <Tile label="Friendships" value={a.friendships} hint={a.withFriends ? `${(Math.round(((a.friendships * 2) / a.withFriends) * 10) / 10).toLocaleString()} friends each, on average` : undefined} />
        <Tile label="Share their status" value={a.sharingStatus} hint="Friends can see when they study" />
        <Tile label="Also share subject" value={a.sharingSubject} />
        <Tile label="Signed-in devices" value={s.overview.signedInDevices} hint="Devices seen with an account" />
      </section>
      <section className="tiles" aria-label="Friend profiles">
        <Tile label="Share hive and cars" value={a.sharingShowcase} hint={`${pct(a.sharingShowcase, a.named)}% of named accounts`} />
        <Tile label="Profiles sent" value={a.showcasePublished} hint="Their app has shared a hive. Fewer than above means some haven’t updated yet." />
        <Tile label="Car likes" value={a.carLikes} hint={`on ${n(a.carsLiked)} different ${a.carsLiked === 1 ? 'car' : 'cars'}`} />
        <Tile label="Cheers" value={a.cheers} hint="Latest per pair of friends" />
      </section>
      <section className="card" aria-labelledby="ac-days">
        <h2 id="ac-days" className="card-title">
          Sign-ups per day
        </h2>
        <DailyBars data={s.daily} field="signups" label="New accounts" />
      </section>
      <section className="card" aria-labelledby="ac-recent">
        <h2 id="ac-recent" className="card-title">
          Latest sign-ups
        </h2>
        {a.recent.length === 0 ? (
          <p className="muted">No accounts yet.</p>
        ) : (
          <ul className="admin-recent">
            {a.recent.map((r, i) => (
              <li key={`${r.at}-${i}`}>
                <div>
                  <strong>{r.email}</strong>
                  <span className="muted small">{r.at ? new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span>
                </div>
                <div className="admin-recent-tags">
                  <span className={`badge${r.confirmed ? '' : ' badge-warn'}`}>{r.confirmed ? 'Confirmed' : 'Not confirmed'}</span>
                  <span className="badge">{r.named ? 'Named' : 'No name yet'}</span>
                  <span className="badge">
                    {r.friends} {r.friends === 1 ? 'friend' : 'friends'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** The owner's dashboard. The server decides who may see it: anyone else just gets a short refusal. */
export default function AdminPage() {
  const cloud = useCloud();
  const tabsId = useId();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<{ message: string; owner: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // The owner check is made by the server on the account alone, so an account that hasn't picked a friends name yet still counts.
  const signedIn = cloud.phase === 'signed-in' || cloud.phase === 'needs-name';

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setStats(await loadAdminStats());
      setError(null);
    } catch (e) {
      const message = e instanceof CloudError ? e.message : 'Something went wrong. Try again.';
      setError({ message, owner: /owner/i.test(message) });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [signedIn, load]);

  let body: React.ReactNode;
  if (!cloudConfigured) {
    body = <p className="muted">This copy of Hexagon isn’t connected to a server, so there’s nothing to count.</p>;
  } else if (cloud.phase === 'starting') {
    body = <p className="muted">Checking your sign-in…</p>;
  } else if (!signedIn) {
    body = (
      <div className="card">
        <p>Sign in with your owner account to see the dashboard.</p>
        <Link to="/friends" className="btn btn-primary">
          Go to sign in
        </Link>
      </div>
    );
  } else if (error?.owner) {
    body = (
      <div className="card" role="alert">
        <h2 className="card-title">This account isn’t the owner</h2>
        <p className="muted">The dashboard is only for the account listed as the app’s owner in the database. Follow the “Make yourself the owner” step in docs/FRIENDS_SETUP.md while signed in to this account.</p>
      </div>
    );
  } else if (!stats) {
    body = error ? (
      <div className="banner banner-warn" role="alert">
        <Icon name="alert" />
        <p>{error.message}</p>
      </div>
    ) : (
      <p className="muted" role="status">
        Loading the numbers…
      </p>
    );
  } else {
    body = (
      <>
        <div className="admin-bar">
          <span className="muted small" role="status">
            Updated {new Date(stats.generatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · days in {stats.tz}
          </span>
          <button type="button" className="btn btn-quiet" onClick={() => void load()} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {error && (
          <div className="banner banner-warn" role="alert">
            <Icon name="alert" />
            <p>Couldn’t refresh just now ({error.message}). Showing the last numbers.</p>
          </div>
        )}
        <div role="tablist" aria-label="Dashboard sections" className="segmented segmented-sm">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`${tabsId}-${t.id}`} aria-selected={tab === t.id} aria-controls={`${tabsId}-panel`} className={`segment${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="admin-panel">
          {tab === 'overview' && <Overview s={stats} />}
          {tab === 'visitors' && <Visitors s={stats} />}
          {tab === 'accounts' && <Accounts s={stats} />}
        </div>
        <section className="card" aria-labelledby="ad-notes">
          <h2 id="ad-notes" className="card-title">
            How to read this
          </h2>
          <ul className="facts">
            <li>
              <span>A “visitor” is a device (a phone or browser), not a person. Someone using two phones counts twice, and clearing site data makes a returning person look new.</span>
            </li>
            <li>
              <span>Visitor and studying counts come from anonymous events. People can switch them off in Settings, and some ad blockers stop them, so real numbers are a bit higher.</span>
            </li>
            <li>
              <span>Accounts and friendships come from the database itself, so they are exact. Study time and subjects are never uploaded, so they can’t appear here.</span>
            </li>
          </ul>
        </section>
      </>
    );
  }

  return (
    <div className="page admin-page">
      <header className="page-head">
        <p className="eyebrow">Owner only</p>
        <h1 className="page-title">Admin dashboard</h1>
        <p className="page-sub">How people are really using Hexagon.</p>
      </header>
      {body}
    </div>
  );
}

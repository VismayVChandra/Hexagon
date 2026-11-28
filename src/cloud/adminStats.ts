/** The numbers on the owner dashboard, as returned by the server's admin_stats() function (and a fake one for development). */

export interface DailyPoint {
  /** yyyy-mm-dd in the owner's time zone. */
  day: string;
  visitors: number;
  newVisitors: number;
  started: number;
  finished: number;
  signups: number;
}

export interface RecentSignup {
  at: string;
  /** Already masked by the server, e.g. "vi***@gmail.com". */
  email: string;
  confirmed: boolean;
  named: boolean;
  friends: number;
}

export interface AdminStats {
  generatedAt: string;
  tz: string;
  /** When the first usage event was recorded. Visits before that were not counted. */
  trackingSince: string | null;
  /** Anonymous devices and what they did. One phone = one device, so this is people, roughly. */
  overview: {
    visitorsTotal: number;
    visitorsToday: number;
    visitors7d: number;
    visitors30d: number;
    returningVisitors: number;
    installed: number;
    startedStudying: number;
    finishedSession: number;
    sessionsStarted: number;
    sessionsFinished: number;
    /** Devices that finished the first-run welcome (counted from the version that added it). */
    welcomed: number;
    carsBuilt: number;
    signedInDevices: number;
    friendDevices: number;
  };
  /** Real accounts, straight from the database. */
  accounts: {
    total: number;
    confirmed: number;
    named: number;
    withFriends: number;
    friendships: number;
    sharingStatus: number;
    sharingSubject: number;
    /** Accounts whose friends may see their hive and cars. */
    sharingShowcase: number;
    /** Accounts whose app has actually sent a hive and cars. Fewer than sharing means some haven't updated yet. */
    showcasePublished: number;
    carLikes: number;
    /** Different cars that at least one friend has liked. */
    carsLiked: number;
    /** Cheers on record: only the latest one per pair of friends is kept. */
    cheers: number;
    signups7d: number;
    recent: RecentSignup[];
  };
  daily: DailyPoint[];
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** Turns whatever came back into a complete, well-typed object, so the page never shows NaN or crashes on a missing field. */
export function parseAdminStats(raw: unknown): AdminStats {
  const r = obj(raw);
  const o = obj(r.overview);
  const a = obj(r.accounts);
  return {
    generatedAt: str(r.generated_at, new Date().toISOString()),
    tz: str(r.tz, 'UTC'),
    trackingSince: typeof r.tracking_since === 'string' ? r.tracking_since : null,
    overview: {
      visitorsTotal: num(o.visitors_total),
      visitorsToday: num(o.visitors_today),
      visitors7d: num(o.visitors_7d),
      visitors30d: num(o.visitors_30d),
      returningVisitors: num(o.returning_visitors),
      installed: num(o.installed),
      startedStudying: num(o.started_studying),
      finishedSession: num(o.finished_session),
      sessionsStarted: num(o.sessions_started),
      sessionsFinished: num(o.sessions_finished),
      welcomed: num(o.welcomed),
      carsBuilt: num(o.cars_built),
      signedInDevices: num(o.signed_in_devices),
      friendDevices: num(o.friend_devices),
    },
    accounts: {
      total: num(a.total),
      confirmed: num(a.confirmed),
      named: num(a.named),
      withFriends: num(a.with_friends),
      friendships: num(a.friendships),
      sharingStatus: num(a.sharing_status),
      sharingSubject: num(a.sharing_subject),
      sharingShowcase: num(a.sharing_showcase),
      showcasePublished: num(a.showcase_published),
      carLikes: num(a.car_likes),
      carsLiked: num(a.cars_liked),
      cheers: num(a.cheers),
      signups7d: num(a.signups_7d),
      recent: (Array.isArray(a.recent) ? a.recent : []).slice(0, 8).map((x) => {
        const e = obj(x);
        return { at: str(e.at), email: str(e.email, '—'), confirmed: e.confirmed === true, named: e.named === true, friends: num(e.friends) };
      }),
    },
    daily: (Array.isArray(r.daily) ? r.daily : []).slice(-60).map((x) => {
      const d = obj(x);
      return { day: str(d.day), visitors: num(d.visitors), newVisitors: num(d.new_visitors), started: num(d.started), finished: num(d.finished), signups: num(d.signups) };
    }),
  };
}

/** A percentage from 0 to 100, never above 100 and never NaN. */
export const pct = (part: number, whole: number): number => (whole > 0 ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);

export interface FunnelStep {
  id: string;
  label: string;
  hint: string;
  count: number;
  /** Share of everyone who opened the app, 0 to 100. */
  share: number;
}

/** From opening the app to making a friend. Counts are devices, and every step is shown against all visitors. */
export function visitorFunnel(o: AdminStats['overview']): FunnelStep[] {
  const steps: Omit<FunnelStep, 'share'>[] = [
    { id: 'open', label: 'Opened the app', hint: 'Devices that opened Hexagon at least once.', count: o.visitorsTotal },
    { id: 'return', label: 'Came back on another day', hint: 'Opened it on two or more different days.', count: o.returningVisitors },
    { id: 'start', label: 'Started studying', hint: 'Began at least one session.', count: o.startedStudying },
    { id: 'finish', label: 'Finished a session', hint: 'Saved at least one session of a minute or more.', count: o.finishedSession },
    { id: 'login', label: 'Signed in', hint: 'Used an account for friends on this device.', count: o.signedInDevices },
    { id: 'friend', label: 'Made a friend', hint: 'Signed in and has at least one friend.', count: o.friendDevices },
  ];
  return steps.map((s) => ({ ...s, share: pct(s.count, o.visitorsTotal) }));
}

/** Total of one daily series, for the small "last 30 days" captions. */
export const sumDaily = (daily: DailyPoint[], key: 'visitors' | 'newVisitors' | 'started' | 'finished' | 'signups'): number => daily.reduce((n, d) => n + d[key], 0);

/** Short label for a yyyy-mm-dd day, e.g. "27 Nov". */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

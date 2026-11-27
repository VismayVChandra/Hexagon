import { describe, expect, it } from 'vitest';
import { createTracker, type AnalyticsEvent, type EventSink } from './analytics';
import { parseAdminStats, pct, sumDaily, visitorFunnel } from './adminStats';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  };
}

function fakeSink(fail = false) {
  const sent: { device: string; name: AnalyticsEvent }[] = [];
  const forgotten: string[] = [];
  const sink: EventSink & { fail: boolean } = {
    fail,
    async logEvent(device, name) {
      if (sink.fail) throw new Error('offline');
      sent.push({ device, name });
    },
    async forgetDevice(device) {
      if (sink.fail) throw new Error('offline');
      forgotten.push(device);
    },
  };
  return { sink, sent, forgotten };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('anonymous usage counts', () => {
  it('sends only known event names, tagged with one stable random device id', async () => {
    const storage = fakeStorage();
    const { sink, sent } = fakeSink();
    let n = 0;
    const t = createTracker({ storage, isEnabled: () => true, uuid: () => `id-${++n}` });
    t.attach(sink);
    t.track('app_open');
    t.track('session_start');
    t.track('nonsense' as AnalyticsEvent);
    await tick();
    await tick();
    expect(sent.map((e) => e.name)).toEqual(['app_open', 'session_start']);
    expect(new Set(sent.map((e) => e.device)).size).toBe(1);
    expect(storage.getItem('hexagon.device')).toBe(sent[0].device);
    expect(n).toBe(1);
  });

  it('records nothing while switched off', async () => {
    const { sink, sent } = fakeSink();
    const t = createTracker({ storage: fakeStorage(), isEnabled: () => false, uuid: () => 'x' });
    t.attach(sink);
    t.track('app_open');
    await tick();
    expect(sent).toHaveLength(0);
    expect(t.pending()).toBe(0);
  });

  it('keeps events while offline or before the server is connected, then sends them', async () => {
    const storage = fakeStorage();
    const t = createTracker({ storage, isEnabled: () => true, uuid: () => 'dev' });
    t.track('app_open');
    t.track('session_start');
    expect(t.pending()).toBe(2);
    expect(JSON.parse(storage.getItem('hexagon.events') ?? '[]')).toEqual(['app_open', 'session_start']);
    const { sink, sent } = fakeSink();
    t.attach(sink);
    await tick();
    await tick();
    expect(sent).toHaveLength(2);
    expect(t.pending()).toBe(0);
    expect(storage.getItem('hexagon.events')).toBeNull();
  });

  it('backs off after a failed send and keeps the event for later', async () => {
    let clock = 1000;
    const { sink, sent } = fakeSink(true);
    const t = createTracker({ storage: fakeStorage(), isEnabled: () => true, uuid: () => 'dev', now: () => clock, retryMs: 60_000 });
    t.attach(sink);
    t.track('app_open');
    await tick();
    expect(t.pending()).toBe(1);
    sink.fail = false;
    t.track('session_start'); // too soon: still waiting out the back-off
    await tick();
    expect(sent).toHaveLength(0);
    clock += 61_000;
    t.track('session_finish');
    await tick();
    await tick();
    expect(sent.map((e) => e.name)).toEqual(['app_open', 'session_start', 'session_finish']);
  });

  it('caps what it keeps while waiting', () => {
    const t = createTracker({ storage: fakeStorage(), isEnabled: () => true, uuid: () => 'dev', maxQueue: 5 });
    for (let i = 0; i < 20; i++) t.track('app_open');
    expect(t.pending()).toBe(5);
  });

  it('opting out clears the queue, forgets the device id and asks the server to delete its events', async () => {
    const storage = fakeStorage();
    const { sink, forgotten } = fakeSink();
    const t = createTracker({ storage, isEnabled: () => true, uuid: () => 'dev-1' });
    t.deviceId(); // a device id exists once something has been sent from this device
    t.track('app_open');
    expect(storage.getItem('hexagon.device')).toBe('dev-1');
    t.attach(sink);
    t.optOut();
    await tick();
    await tick();
    expect(storage.getItem('hexagon.device')).toBeNull();
    expect(storage.getItem('hexagon.events')).toBeNull();
    expect(forgotten).toEqual(['dev-1']);
    expect(storage.getItem('hexagon.forget')).toBeNull();
  });

  it('remembers a pending "forget me" until the server can be reached', async () => {
    const storage = fakeStorage();
    const t = createTracker({ storage, isEnabled: () => true, uuid: () => 'dev-2' });
    t.deviceId();
    t.optOut(); // no server connected yet
    expect(JSON.parse(storage.getItem('hexagon.forget') ?? '[]')).toEqual(['dev-2']);
    const { sink, forgotten } = fakeSink();
    t.attach(sink);
    await tick();
    await tick();
    expect(forgotten).toEqual(['dev-2']);
  });

  it('still works when storage is unavailable', async () => {
    const { sink, sent } = fakeSink();
    const t = createTracker({ storage: null, isEnabled: () => true, uuid: () => 'mem' });
    t.attach(sink);
    t.track('app_open');
    t.track('app_open');
    await tick();
    await tick();
    expect(sent.map((e) => e.device)).toEqual(['mem', 'mem']);
  });
});

describe('dashboard numbers', () => {
  it('turns a missing or odd response into complete, safe numbers', () => {
    const empty = parseAdminStats(null);
    expect(empty.overview.visitorsTotal).toBe(0);
    expect(empty.accounts.recent).toEqual([]);
    expect(empty.daily).toEqual([]);
    const odd = parseAdminStats({ overview: { visitors_total: '12', started_studying: -4, cars_built: 'x' }, accounts: { total: 3.6, recent: [{ email: 'a***@b.c', confirmed: true }] }, daily: [{ day: '2026-11-27', visitors: 5 }] });
    expect(odd.overview.visitorsTotal).toBe(12);
    expect(odd.overview.startedStudying).toBe(0);
    expect(odd.overview.carsBuilt).toBe(0);
    expect(odd.accounts.total).toBe(4);
    expect(odd.accounts.recent[0]).toMatchObject({ email: 'a***@b.c', confirmed: true, named: false, friends: 0 });
    expect(odd.daily[0]).toMatchObject({ day: '2026-11-27', visitors: 5, signups: 0 });
  });

  it('works out percentages without dividing by zero or going over 100', () => {
    expect(pct(1, 0)).toBe(0);
    expect(pct(1, 3)).toBe(33);
    expect(pct(9, 3)).toBe(100);
  });

  it('builds the visitor funnel against all visitors', () => {
    const o = parseAdminStats({ overview: { visitors_total: 200, returning_visitors: 80, started_studying: 120, finished_session: 90, signed_in_devices: 40, friend_devices: 20 } }).overview;
    const steps = visitorFunnel(o);
    expect(steps.map((s) => s.id)).toEqual(['open', 'return', 'start', 'finish', 'login', 'friend']);
    expect(steps.map((s) => s.share)).toEqual([100, 40, 60, 45, 20, 10]);
  });

  it('adds up a daily series', () => {
    const s = parseAdminStats({ daily: [{ day: '2026-11-26', visitors: 4, signups: 1 }, { day: '2026-11-27', visitors: 6, signups: 2 }] });
    expect(sumDaily(s.daily, 'visitors')).toBe(10);
    expect(sumDaily(s.daily, 'signups')).toBe(3);
  });
});

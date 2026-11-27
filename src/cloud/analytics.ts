import { cloudConfigured } from './config';

/**
 * Anonymous usage counts, so the app's owner can see how Hexagon is really used (visits, sessions started, and so on).
 *
 *  - Only a fixed list of event names is ever sent. Never a name, subject, topic, note or anything typed by the student.
 *  - Each device has a random id (kept in this browser only), so the same phone is counted once rather than many times.
 *  - If the student is signed in, the server can also link events to their account. Otherwise they stay anonymous.
 *  - It can be switched off in Settings, which also asks the server to delete this device's events.
 *  - Nothing is sent unless a Supabase project is configured.
 */
export type AnalyticsEvent = 'app_open' | 'session_start' | 'session_finish' | 'car_built' | 'app_installed';

export const ANALYTICS_EVENTS: readonly AnalyticsEvent[] = ['app_open', 'session_start', 'session_finish', 'car_built', 'app_installed'];

/** Where events go. The cloud backend implements this. */
export interface EventSink {
  logEvent(deviceId: string, name: AnalyticsEvent): Promise<void>;
  forgetDevice(deviceId: string): Promise<void>;
}

interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TrackerOptions {
  storage: KeyValue | null;
  isEnabled: () => boolean;
  uuid: () => string;
  now?: () => number;
  /** How many events to keep while offline or waiting for the server. */
  maxQueue?: number;
  /** How long to wait after a failed send before trying again. */
  retryMs?: number;
}

const DEVICE_KEY = 'hexagon.device';
const QUEUE_KEY = 'hexagon.events';
const FORGET_KEY = 'hexagon.forget';

export function createTracker(opts: TrackerOptions) {
  const { storage, uuid } = opts;
  const now = opts.now ?? Date.now;
  const maxQueue = opts.maxQueue ?? 40;
  const retryMs = opts.retryMs ?? 60_000;

  let sink: EventSink | null = null;
  let memoryId: string | null = null;
  let queue: AnalyticsEvent[] = readQueue();
  let flushing = false;
  let blockedUntil = 0;

  function readQueue(): AnalyticsEvent[] {
    try {
      const raw = storage?.getItem(QUEUE_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((n): n is AnalyticsEvent => ANALYTICS_EVENTS.includes(n as AnalyticsEvent)).slice(-maxQueue) : [];
    } catch {
      return [];
    }
  }
  function writeQueue() {
    try {
      if (queue.length) storage?.setItem(QUEUE_KEY, JSON.stringify(queue));
      else storage?.removeItem(QUEUE_KEY);
    } catch {
      /* optional */
    }
  }
  function readForget(): string[] {
    try {
      const raw = storage?.getItem(FORGET_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(-5) : [];
    } catch {
      return [];
    }
  }
  function writeForget(ids: string[]) {
    try {
      if (ids.length) storage?.setItem(FORGET_KEY, JSON.stringify(ids));
      else storage?.removeItem(FORGET_KEY);
    } catch {
      /* optional */
    }
  }

  function deviceId(): string {
    try {
      const saved = storage?.getItem(DEVICE_KEY);
      if (saved) return saved;
    } catch {
      /* fall through */
    }
    if (memoryId) return memoryId;
    const id = uuid();
    memoryId = id;
    try {
      storage?.setItem(DEVICE_KEY, id);
    } catch {
      /* kept in memory for this visit */
    }
    return id;
  }

  async function flush(): Promise<void> {
    if (!sink || flushing || now() < blockedUntil) return;
    flushing = true;
    try {
      // Keep going until there is nothing left to do. Looking again each round also catches a "forget my device"
      // request made while an earlier send was still in flight.
      for (;;) {
        const [forgetId] = readForget();
        if (forgetId) {
          await sink.forgetDevice(forgetId);
          writeForget(readForget().filter((x) => x !== forgetId));
        } else if (queue.length && opts.isEnabled()) {
          await sink.logEvent(deviceId(), queue[0]);
          queue = queue.slice(1);
          writeQueue();
        } else {
          break;
        }
      }
    } catch {
      blockedUntil = now() + retryMs; // offline or the server isn't set up yet: try again later
    } finally {
      flushing = false;
    }
  }

  return {
    /** Record one event (if usage counts are on). Safe to call anywhere: it never throws and never blocks. */
    track(name: AnalyticsEvent): void {
      if (!opts.isEnabled() || !ANALYTICS_EVENTS.includes(name)) return;
      queue = [...queue, name].slice(-maxQueue);
      writeQueue();
      void flush();
    },
    /** Connect the server. Anything waiting is sent now. */
    attach(next: EventSink | null): void {
      sink = next;
      blockedUntil = 0;
      void flush();
    },
    /** Usage counts were switched off: drop what's waiting, forget this device's id, and ask the server to delete its events. */
    optOut(): void {
      queue = [];
      writeQueue();
      const id = (() => {
        try {
          return storage?.getItem(DEVICE_KEY) ?? memoryId;
        } catch {
          return memoryId;
        }
      })();
      memoryId = null;
      try {
        storage?.removeItem(DEVICE_KEY);
      } catch {
        /* optional */
      }
      if (id) {
        writeForget([...readForget(), id]);
        blockedUntil = 0;
        void flush();
      }
    },
    flush,
    deviceId,
    pending: () => queue.length,
  };
}

function safeStorage(): KeyValue | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16)));

let enabled: boolean | null = null;

export const analytics = createTracker({
  storage: safeStorage(),
  isEnabled: () => cloudConfigured && enabled !== false,
  uuid: newId,
});

/** Called once the saved settings are known, and whenever the Settings switch changes. */
export function setAnalyticsEnabled(on: boolean): void {
  enabled = on;
  // Safe to repeat: with no device id saved there is nothing left to forget.
  if (!on) analytics.optOut();
}

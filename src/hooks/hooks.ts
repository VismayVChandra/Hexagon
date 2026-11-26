import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Re-renders on an interval so the UI can redraw. The interval is NOT the source of
 * truth for time: callers always derive values from Date.now() and stored timestamps.
 * Also refreshes immediately when the page becomes visible again.
 */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [active, intervalMs]);
  return now;
}

type WakeLockSentinelLike = { release: () => Promise<void> };

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/** Keeps the screen on while `enabled`, where the browser supports it. Re-acquires after the tab returns. */
export function useWakeLock(enabled: boolean): 'unsupported' | 'on' | 'off' {
  const [held, setHeld] = useState(false);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled || !wakeLockSupported) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
        const s = await nav.wakeLock.request('screen');
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel.current = s;
        setHeld(true);
      } catch {
        setHeld(false);
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
      setHeld(false);
    };
  }, [enabled]);

  if (!wakeLockSupported) return 'unsupported';
  return enabled && held ? 'on' : 'off';
}

// ---------- install ----------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notifyInstall();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export interface InstallInfo {
  /** Already running as an installed app. */
  standalone: boolean;
  /** The browser offered a native install prompt. */
  canPrompt: boolean;
  /** iPhone/iPad, where installing is done by hand from the Share menu. */
  ios: boolean;
  prompt: () => Promise<void>;
}

const installSnapshot = () => `${deferredPrompt ? 1 : 0}${installed ? 1 : 0}`;

export function useInstall(): InstallInfo {
  useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    installSnapshot,
    installSnapshot,
  );
  return {
    standalone: installed || isStandalone(),
    canPrompt: deferredPrompt != null,
    ios: isIOS(),
    prompt: async () => {
      const p = deferredPrompt;
      if (!p) return;
      await p.prompt();
      await p.userChoice.catch(() => undefined);
      deferredPrompt = null;
      notifyInstall();
    },
  };
}

// ---------- haptics (Android browsers; iOS Safari has no vibration API) ----------

export const hapticsSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;

const PATTERNS = { tap: 10, press: 18, success: [14, 50, 22] } as const;

export function haptic(kind: keyof typeof PATTERNS, enabled = true) {
  if (!enabled || !hapticsSupported) return;
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {
    /* optional */
  }
}

// ---------- audio chime (only plays while the app is open) ----------

let audioCtx: AudioContext | null = null;

/** Call from a user gesture (e.g. the Start button) so later chimes are allowed to play. */
export function primeAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* audio is optional */
  }
}

export function chime(kind: 'start' | 'end') {
  try {
    if (!audioCtx) return;
    const notes = kind === 'end' ? [523.25, 659.25, 783.99] : [659.25, 523.25];
    const t0 = audioCtx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      const t = t0 + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    if ('vibrate' in navigator) navigator.vibrate?.(kind === 'end' ? [120, 60, 120] : 80);
  } catch {
    /* ignore */
  }
}

// ---------- toasts ----------

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}
let toasts: Toast[] = [];
let toastId = 0;
const toastListeners = new Set<() => void>();

export function showToast(message: string, tone: Toast['tone'] = 'success') {
  const t = { id: ++toastId, message, tone };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l());
  window.setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, 4200);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', l);
      return () => m.removeEventListener('change', l);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

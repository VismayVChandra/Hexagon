import type { CueTone } from '../types';
import { audioContext, primeAudio } from '../hooks/hooks';

/**
 * Timer sounds, made on the device with the Web Audio API (no audio files, so they work offline).
 * Every moment has its own little tune, so you can tell what happened without looking:
 *   start / resume   a quick rising pair            pause          a soft falling pair
 *   focusEnd         slow and falling: "take a break"   breakEnd    bright and rising: "back to it"
 *   timerDone        a full arpeggio that settles on a chord (the alarm)
 *   milestone        one soft ding (stopwatch)      goal           a light sparkle (daily goal reached)
 *   reward           a short fanfare (session saved, car built)
 */
export type Cue = 'start' | 'pause' | 'focusEnd' | 'breakEnd' | 'timerDone' | 'milestone' | 'goal' | 'reward';

export const CUES: { id: Cue; label: string; when: string }[] = [
  { id: 'timerDone', label: 'Timer done', when: 'A countdown reaches zero' },
  { id: 'focusEnd', label: 'Focus block ends', when: 'Pomodoro: time for a break' },
  { id: 'breakEnd', label: 'Break ends', when: 'Pomodoro: back to work' },
  { id: 'start', label: 'Start', when: 'You start or resume a session' },
  { id: 'pause', label: 'Pause', when: 'You pause a session' },
  { id: 'milestone', label: 'Stopwatch milestone', when: 'Every 15, 30 or 60 minutes' },
  { id: 'goal', label: 'Daily goal reached', when: 'Today passes your daily goal' },
  { id: 'reward', label: 'Reward', when: 'You save a session or finish a car' },
];

export const CUE_TONE_LABELS: Record<CueTone, string> = { bell: 'Bell', marimba: 'Marimba', harp: 'Harp', beep: 'Beep' };

/** A note: semitones above C5, when it starts (seconds), and how long it rings relative to the tone's natural length. */
type Step = readonly [semitone: number, at: number, length?: number];

const MELODIES: Record<Cue, readonly Step[]> = {
  start: [[4, 0], [9, 0.11]],
  pause: [[7, 0], [0, 0.13]],
  focusEnd: [[12, 0], [7, 0.24], [4, 0.48], [0, 0.72, 1.6]],
  breakEnd: [[0, 0], [4, 0.14], [7, 0.28], [12, 0.42, 1.4]],
  timerDone: [
    [0, 0],
    [4, 0.2],
    [7, 0.4],
    [12, 0.6],
    [7, 1.0],
    [0, 1.2, 2],
    [4, 1.2, 2],
    [7, 1.2, 2],
    [12, 1.2, 2],
  ],
  milestone: [[7, 0], [12, 0.16, 1.4]],
  goal: [[12, 0], [16, 0.09], [19, 0.18], [24, 0.27, 1.6]],
  reward: [
    [0, 0],
    [4, 0.12],
    [7, 0.24],
    [12, 0.36],
    [16, 0.56, 2],
    [19, 0.56, 2],
    [24, 0.56, 2],
  ],
};

/** The timbre of each tone: partials (frequency ratio and loudness), wave shape and how long a note rings. */
const TONES: Record<CueTone, { wave: OscillatorType; partials: readonly (readonly [number, number])[]; attack: number; ring: number }> = {
  bell: { wave: 'sine', partials: [[1, 1], [2.76, 0.35], [5.4, 0.12]], attack: 0.006, ring: 1.5 },
  marimba: { wave: 'sine', partials: [[1, 1], [4, 0.25], [10, 0.06]], attack: 0.003, ring: 0.45 },
  harp: { wave: 'triangle', partials: [[1, 1], [2, 0.3], [3, 0.1]], attack: 0.004, ring: 1.0 },
  beep: { wave: 'square', partials: [[1, 0.55]], attack: 0.008, ring: 0.16 },
};

const C5 = 523.25;
export const noteHz = (semitone: number) => C5 * Math.pow(2, semitone / 12);

export interface PlannedNote {
  hz: number;
  start: number;
  duration: number;
  gain: number;
}

/** The notes of a cue in a tone, with start times from zero. Pure, so it can be checked without any audio. */
export function planCue(cue: Cue, tone: CueTone): PlannedNote[] {
  const t = TONES[tone];
  const steps = MELODIES[cue];
  // Chords have several notes at once; keep the total level steady.
  const sameTime = (at: number) => steps.filter((s) => s[1] === at).length;
  return steps.map(([semi, at, len = 1]) => ({
    hz: noteHz(semi),
    start: at,
    duration: t.ring * len,
    gain: 1 / Math.sqrt(sameTime(at)),
  }));
}

/** Peak loudness for a 0..1 volume setting. The top of the slider is clear but not painful. */
export function cueGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return 0.04 + v * v * 0.3;
}

/** How long a cue lasts, in seconds, including its last note's ring. */
export function cueLength(cue: Cue, tone: CueTone): number {
  return planCue(cue, tone).reduce((m, n) => Math.max(m, n.start + n.duration), 0);
}

/** Write a cue onto an audio graph, starting at `when` (audio-clock seconds). Returns the nodes so they can be cancelled. */
export function renderCue(ctx: BaseAudioContext, out: AudioNode, cue: Cue, tone: CueTone, volume: number, when: number): { stop: () => void } {
  const timbre = TONES[tone];
  const peak = cueGain(volume);
  const master = ctx.createGain();
  master.gain.value = 1;
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = tone === 'beep' ? 2600 : 6000;
  master.connect(soften).connect(out);
  const oscillators: OscillatorNode[] = [];
  for (const note of planCue(cue, tone)) {
    const t = when + note.start;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * note.gain), t + timbre.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + note.duration);
    env.connect(master);
    for (const [ratio, level] of timbre.partials) {
      const osc = ctx.createOscillator();
      osc.type = timbre.wave;
      osc.frequency.value = note.hz * ratio;
      const g = ctx.createGain();
      g.gain.value = level / timbre.partials.length ** 0.5;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + note.duration + 0.05);
      oscillators.push(osc);
    }
  }
  return {
    stop: () => {
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(0.0001, now, 0.03);
      } catch {
        /* already finished */
      }
      for (const o of oscillators) {
        try {
          o.stop(now + 0.2);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

export interface CueHandle {
  cancel: () => void;
}

/** True when the browser will play sound right now. */
export function audioReady(): boolean {
  const ctx = audioContext();
  return !!ctx && (ctx.state as AudioContextState) === 'running';
}

/** Play a cue now. Does nothing if audio hasn't been unlocked by a tap yet. */
export function playCue(cue: Cue, tone: CueTone, volume: number): CueHandle | null {
  return scheduleCue(cue, tone, volume, 0);
}

/**
 * Line a cue up `delaySec` seconds from now on the audio clock. That clock keeps running when the page is in the background
 * or the screen is off (as long as audio is allowed), so a timer can still ring on time when JavaScript timers are slowed down.
 */
export function scheduleCue(cue: Cue, tone: CueTone, volume: number, delaySec: number): CueHandle | null {
  const ctx = audioContext();
  if (!ctx || (ctx.state as AudioContextState) !== 'running') return null;
  try {
    const r = renderCue(ctx, ctx.destination, cue, tone, volume, ctx.currentTime + Math.max(0.02, delaySec));
    return { cancel: r.stop };
  } catch {
    return null;
  }
}

/** For a button press: wake the audio engine from the tap, then play. */
export function previewCue(cue: Cue, tone: CueTone, volume: number): void {
  primeAudio();
  const ctx = audioContext();
  if (!ctx) return;
  void ctx
    .resume()
    .catch(() => undefined)
    .then(() => playCue(cue, tone, volume));
}

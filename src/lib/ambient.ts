import type { AmbientSound } from '../types';
import { audioContext, primeAudio } from '../hooks/hooks';

/**
 * Background sound for studying, generated on the device with the Web Audio API: no audio files, so it works offline
 * and adds nothing to the download. One sound plays at a time and fades in and out.
 *
 * Everything here is synthesized (filtered noise, slow swells, and little events like bird calls, fire pops and thunder
 * that are scheduled a couple of seconds ahead on the audio clock). It is calm and pleasant, but it is not a recording.
 */

export type AmbientKind = Exclude<AmbientSound, 'off'>;

export const AMBIENT_SOUNDS: { id: AmbientSound; label: string; blurb: string; group: 'nature' | 'noise' | 'off' }[] = [
  { id: 'off', label: 'Off', blurb: 'Silence', group: 'off' },
  { id: 'rain', label: 'Rain', blurb: 'Steady rain on a window', group: 'nature' },
  { id: 'storm', label: 'Thunderstorm', blurb: 'Heavy rain with distant thunder', group: 'nature' },
  { id: 'waves', label: 'Ocean waves', blurb: 'Slow waves rolling onto a beach', group: 'nature' },
  { id: 'stream', label: 'Stream', blurb: 'A brook running over stones', group: 'nature' },
  { id: 'forest', label: 'Forest', blurb: 'Soft wind and birdsong', group: 'nature' },
  { id: 'fire', label: 'Fireplace', blurb: 'A warm crackling fire', group: 'nature' },
  { id: 'night', label: 'Summer night', blurb: 'Crickets and still night air', group: 'nature' },
  { id: 'wind', label: 'Wind', blurb: 'Wind moving through trees', group: 'nature' },
  { id: 'brown', label: 'Brown noise', blurb: 'A deep, even hush', group: 'noise' },
  { id: 'white', label: 'White noise', blurb: 'A bright, even hiss that masks distractions', group: 'noise' },
];

const FADE_IN = 1.4;
const FADE_OUT = 0.6;

/** Per-sound level so they sit at about the same loudness. Set by rendering each one offline and matching loudness (about 0.025 RMS at the default volume; the event-based ones a little lower). */
export const TRIM: Record<AmbientKind, number> = {
  rain: 1,
  storm: 0.85,
  waves: 1.2,
  stream: 1.5,
  forest: 2,
  fire: 1.4,
  night: 1.8,
  wind: 1.6,
  brown: 0.85,
  white: 1,
};

export interface Playing {
  kind: AmbientKind;
  master: GainNode;
  stop: () => void;
}

let playing: Playing | null = null;
let preview: { timer: number } | null = null;
let buffers: { white?: AudioBuffer; brown?: AudioBuffer; pink?: AudioBuffer } = {};
let buffersFor: BaseAudioContext | null = null;

type NoiseKind = 'white' | 'brown' | 'pink';

/** Six seconds of looping noise. Brown noise leans toward low rumble, which is easy on the ears; pink sits in between. */
function noise(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  if (buffersFor !== ctx) {
    buffers = {};
    buffersFor = ctx;
  }
  const cached = buffers[kind];
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 6);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = w * 0.5;
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else {
      // Paul Kellet's economical pink noise filter.
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Make the loop seamless: fade the last few milliseconds into the start.
  const x = Math.floor(ctx.sampleRate * 0.03);
  for (let i = 0; i < x; i++) {
    const t = i / x;
    data[length - x + i] = data[length - x + i] * (1 - t) + data[i] * t;
  }
  buffers[kind] = buf;
  return buf;
}

/** A looping noise source, started at a random point so layers of the same noise don't line up. */
function loop(ctx: BaseAudioContext, kind: NoiseKind): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  const buf = noise(ctx, kind);
  src.buffer = buf;
  src.loop = true;
  src.start(0, Math.random() * buf.duration);
  return src;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  return f;
}

function amp(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** A slow wobble added to a parameter: base value plus/minus `depth`, `hz` times a second. */
function wobble(ctx: BaseAudioContext, param: AudioParam, hz: number, depth: number, sources: AudioScheduledSourceNode[]): void {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = hz;
  lfo.connect(amp(ctx, depth)).connect(param);
  lfo.start();
  sources.push(lfo);
}

/** Calls `fn(from, to)` every half second with the next couple of seconds of audio time to fill with little events. */
function scheduleAhead(ctx: BaseAudioContext, fn: (from: number, to: number) => void): () => void {
  // Rendering to a file (offline) has no real-time clock: fill the whole length at once. Used to measure the sounds.
  if (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) {
    fn(ctx.currentTime, ctx.length / ctx.sampleRate);
    return () => undefined;
  }
  let next = ctx.currentTime;
  const tick = () => {
    const from = Math.max(next, ctx.currentTime);
    const to = ctx.currentTime + 2.5;
    if (to > from) fn(from, to);
    next = Math.max(next, to);
  };
  tick();
  const id = window.setInterval(tick, 500);
  return () => window.clearInterval(id);
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pan = (ctx: BaseAudioContext, value: number): AudioNode | null => {
  if (typeof ctx.createStereoPanner !== 'function') return null;
  const p = ctx.createStereoPanner();
  p.pan.value = value;
  return p;
};

/** One bird call: a short sine that glides from one pitch to another. */
function chirp(ctx: BaseAudioContext, out: AudioNode, t: number, f0: number, f1: number, dur: number, level: number, side: number): void {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  const p = pan(ctx, side);
  if (p) g.connect(p).connect(out);
  else g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
}

/** How loud a sound should be at a given 0..1 setting. Kept gentle: the top of the slider is still not loud. */
export function gainFor(volume: number, kind?: AmbientKind): number {
  const v = Math.min(1, Math.max(0, volume));
  return (0.04 + v * v * 0.5) * (kind ? TRIM[kind] : 1);
}

/** Build one sound's audio graph. `stop` fades it out and frees everything. Exported so the sounds can be measured offline. */
export function buildAmbient(ctx: BaseAudioContext, kind: AmbientKind, volume: number): Playing {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);
  const sources: AudioScheduledSourceNode[] = [];
  const cleanups: (() => void)[] = [];
  const level = gainFor(volume, kind);

  if (kind === 'brown') {
    const src = loop(ctx, 'brown');
    src.connect(filter(ctx, 'lowpass', 1400)).connect(master);
    sources.push(src);
  } else if (kind === 'white') {
    const src = loop(ctx, 'white');
    src.connect(filter(ctx, 'lowpass', 7000)).connect(amp(ctx, 0.6)).connect(master);
    sources.push(src);
  } else if (kind === 'rain' || kind === 'storm') {
    // Hiss for the drops, a little low rumble underneath, and a slow flutter so it isn't a flat wall of sound.
    const heavy = kind === 'storm';
    const hiss = loop(ctx, 'white');
    const hissGain = amp(ctx, heavy ? 0.7 : 0.55);
    hiss.connect(filter(ctx, 'highpass', heavy ? 600 : 900)).connect(filter(ctx, 'lowpass', heavy ? 6000 : 7200)).connect(hissGain).connect(master);
    wobble(ctx, hissGain.gain, 0.23, 0.12, sources);
    const rumble = loop(ctx, 'brown');
    rumble.connect(amp(ctx, heavy ? 0.5 : 0.35)).connect(master);
    sources.push(hiss, rumble);
    if (heavy) {
      // Distant thunder: a long, slow-rising rumble every so often. Never sudden, so it won't startle.
      let nextThunder = ctx.currentTime + rand(8, 16);
      cleanups.push(
        scheduleAhead(ctx, (from, to) => {
          while (nextThunder < to) {
            const t = Math.max(nextThunder, from);
            const dur = rand(4, 5.4);
            const rumble = ctx.createBufferSource();
            const buf = noise(ctx, 'brown');
            rumble.buffer = buf;
            const lp = filter(ctx, 'lowpass', rand(180, 260));
            lp.frequency.setValueAtTime(lp.frequency.value, t);
            lp.frequency.exponentialRampToValueAtTime(70, t + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(rand(0.5, 0.8), t + rand(0.7, 1.4));
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            rumble.connect(lp).connect(g).connect(master);
            rumble.start(t, Math.random() * (buf.duration - dur - 0.1), dur + 0.1);
            nextThunder += rand(16, 38);
          }
        }),
      );
    }
  } else if (kind === 'waves') {
    // Two slow swells that drift in and out of step, so the waves are never exactly regular. Each swell makes the
    // water louder and brighter, with a hiss of foam riding on top.
    const body = loop(ctx, 'brown');
    const bodyFilter = filter(ctx, 'lowpass', 600);
    const bodyGain = amp(ctx, 0.65);
    body.connect(bodyFilter).connect(bodyGain).connect(master);
    wobble(ctx, bodyGain.gain, 0.105, 0.3, sources);
    wobble(ctx, bodyGain.gain, 0.071, 0.2, sources);
    wobble(ctx, bodyFilter.frequency, 0.105, 380, sources);
    const foam = loop(ctx, 'white');
    const foamGain = amp(ctx, 0.05);
    foam.connect(filter(ctx, 'highpass', 2400)).connect(filter(ctx, 'lowpass', 8000)).connect(foamGain).connect(master);
    wobble(ctx, foamGain.gain, 0.105, 0.045, sources);
    wobble(ctx, foamGain.gain, 0.071, 0.025, sources);
    sources.push(body, foam);
  } else if (kind === 'stream') {
    // Water over stones: two bands of hiss that gurgle at different speeds, over a low steady flow.
    const a = loop(ctx, 'white');
    const aGain = amp(ctx, 0.5);
    a.connect(filter(ctx, 'bandpass', 1300, 0.8)).connect(aGain).connect(master);
    wobble(ctx, aGain.gain, 1.7, 0.2, sources);
    wobble(ctx, aGain.gain, 0.6, 0.15, sources);
    const b = loop(ctx, 'white');
    const bGain = amp(ctx, 0.28);
    b.connect(filter(ctx, 'bandpass', 3100, 1)).connect(bGain).connect(master);
    wobble(ctx, bGain.gain, 2.9, 0.12, sources);
    wobble(ctx, bGain.gain, 1.1, 0.1, sources);
    const flow = loop(ctx, 'brown');
    flow.connect(filter(ctx, 'lowpass', 500)).connect(amp(ctx, 0.3)).connect(master);
    sources.push(a, b, flow);
  } else if (kind === 'wind') {
    const wind = loop(ctx, 'pink');
    const band = filter(ctx, 'bandpass', 520, 0.9);
    const windGain = amp(ctx, 0.85);
    wind.connect(band).connect(windGain).connect(master);
    wobble(ctx, band.frequency, 0.06, 260, sources);
    wobble(ctx, band.frequency, 0.17, 110, sources);
    wobble(ctx, windGain.gain, 0.09, 0.4, sources);
    const low = loop(ctx, 'brown');
    low.connect(filter(ctx, 'lowpass', 220)).connect(amp(ctx, 0.3)).connect(master);
    sources.push(wind, low);
  } else if (kind === 'forest') {
    // A breath of wind for the trees, and birds calling now and then from different sides.
    const wind = loop(ctx, 'pink');
    const band = filter(ctx, 'bandpass', 420, 0.8);
    const windGain = amp(ctx, 0.5);
    wind.connect(band).connect(windGain).connect(master);
    wobble(ctx, band.frequency, 0.05, 160, sources);
    wobble(ctx, windGain.gain, 0.08, 0.2, sources);
    sources.push(wind);
    let nextCall = ctx.currentTime + rand(1, 3);
    cleanups.push(
      scheduleAhead(ctx, (from, to) => {
        while (nextCall < to) {
          const t = Math.max(nextCall, from);
          const side = rand(-0.8, 0.8);
          const pick = Math.random();
          if (pick < 0.4) {
            // A trill: a quick run of tiny rising chirps.
            const f = rand(3000, 4000);
            const n = 5 + Math.floor(Math.random() * 5);
            for (let i = 0; i < n; i++) chirp(ctx, master, t + i * 0.07, f * (1 + i * 0.02), f * (1.12 + i * 0.02), 0.045, 0.1, side);
          } else if (pick < 0.75) {
            // A two-note whistle sliding down.
            const f = rand(1900, 2700);
            chirp(ctx, master, t, f * 1.1, f * 0.9, 0.3, 0.12, side);
            chirp(ctx, master, t + 0.42, f * 0.95, f * 0.75, 0.34, 0.1, side);
          } else {
            // A few short tweets.
            const f = rand(2800, 4200);
            const n = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < n; i++) chirp(ctx, master, t + i * 0.2, f, f * rand(0.8, 1.25), rand(0.07, 0.13), 0.12, side);
          }
          nextCall += Math.random() < 0.25 ? rand(0.6, 1.4) : rand(2.5, 8);
        }
      }),
    );
  } else if (kind === 'fire') {
    // A low roar, plus pops and snaps of every size at random.
    const roar = loop(ctx, 'brown');
    const roarGain = amp(ctx, 0.5);
    roar.connect(filter(ctx, 'lowpass', 420)).connect(roarGain).connect(master);
    wobble(ctx, roarGain.gain, 0.31, 0.1, sources);
    wobble(ctx, roarGain.gain, 0.13, 0.08, sources);
    const hush = loop(ctx, 'pink');
    hush.connect(filter(ctx, 'bandpass', 1800, 0.5)).connect(amp(ctx, 0.05)).connect(master);
    sources.push(roar, hush);
    let nextPop = ctx.currentTime + 0.2;
    cleanups.push(
      scheduleAhead(ctx, (from, to) => {
        while (nextPop < to) {
          const t = Math.max(nextPop, from);
          const dur = rand(0.004, 0.03);
          const src = ctx.createBufferSource();
          const buf = noise(ctx, 'white');
          src.buffer = buf;
          const bp = filter(ctx, 'bandpass', rand(700, 5000), 1.5);
          const g = amp(ctx, 0.08 + Math.pow(Math.random(), 3) * 0.6);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
          src.connect(bp).connect(g).connect(master);
          src.start(t, Math.random() * (buf.duration - 0.1), dur + 0.01);
          // Pops come in little bursts with gaps in between.
          nextPop += -Math.log(1 - Math.random()) * (Math.random() < 0.2 ? 0.45 : 0.1);
        }
      }),
    );
  } else {
    // Summer night: still air, and crickets chirping in little groups of three pulses, each at its own pitch and pace.
    const air = loop(ctx, 'brown');
    const airGain = amp(ctx, 0.22);
    air.connect(filter(ctx, 'lowpass', 600)).connect(airGain).connect(master);
    wobble(ctx, airGain.gain, 0.07, 0.07, sources);
    sources.push(air);
    const crickets = [4300, 4560, 4800, 4120].map((hz, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      const g = amp(ctx, 0);
      g.gain.value = 0.0001;
      o.connect(g);
      const p = pan(ctx, [-0.7, 0.35, 0.8, -0.2][i]);
      const out = filter(ctx, 'lowpass', 6200);
      if (p) g.connect(p).connect(out);
      else g.connect(out);
      out.connect(master);
      o.start();
      sources.push(o);
      return { g, next: ctx.currentTime + rand(0.2, 1.2), period: rand(0.85, 1.3) };
    });
    cleanups.push(
      scheduleAhead(ctx, (from, to) => {
        for (const c of crickets) {
          while (c.next < to) {
            const t = Math.max(c.next, from);
            for (let i = 0; i < 3; i++) {
              const tt = t + i * 0.075;
              c.g.gain.setValueAtTime(0.0001, tt);
              c.g.gain.linearRampToValueAtTime(0.045, tt + 0.01);
              c.g.gain.linearRampToValueAtTime(0.0001, tt + 0.045);
            }
            c.next += c.period * rand(0.92, 1.1);
          }
        }
      }),
    );
  }

  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(level, now + FADE_IN);

  return {
    kind,
    master,
    stop: () => {
      cleanups.forEach((c) => c());
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + FADE_OUT);
      } catch {
        /* already stopped */
      }
      window.setTimeout(() => {
        sources.forEach((s) => {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
        });
        master.disconnect();
      }, FADE_OUT * 1000 + 80);
    },
  };
}

export type AmbientStart = 'playing' | 'blocked' | 'unsupported';

/** Wakes the audio context after a tap. Resolves true once sound is allowed. */
export async function resumeAudio(): Promise<boolean> {
  primeAudio();
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    await ctx.resume();
  } catch {
    /* still blocked */
  }
  return (ctx.state as AudioContextState) === 'running';
}

/**
 * Starts (or switches to) a sound. If the browser still wants a tap first the sound is lined up anyway and begins the moment
 * audio is allowed; the result is then 'blocked' so the caller can listen for that tap.
 */
export function startAmbient(kind: AmbientSound, volume: number): AmbientStart {
  if (kind === 'off') {
    stopAmbient();
    return 'playing';
  }
  primeAudio();
  const ctx = audioContext();
  if (!ctx) return 'unsupported';
  if ((ctx.state as AudioContextState) !== 'running') void ctx.resume().catch(() => undefined);
  clearPreviewTimer();
  if (playing?.kind === kind) setAmbientVolume(volume);
  else {
    stopAmbient();
    playing = buildAmbient(ctx, kind, volume);
  }
  return (ctx.state as AudioContextState) === 'running' ? 'playing' : 'blocked';
}

export function setAmbientVolume(volume: number) {
  const ctx = audioContext();
  if (!ctx || !playing) return;
  const t = ctx.currentTime;
  playing.master.gain.cancelScheduledValues(t);
  playing.master.gain.setValueAtTime(Math.max(playing.master.gain.value, 0.0001), t);
  playing.master.gain.linearRampToValueAtTime(gainFor(volume, playing.kind), t + 0.15);
}

export function stopAmbient() {
  clearPreviewTimer();
  if (!playing) return;
  playing.stop();
  playing = null;
}

function clearPreviewTimer() {
  if (preview) window.clearTimeout(preview.timer);
  preview = null;
}

export const isAmbientPlaying = () => playing != null;
export const isAmbientPreviewing = () => preview != null;

/**
 * Plays a sound for a few seconds so it can be tried out (Settings, before a session). Call it from a tap.
 * Ends by itself, and a running session's own sound takes over if one starts.
 */
export function previewAmbient(kind: AmbientSound, volume: number, seconds = 12, onEnd?: () => void): AmbientStart {
  if (kind === 'off') {
    stopAmbient();
    return 'playing';
  }
  const result = startAmbient(kind, volume);
  if (result === 'unsupported') return result;
  clearPreviewTimer();
  preview = {
    timer: window.setTimeout(() => {
      preview = null;
      stopAmbient();
      onEnd?.();
    }, seconds * 1000),
  };
  return result;
}

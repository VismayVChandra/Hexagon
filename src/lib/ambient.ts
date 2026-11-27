import type { AmbientSound } from '../types';
import { audioContext, primeAudio } from '../hooks/hooks';

/**
 * Background sound for studying, generated on the device with the Web Audio API: no audio files, so it works offline
 * and adds nothing to the download. One sound plays at a time and fades in and out.
 */

export const AMBIENT_SOUNDS: { id: AmbientSound; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'Silence' },
  { id: 'rain', label: 'Rain', blurb: 'Steady rain on a window' },
  { id: 'brown', label: 'Brown noise', blurb: 'A deep, even hush' },
  { id: 'waves', label: 'Waves', blurb: 'Slow waves rolling in' },
];

const FADE_IN = 1.4;
const FADE_OUT = 0.6;

interface Playing {
  kind: Exclude<AmbientSound, 'off'>;
  master: GainNode;
  stop: () => void;
}

let playing: Playing | null = null;
let buffers: { white?: AudioBuffer; brown?: AudioBuffer } = {};
let buffersFor: AudioContext | null = null;

/** Four seconds of looping noise. Brown noise leans toward low rumble, which is easy on the ears. */
function noise(ctx: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  if (buffersFor !== ctx) {
    buffers = {};
    buffersFor = ctx;
  }
  const cached = buffers[kind];
  if (cached) return cached;
  const length = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = w * 0.5;
    else {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  // Make the loop seamless: fade the last few milliseconds into the start.
  const x = Math.floor(ctx.sampleRate * 0.02);
  for (let i = 0; i < x; i++) {
    const t = i / x;
    data[length - x + i] = data[length - x + i] * (1 - t) + data[i] * t;
  }
  buffers[kind] = buf;
  return buf;
}

function loop(ctx: AudioContext, kind: 'white' | 'brown'): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, kind);
  src.loop = true;
  return src;
}

/** How loud a sound should be at a given 0..1 setting. Kept gentle: the top of the slider is still not loud. */
export function gainFor(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return 0.04 + v * v * 0.5;
}

function build(ctx: AudioContext, kind: Exclude<AmbientSound, 'off'>, volume: number): Playing {
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);
  const sources: AudioScheduledSourceNode[] = [];
  const level = gainFor(volume);

  if (kind === 'brown') {
    const src = loop(ctx, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    src.connect(lp).connect(master);
    sources.push(src);
  } else if (kind === 'rain') {
    // Hiss for the drops, a little low rumble underneath, and a slow flutter so it isn't a flat wall of sound.
    const hiss = loop(ctx, 'white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7200;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.12;
    lfo.connect(lfoDepth).connect(hissGain.gain);
    hiss.connect(hp).connect(lp).connect(hissGain).connect(master);
    const rumble = loop(ctx, 'brown');
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.35;
    rumble.connect(rumbleGain).connect(master);
    sources.push(hiss, rumble, lfo);
  } else {
    // Waves: filtered brown noise whose loudness swells and ebbs about every nine seconds.
    const src = loop(ctx, 'brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const swell = ctx.createGain();
    swell.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(swell.gain);
    src.connect(lp).connect(swell).connect(master);
    sources.push(src, lfo);
  }

  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(level, now + FADE_IN);
  sources.forEach((s) => s.start());

  return {
    kind,
    master,
    stop: () => {
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
  if (playing?.kind === kind) setAmbientVolume(volume);
  else {
    stopAmbient();
    playing = build(ctx, kind, volume);
  }
  return (ctx.state as AudioContextState) === 'running' ? 'playing' : 'blocked';
}

export function setAmbientVolume(volume: number) {
  const ctx = audioContext();
  if (!ctx || !playing) return;
  const t = ctx.currentTime;
  playing.master.gain.cancelScheduledValues(t);
  playing.master.gain.setValueAtTime(Math.max(playing.master.gain.value, 0.0001), t);
  playing.master.gain.linearRampToValueAtTime(gainFor(volume), t + 0.15);
}

export function stopAmbient() {
  if (!playing) return;
  playing.stop();
  playing = null;
}

export const isAmbientPlaying = () => playing != null;

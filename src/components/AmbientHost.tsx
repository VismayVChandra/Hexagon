import { useEffect, useRef } from 'react';
import { useStore } from '../store/store';
import { useNow } from '../hooks/hooks';
import { computeView } from '../lib/timer';
import { resumeAudio, setAmbientVolume, startAmbient, stopAmbient } from '../lib/ambient';

/**
 * Plays the chosen background sound while a session is running, wherever the student is in the app, and hushes it during
 * Pomodoro breaks and pauses. Lives in the app shell so the sound doesn't cut out when they leave the Session page.
 */
export function AmbientHost() {
  const { data } = useStore();
  const { ambient, ambientVolume } = data.settings;
  const active = data.active;
  const running = !!active && active.resumedAt != null;
  const now = useNow(running && active?.config.mode === 'pomodoro', 1000);
  const onBreak = running && active ? computeView(active, now).phase === 'break' : false;
  const want = ambient !== 'off' && running && !onBreak;

  const volume = useRef(ambientVolume);
  useEffect(() => {
    volume.current = ambientVolume;
    setAmbientVolume(ambientVolume);
  }, [ambientVolume]);

  useEffect(() => {
    if (!want) {
      stopAmbient();
      return;
    }
    let done = false;
    const off = () => {
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
    };
    function retry() {
      void resumeAudio().then((ok) => {
        if (ok && !done) off();
      });
    }
    // Browsers only allow sound after a tap. If the app was just reopened, the sound is lined up and starts on the first one.
    if (startAmbient(ambient, volume.current) === 'blocked') {
      window.addEventListener('pointerdown', retry);
      window.addEventListener('keydown', retry);
    }
    return () => {
      done = true;
      off();
      stopAmbient();
    };
  }, [want, ambient]);

  return null;
}

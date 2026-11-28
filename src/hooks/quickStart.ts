import { useNavigate } from 'react-router-dom';
import { discardSession, getState, startSession, useStore } from '../store/store';
import { haptic, primeAudio, showToast } from './hooks';
import { carById } from '../data/cars';
import { describeConfig, setupFor } from '../lib/setup';
import type { SetupMemory, Subject } from '../types';

/** The setup a subject would start with right now: what it was last studied with, minus a car that is already in the garage. */
export function useSetupFor() {
  const { data } = useStore();
  const collected = new Set(data.garage.map((g) => g.carId));
  return (subjectId: string): SetupMemory => setupFor(data.settings.lastSetups, subjectId, data.settings.scene, (id) => !!carById(id) && !collected.has(id));
}

/**
 * One tap to start a subject the way it was last studied. Shows a 5 second "Change" toast
 * that undoes the start and opens the setup sheet instead.
 */
export function useQuickStart() {
  const { data } = useStore();
  const navigate = useNavigate();
  const setupOf = useSetupFor();

  return (subject: Subject) => {
    primeAudio();
    haptic('press', data.settings.haptics);
    const setup = setupOf(subject.id);
    const r = startSession({ subjectId: subject.id, topic: '', goal: '', config: setup.config, scene: setup.scene, carId: setup.carId, friendIds: [] });
    if (!r.ok) {
      showToast(r.error, 'error');
      return;
    }
    navigate('/session');
    const startedId = r.value.id;
    showToast(`Started ${subject.name} · ${describeConfig(setup.config)}`, 'info', {
      ms: 5000,
      action: {
        label: 'Change',
        onClick: () => {
          if (getState().data.active?.id === startedId) discardSession();
          navigate(`/study?subject=${encodeURIComponent(subject.id)}`, { replace: true });
        },
      },
    });
  };
}

import { updateSettings, useStore } from '../store/store';
import { SKINS } from '../lib/skins';
import { Icon } from './Icon';

/** Choose the look of the app. Applies straight away. Used in the welcome flow and in Settings. */
export function SkinPicker({ labelledBy }: { labelledBy: string }) {
  const { data } = useStore();
  const skin = data.settings.skin;
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="skin-grid">
      {SKINS.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={skin === s.id} className={`skin-card${skin === s.id ? ' is-on' : ''}`} onClick={() => updateSettings({ skin: s.id })}>
          <span className={`skin-preview skin-preview-${s.id}`} aria-hidden="true">
            <i className="sp-band" />
            <i className="sp-card" />
            <i className="sp-btn" />
          </span>
          <span className="skin-name">
            {s.label}
            {skin === s.id && <Icon name="check" size={16} />}
          </span>
          <span className="muted small">{s.blurb}</span>
        </button>
      ))}
    </div>
  );
}

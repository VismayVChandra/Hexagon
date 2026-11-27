import { Link } from 'react-router-dom';
import { cloudConfigured } from '../cloud/config';
import { useCloud } from '../cloud/cloud';
import { updateSettings, useStore } from '../store/store';
import { Icon } from './Icon';

/** Shown only to the app's owner: a way into the dashboard. */
export function AdminLink() {
  const cloud = useCloud();
  if (!cloudConfigured || !cloud.isAdmin) return null;
  return (
    <section className="card admin-card" aria-labelledby="admin-link-h">
      <div className="card-head">
        <h2 id="admin-link-h" className="card-title">
          Admin dashboard
        </h2>
        <span className="badge">Owner only</span>
      </div>
      <p className="muted">See how people really use Hexagon: visitors, sign-ups, who started studying and who made friends.</p>
      <Link to="/admin" className="btn btn-secondary">
        <Icon name="chart" size={18} /> Open dashboard
      </Link>
    </section>
  );
}

/** A one-time, plain-words note that anonymous usage counts exist, with a way to switch them off. */
export function UsageNotice() {
  const { data } = useStore();
  const { analytics, analyticsNoticeDismissed } = data.settings;
  if (!cloudConfigured || !analytics || analyticsNoticeDismissed) return null;
  return (
    <section className="card usage-card" aria-labelledby="usage-h">
      <div className="card-head">
        <h2 id="usage-h" className="card-title">
          Anonymous usage counts
        </h2>
        <button type="button" className="icon-btn" aria-label="Dismiss this note" onClick={() => updateSettings({ analyticsNoticeDismissed: true })}>
          <Icon name="x" />
        </button>
      </div>
      <p className="muted">
        Hexagon counts simple things, like how many people open the app or start a session, so its maker can see what’s working. These counts never include your name, subjects, topics or anything you write.
      </p>
      <div className="row">
        <Link to="/settings#privacy" className="link-btn" onClick={() => updateSettings({ analyticsNoticeDismissed: true })}>
          Turn it off in Settings
        </Link>
        <button type="button" className="btn btn-quiet" onClick={() => updateSettings({ analyticsNoticeDismissed: true })}>
          Got it
        </button>
      </div>
    </section>
  );
}

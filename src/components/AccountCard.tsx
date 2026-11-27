import { useState } from 'react';
import { Link } from 'react-router-dom';
import { updateSettings, useStore } from '../store/store';
import { showToast, useNow } from '../hooks/hooks';
import { cloudConfigured } from '../cloud/config';
import { deleteSyncedCopy, setCloudSync, signOut, useCloud } from '../cloud/cloud';
import { requestSync, useDataSync, type DataSyncState } from '../cloud/dataSync';
import { CloudSignIn } from './CloudSignIn';
import { ConfirmDialog } from './Dialog';
import { Toggle } from './bits';

/** "Synced just now", "Synced 5 minutes ago". */
export function syncedAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 20) return 'Synced just now';
  if (s < 90) return 'Synced a minute ago';
  const m = Math.round(s / 60);
  if (m < 60) return `Synced ${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `Synced ${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.round(h / 24);
  return `Synced ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

export function statusLine(sync: DataSyncState, enabled: boolean, now: number): { text: string; tone: 'ok' | 'warn' | 'plain' } {
  if (!enabled) return { text: 'Syncing is off. Your data stays on this device only.', tone: 'plain' };
  switch (sync.status) {
    case 'syncing':
      return { text: 'Syncing…', tone: 'plain' };
    case 'ok':
      return { text: sync.lastSyncAt ? syncedAgo(sync.lastSyncAt, now) : 'Synced', tone: 'ok' };
    case 'offline':
    case 'error':
    case 'needs-setup':
      return { text: sync.message ?? 'Couldn’t sync just now.', tone: 'warn' };
    default:
      return { text: 'Getting ready…', tone: 'plain' };
  }
}

/** Settings → Account: sign in once and your study history follows you to every device. */
export function AccountSettings() {
  const cloud = useCloud();
  const { data } = useStore();
  const sync = useDataSync();
  const now = useNow(true, 15_000);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!cloudConfigured) return null;
  const live = cloud.phase === 'signed-in';
  const enabled = data.settings.cloudSync;
  const line = statusLine(sync, enabled, now);

  return (
    <section className="card" id="account" aria-labelledby="account-h" tabIndex={-1}>
      <h2 id="account-h" className="card-title">
        Account
      </h2>
      {live ? (
        <>
          <p className="muted small">
            Signed in as <strong>{cloud.email}</strong>. Sign in with the same email and password on any phone or laptop and your study history, honey, cars and goals are there too.
          </p>
          <Toggle id="s-sync" checked={enabled} onChange={setCloudSync} label="Keep my study data in my account" description="Sessions, subjects, exams, cars and goals, copied to your account a moment after you change them, so every device shows the same thing. Your notes are included. Turn off to keep everything on this device only." />
          <p className={`sync-status${line.tone === 'warn' ? ' is-warn' : line.tone === 'ok' ? ' is-ok' : ''}`} role="status">
            {line.text}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!enabled || sync.status === 'syncing'}
              onClick={() => {
                void requestSync();
              }}
            >
              Sync now
            </button>
            <button type="button" className="btn btn-secondary" disabled={cloud.busy} onClick={() => void signOut()}>
              Sign out
            </button>
            {enabled && (
              <button type="button" className="btn btn-quiet btn-danger-text" onClick={() => setConfirmDelete(true)}>
                Delete my cloud copy
              </button>
            )}
          </div>
          <p className="hint">Signing out keeps this device’s data until a different account signs in here. Your friends and code come back whenever you sign in.</p>
        </>
      ) : (
        <>
          {cloud.phase === 'signed-out' && <p className="muted small">Create a free account, or sign in, to keep your study history safe and open it on your phone, laptop or anywhere else. It also gives you a code for real friends.</p>}
          <CloudSignIn />
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete your cloud copy?"
        message="This removes your study history from your account and turns syncing off on this device. Everything on this device stays. Other devices keep their own copies until you sign in there and turn syncing off too."
        confirmLabel={busy ? 'Deleting…' : 'Delete cloud copy'}
        danger
        onConfirm={() => {
          setBusy(true);
          setConfirmDelete(false);
          void deleteSyncedCopy().then((r) => {
            setBusy(false);
            showToast(r.ok ? 'Cloud copy deleted. Syncing is off.' : r.error, r.ok ? 'info' : 'error');
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}

/** One-time card on Home for people who have studied but have no account: the reason to make one. */
export function AccountPrompt() {
  const { data } = useStore();
  const cloud = useCloud();
  const s = data.settings;
  const hasStudied = data.sessions.some((x) => !x.demo);
  if (!cloudConfigured || cloud.phase === 'signed-in' || cloud.phase === 'starting' || s.accountPromptDismissed || !hasStudied || data.active) return null;
  return (
    <section className="card prompt-card" aria-labelledby="ap-h">
      <h2 id="ap-h" className="card-title">
        Keep your hive safe
      </h2>
      <p className="muted small">Your sessions, honey and cars live only in this browser right now. Clearing it, or opening Hexagon on another phone or laptop, starts you from zero. A free account backs it all up and brings it with you.</p>
      <div className="row">
        <Link to="/settings#account" className="btn btn-primary">
          Create an account
        </Link>
        <button type="button" className="btn btn-quiet" onClick={() => updateSettings({ accountPromptDismissed: true })}>
          Not now
        </button>
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addFriend, removeFriend, useStore, validateFriendName } from '../store/store';
import { ROOMS } from '../data/friendsSim';
import { showToast, useNow } from '../hooks/hooks';
import { addFriendByCode, regenerateCode, removeFriendship, setPendingInvite, useCloud } from '../cloud/cloud';
import { cloudConfigured } from '../cloud/config';
import { formatFriendCode, normalizeFriendCode } from '../cloud/presence';
import { useFriendRows } from '../cloud/useFriendRows';
import { formatDuration } from '../lib/time';
import { CloudSignIn } from '../components/CloudSignIn';
import { DemoBadge, EmptyState, Field, FriendAvatar, StateBadge } from '../components/bits';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';

export default function Friends() {
  const { data } = useStore();
  const cloud = useCloud();
  const now = useNow(true, 20_000);
  const { live, rows } = useFriendRows(now);
  const { settings, active } = data;
  const [params, setParams] = useSearchParams();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  // An invite link looks like #/friends?code=ABCD2345. Keep the code until the person is signed in.
  const inviteParam = params.get('code');
  useEffect(() => {
    if (!inviteParam) return;
    const c = normalizeFriendCode(inviteParam);
    if (c && cloudConfigured) setPendingInvite(c);
    setParams({}, { replace: true });
  }, [inviteParam, setParams]);

  useEffect(() => {
    if (live && cloud.pendingInvite) {
      setCode(formatFriendCode(cloud.pendingInvite));
      setError(undefined);
      setAdding(true);
      setPendingInvite(null);
    }
  }, [live, cloud.pendingInvite]);

  const removingRow = rows.find((r) => r.removeId === removing);
  const closeAdd = () => {
    setAdding(false);
    setError(undefined);
  };

  function submitDemo(e: React.FormEvent) {
    e.preventDefault();
    const err = validateFriendName(name, data.friends);
    if (err) return setError(err);
    const r = addFriend(name);
    if (r.ok) {
      showToast(`${r.value.name} added as a simulated study buddy.`);
      setName('');
      closeAdd();
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await addFriendByCode(code);
    setBusy(false);
    if (r.ok) {
      showToast(r.message ?? 'Done.');
      setCode('');
      closeAdd();
    } else setError(r.error);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copied.`);
    } catch {
      showToast('Couldn’t copy. Select it and copy by hand.', 'error');
    }
  }

  async function shareInvite() {
    const c = cloud.profile?.friendCode;
    if (!c) return;
    const url = `${location.origin}${location.pathname}#/friends?code=${c}`;
    const text = `Add me on Hexagon! My friend code is ${formatFriendCode(c)}. Type it in under Friends.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Study with me on Hexagon', text, url });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    await copy(url, 'Invite link');
  }

  async function confirmRemove() {
    const id = removing;
    setRemoving(null);
    if (!id) return;
    if (live) {
      const r = await removeFriendship(id);
      if (!r.ok) showToast(r.error, 'error');
    } else removeFriend(id);
  }

  return (
    <div className="page">
      <header className="page-head row row-split">
        <div>
          <h1 className="page-title">Friends</h1>
          <p className="page-sub">See who’s focusing. No feeds, no messages, no rankings.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Add friend
        </button>
      </header>

      {!live && (
        <div className="banner banner-info" role="note">
          <Icon name="info" />
          <p>
            <strong>Demo mode.</strong> The friends and rooms below are simulated on this device from the clock. Nobody is actually connected, and nothing you do is shared.
            {cloudConfigured ? ' Turn on friends below to add real ones.' : ' Real friends need an account service, which isn’t connected to this copy of the app.'}
          </p>
        </div>
      )}

      {cloudConfigured && !live && (
        <section className="card" aria-labelledby="real-h">
          <h2 id="real-h" className="card-title">
            Add real friends
          </h2>
          <p className="muted small">Get a 6-digit code to share. When a friend types it into their app, you’re friends. No email or password. Your study data stays on your device. Friends only see your name, and your status if you turn that on.</p>
          <CloudSignIn />
        </section>
      )}

      {live && cloud.profile && (
        <section className="card code-card" aria-labelledby="code-h">
          <p className="eyebrow" id="code-h">
            Your friend code
          </p>
          <p className="friend-code" aria-label={`Your friend code is ${cloud.profile.friendCode.split('').join(' ')}`}>
            {formatFriendCode(cloud.profile.friendCode)}
          </p>
          <div className="row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(cloud.profile!.friendCode, 'Friend code')}>
              Copy code
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void shareInvite()}>
              <Icon name="share" size={16} /> Share invite
            </button>
          </div>
          <p className="hint">Give this to a friend. When they type it into their app, you’re friends. Anyone who has it can add you, so if it gets around, replace it.</p>
          <button type="button" className="link-btn" onClick={() => setReplacing(true)}>
            Replace my code
          </button>
        </section>
      )}

      <section className="card privacy-card" aria-labelledby="me-h">
        <div className="card-head">
          <h2 id="me-h" className="card-title">
            Your visibility
          </h2>
          <Link to="/settings#privacy" className="link-btn">
            Change
          </Link>
        </div>
        <p>
          <Icon name="lock" size={16} className="inline-icon" />{' '}
          {settings.sharePresence
            ? settings.shareSubject
              ? `${live ? 'Friends you’ve accepted' : 'Friends in demo rooms'} see when you’re studying, and the subject.`
              : `${live ? 'Friends you’ve accepted' : 'Friends in demo rooms'} see when you’re studying, but not the subject.`
            : 'Private. When you study, nobody sees it.'}
        </p>
      </section>

      <section className="card" aria-labelledby="list-h">
        <div className="card-head">
          <h2 id="list-h" className="card-title">
            Study buddies
          </h2>
          {rows.length > 0 && !live && <DemoBadge>Simulated</DemoBadge>}
        </div>
        {live && <p className="hint">{cloud.syncError ? 'Offline. Showing the last update we got.' : 'Updates about every 20 seconds while the app is open.'}</p>}
        {rows.length === 0 ? (
          <EmptyState
            title="No friends yet"
            body={live ? 'Share your code, or type a friend’s code, to see when they’re studying.' : 'Add a friend to try the experience. In this version they’re simulated.'}
            action={
              <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
                Add a friend
              </button>
            }
          />
        ) : (
          <ul className="friend-list">
            {rows.map((r) => (
              <li key={r.removeId}>
                <FriendAvatar friend={r} state={r.state} size={44} />
                <div className="friend-main">
                  <p className="item-title">{r.name}</p>
                  <p className="muted small">
                    {r.state === 'studying' && (
                      <>
                        {r.subject ?? 'Subject private'} · {formatDuration(r.sessionMs)} so far
                      </>
                    )}
                    {r.state === 'finished' && (
                      <>
                        Studied {formatDuration(r.sessionMs)}
                        {r.subject ? ` · ${r.subject}` : ''}
                      </>
                    )}
                    {r.state === 'online' && 'Around, not studying'}
                    {r.state === 'offline' && (live ? 'Offline or not sharing' : 'Offline')}
                  </p>
                </div>
                <StateBadge state={r.state} />
                <button type="button" className="icon-btn" aria-label={`Remove ${r.name}`} onClick={() => setRemoving(r.removeId)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && !live && (
          <Link to="/study" className="btn btn-quiet btn-block">
            <Icon name="users" size={18} /> Start a session with friends
          </Link>
        )}
      </section>

      <section aria-labelledby="rooms-h" className="stack">
        <div className="row row-split">
          <h2 id="rooms-h" className="section-title">
            Shared focus rooms
          </h2>
          {!live && <DemoBadge>Simulated</DemoBadge>}
        </div>
        <div className="grid-cards">
          {ROOMS.map((r) => {
            const here = rows.filter((x) => x.state === 'studying' && x.roomId === r.id);
            const youHere = active?.roomId === r.id && settings.sharePresence;
            return (
              <article key={r.id} className="card room-card" aria-labelledby={`room-${r.id}`}>
                <h3 id={`room-${r.id}`} className="card-title">
                  {r.name}
                </h3>
                <p className="muted">{r.blurb}</p>
                <div className="room-people" aria-label="People in this room">
                  {here.length === 0 && !youHere ? (
                    <span className="muted small">Empty right now</span>
                  ) : (
                    <>
                      <ul className="avatar-stack">
                        {here.map((x) => (
                          <li key={x.removeId} title={x.name}>
                            <FriendAvatar friend={x} state={x.state} size={32} />
                          </li>
                        ))}
                      </ul>
                      <span className="muted small">
                        {here.map((x) => x.name).join(', ')}
                        {youHere ? `${here.length ? ' and ' : ''}you` : ''}
                      </span>
                    </>
                  )}
                </div>
                {active ? (
                  <Link to="/session" className="btn btn-secondary">
                    {active.roomId === r.id ? 'You’re in this room — return' : 'Finish your current session first'}
                  </Link>
                ) : (
                  <Link to={`/study?room=${r.id}`} className="btn btn-primary">
                    Join room
                  </Link>
                )}
              </article>
            );
          })}
        </div>
        <p className="hint">{live ? 'Rooms are quiet: you only see which of your friends are focusing in each one, and only if they share their status.' : 'Rooms are quiet: you can see who’s focusing, nothing more.'}</p>
      </section>

      <Dialog open={adding} onClose={closeAdd} title="Add a friend">
        {live ? (
          <form onSubmit={submitCode} noValidate className="stack">
            <p className="muted small">Ask your friend for their 6-digit code (it’s at the top of their Friends page) and type it here. You’ll be friends straight away.</p>
            <Field label="Friend code" htmlFor="friend-code" error={error}>
              <input id="friend-code" value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} inputMode="numeric" placeholder="482 913" aria-invalid={!!error} onChange={(e) => setCode(e.target.value)} data-autofocus />
            </Field>
            <div className="dialog-actions">
              <button type="button" className="btn btn-quiet" onClick={closeAdd}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Adding…' : 'Add friend'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitDemo} noValidate className="stack">
            <p className="muted small">
              {cloudConfigured ? 'Friends isn’t turned on yet, so this adds a ' : 'Hexagon can’t connect to real accounts yet, so this adds a '}
              <strong>simulated</strong> study buddy to try the flow. They aren’t a real person and aren’t notified.
            </p>
            <Field label="Friend’s name" htmlFor="friend-name" error={error}>
              <input id="friend-name" value={name} autoComplete="off" maxLength={40} aria-invalid={!!error} onChange={(e) => setName(e.target.value)} data-autofocus />
            </Field>
            <div className="dialog-actions">
              <button type="button" className="btn btn-quiet" onClick={closeAdd}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Add friend
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={replacing}
        title="Replace your friend code?"
        message="Your current code stops working straight away, so anyone who hasn’t used it yet will need the new one. Your existing friends stay friends."
        confirmLabel="Replace code"
        onConfirm={async () => {
          setReplacing(false);
          const r = await regenerateCode();
          showToast(r.ok ? (r.message ?? 'New code ready.') : r.error, r.ok ? 'success' : 'error');
        }}
        onCancel={() => setReplacing(false)}
      />

      <ConfirmDialog
        open={!!removingRow}
        title={`Remove ${removingRow?.name ?? 'friend'}?`}
        message={live ? 'You’ll stop seeing each other’s status. They aren’t notified, and either of you can add the other again with a code.' : 'They’ll disappear from your list and from rooms.'}
        confirmLabel="Remove"
        danger
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addFriend, removeFriend, useStore, validateFriendName } from '../store/store';
import { ROOMS, friendPresence, roomOf } from '../data/friendsSim';
import { showToast, useNow } from '../hooks/hooks';
import { formatDuration } from '../lib/time';
import { DemoBadge, EmptyState, Field, FriendAvatar, StateBadge } from '../components/bits';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import type { FriendState } from '../types';

const ORDER: Record<FriendState, number> = { studying: 0, finished: 1, online: 2, offline: 3 };

export default function Friends() {
  const { data } = useStore();
  const now = useNow(true, 20_000);
  const { friends, settings, active } = data;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [removing, setRemoving] = useState<string | null>(null);

  const rows = useMemo(
    () => friends.map((f) => ({ f, p: friendPresence(f, now) })).sort((a, b) => ORDER[a.p.state] - ORDER[b.p.state] || a.f.name.localeCompare(b.f.name)),
    [friends, now],
  );
  const removingFriend = friends.find((f) => f.id === removing);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateFriendName(name, friends);
    if (err) return setError(err);
    const r = addFriend(name);
    if (r.ok) {
      showToast(`${r.value.name} added as a simulated study buddy.`);
      setName('');
      setError(undefined);
      setAdding(false);
    }
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

      <div className="banner banner-info" role="note">
        <Icon name="info" />
        <p>
          <strong>Demo mode.</strong> Friends and rooms are simulated on this device from the clock. Nobody is actually connected, and nothing you do is shared. Real friends across devices need an account service, which isn’t part of this version.
        </p>
      </div>

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
          {settings.sharePresence ? (settings.shareSubject ? 'Friends in demo rooms see when you’re studying, and the subject.' : 'Friends in demo rooms see when you’re studying, but not the subject.') : 'Private. When you study, nobody sees it.'}
        </p>
      </section>

      <section className="card" aria-labelledby="list-h">
        <div className="card-head">
          <h2 id="list-h" className="card-title">
            Study buddies
          </h2>
          {rows.length > 0 && <DemoBadge>Simulated</DemoBadge>}
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No friends yet" body="Add a friend to try the experience. In this version they’re simulated." action={<button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>Add a friend</button>} />
        ) : (
          <ul className="friend-list">
            {rows.map(({ f, p }) => (
              <li key={f.id}>
                <FriendAvatar friend={f} state={p.state} size={44} />
                <div className="friend-main">
                  <p className="item-title">{f.name}</p>
                  <p className="muted small">
                    {p.state === 'studying' && (
                      <>
                        {p.subject ? p.subject : 'Subject private'} · {formatDuration(p.sessionMs)} so far
                      </>
                    )}
                    {p.state === 'finished' && <>Studied {formatDuration(p.sessionMs)}{p.subject ? ` · ${p.subject}` : ''}</>}
                    {p.state === 'online' && 'Around, not studying'}
                    {p.state === 'offline' && 'Offline'}
                  </p>
                </div>
                <StateBadge state={p.state} />
                <button type="button" className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => setRemoving(f.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
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
          <DemoBadge>Simulated</DemoBadge>
        </div>
        <div className="grid-cards">
          {ROOMS.map((r) => {
            const here = rows.filter(({ f, p }) => p.state === 'studying' && roomOf(f) === r.id);
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
                        {here.map(({ f, p }) => (
                          <li key={f.id} title={f.name}>
                            <FriendAvatar friend={f} state={p.state} size={32} />
                          </li>
                        ))}
                      </ul>
                      <span className="muted small">
                        {here.map(({ f }) => f.name).join(', ')}
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
        <p className="hint">Rooms are quiet: you can see who’s focusing, nothing more.</p>
      </section>

      <Dialog open={adding} onClose={() => { setAdding(false); setError(undefined); }} title="Add a friend">
        <form onSubmit={submit} noValidate className="stack">
          <p className="muted small">
            Hexagon can’t connect to real accounts yet, so this adds a <strong>simulated</strong> study buddy to try the flow. They aren’t a real person and aren’t notified.
          </p>
          <Field label="Friend’s name" htmlFor="friend-name" error={error}>
            <input id="friend-name" value={name} autoComplete="off" maxLength={40} aria-invalid={!!error} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="dialog-actions">
            <button type="button" className="btn btn-quiet" onClick={() => { setAdding(false); setError(undefined); }}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add friend
            </button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!removingFriend}
        title={`Remove ${removingFriend?.name ?? 'friend'}?`}
        message="They’ll disappear from your list and from rooms."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (removing) removeFriend(removing);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

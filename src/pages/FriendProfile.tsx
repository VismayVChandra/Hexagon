import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cheerFriend, loadFriendShowcase, setCarLike } from '../cloud/cloud';
import { useFriendRows } from '../cloud/useFriendRows';
import type { CheerKind, FriendShowcase } from '../cloud/types';
import { showToast, useNow } from '../hooks/hooks';
import { carById } from '../data/cars';
import { CELL_MS, rankFor } from '../lib/hive';
import { CHEERS, demoShowcase, miniFillFromCells } from '../lib/showcase';
import { CarPhoto } from '../components/CarPhoto';
import { DemoBadge, EmptyState, FriendAvatar } from '../components/bits';
import { HiveMini } from '../components/HiveMini';
import { Icon } from '../components/Icon';

const PREVIEW = 3;
const STATE_TEXT = { studying: 'Studying now', online: 'Around', finished: 'Finished for today', offline: 'Offline' } as const;

/** A friend's profile: their honey hive, the cars they have built (which you can like), and a one-tap cheer. */
export default function FriendProfile() {
  const { id = '' } = useParams();
  const now = useNow(true, 20_000);
  const { live, rows } = useFriendRows(now);
  const row = rows.find((r) => r.id === id);
  const [profile, setProfile] = useState<FriendShowcase | null>(null);
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [cooling, setCooling] = useState(false);
  const rowName = row?.name;

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(undefined);
    if (!rowName) return;
    if (!live) {
      setProfile(demoShowcase(id, rowName, Date.now()));
      return;
    }
    loadFriendShowcase(id)
      .then((p) => !cancelled && setProfile(p))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Couldn’t load this profile.'));
    return () => {
      cancelled = true;
    };
  }, [id, live, rowName]);

  const cars = useMemo(() => (profile?.cars ?? []).map((c) => ({ ...c, car: carById(c.id) })).filter((c) => !!c.car), [profile]);
  const shown = expanded ? cars : cars.slice(0, PREVIEW);
  const hidden = cars.length - PREVIEW;

  if (!row) {
    return (
      <div className="page">
        <section className="card">
          <EmptyState title="Friend not found" body="They may have been removed from your list." action={<Link to="/friends" className="btn btn-secondary">Back to Friends</Link>} />
        </section>
      </div>
    );
  }

  const cells = profile?.cells ?? 0;
  const { rank, next } = rankFor(cells * CELL_MS);

  async function toggleLike(carId: string, like: boolean) {
    const bump = (liked: boolean, delta: number) => setProfile((p) => (p ? { ...p, cars: p.cars.map((c) => (c.id === carId ? { ...c, liked, likes: Math.max(0, c.likes + delta) } : c)) } : p));
    bump(like, like ? 1 : -1);
    if (!live) return; // simulated friends keep likes on this screen only
    const r = await setCarLike(id, carId, like);
    if (r.ok) setProfile((p) => (p ? { ...p, cars: p.cars.map((c) => (c.id === carId ? { ...c, likes: r.likes, liked: like } : c)) } : p));
    else {
      bump(!like, like ? -1 : 1);
      showToast(r.error, 'error');
    }
  }

  async function cheer(kind: CheerKind) {
    if (cooling) return;
    setCooling(true);
    window.setTimeout(() => setCooling(false), 3000);
    const label = CHEERS.find((c) => c.id === kind);
    if (!live) return showToast(`Cheer sent to ${row!.name} (simulated).`);
    const r = await cheerFriend(id, kind);
    if (r.ok) showToast(`${label?.emoji ?? ''} Cheer sent to ${row!.name}.`.trim());
    else showToast(r.error, 'error');
  }

  return (
    <div className="page fp">
      <header className="gr-head">
        <Link to="/friends" className="icon-btn" aria-label="Back to Friends">
          <Icon name="chevron" className="flip-x" />
        </Link>
        <FriendAvatar friend={row} size={48} />
        <div>
          <h1 className="page-title">{row.name}</h1>
          <p className="page-sub fr-state">
            {row.state === 'studying' && <span className="live-dot" aria-hidden="true" />}
            {STATE_TEXT[row.state]}
          </p>
        </div>
      </header>

      {!live && (
        <p>
          <DemoBadge>Simulated friend</DemoBadge>
        </p>
      )}

      {error ? (
        <section className="card" role="alert">
          <p>{error}</p>
        </section>
      ) : !profile ? (
        <section className="card" aria-busy="true">
          <p className="muted">Loading their profile…</p>
        </section>
      ) : !profile.shared ? (
        <section className="card">
          <EmptyState title={`${profile.name} keeps their hive private`} body="You can still send a cheer." />
        </section>
      ) : (
        <>
          <section className="card fp-hive" aria-labelledby="fp-hive-h">
            <HiveMini filled={miniFillFromCells(cells)} width={170} />
            <div className="fp-hive-text">
              <p className="eyebrow" id="fp-hive-h">
                Honey hive
              </p>
              <p className="fp-cells num">
                {cells.toLocaleString()} <span className="muted">honey {cells === 1 ? 'cell' : 'cells'}</span>
              </p>
              <p className="ex-bold">{rank.name}</p>
              <p className="muted small">{next ? `${rank.blurb}` : 'At the top of the hive.'}</p>
            </div>
          </section>

          <section aria-labelledby="fp-cars-h" className="fp-cars-wrap">
            <h2 id="fp-cars-h" className="eyebrow">
              Cars built · {cars.length}
            </h2>
            {cars.length === 0 ? (
              <p className="muted">No cars yet. They’re still building their first.</p>
            ) : (
              <ul className="fp-cars">
                {shown.map(({ id: carId, car, likes, liked }) => (
                  <li key={carId} className="fp-car">
                    <CarPhoto car={car!} />
                    <div className="fp-car-row">
                      <span className="fp-car-name">
                        <small className="car-brand">{car!.brand}</small>
                        <strong>{car!.model}</strong>
                      </span>
                      <button type="button" className={`fp-like${liked ? ' on' : ''}`} aria-pressed={liked} aria-label={`${liked ? 'Unlike' : 'Like'} ${car!.name}. ${likes} ${likes === 1 ? 'like' : 'likes'}.`} onClick={() => void toggleLike(carId, !liked)}>
                        <Icon name="heart" size={18} filled={liked} />
                        <span className="num">{likes}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {hidden > 0 && (
              <button type="button" className="btn btn-secondary btn-block" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show fewer' : `See ${hidden} more ${hidden === 1 ? 'car' : 'cars'}`}
              </button>
            )}
          </section>
        </>
      )}

      <section className="card" aria-labelledby="fp-cheer-h">
        <h2 id="fp-cheer-h" className="card-title">
          Cheer {row.name} on
        </h2>
        <div className="fp-cheers" role="group" aria-label="Cheers">
          {CHEERS.map((c) => (
            <button key={c.id} type="button" className="chip" disabled={cooling} onClick={() => void cheer(c.id)}>
              <span aria-hidden="true">{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
        <p className="hint">One tap, no typing. They’ll see it the next time they open Hexagon.</p>
      </section>
    </div>
  );
}

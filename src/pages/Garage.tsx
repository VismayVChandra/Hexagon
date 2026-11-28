import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CARS, LETTERS, TIERS, buildMs, buildTimeLabel, carsInTier, carsWithLetter, type Car, type Tier } from '../data/cars';
import { Icon } from '../components/Icon';
import { useStore } from '../store/store';
import { useCloud } from '../cloud/cloud';
import { LikesBadge } from '../components/LikesBadge';
import { Bar } from '../components/bits';
import { CarArt } from '../components/CarArt';
import { CarPhoto } from '../components/CarPhoto';
import { CAR_PHOTOS } from '../data/carPhotos';
import { CAR_MODELS } from '../data/carModels';

/** Every car you can build, grouped by tier. Finished cars are in colour; the rest are outlines with their progress. */
export default function Garage() {
  const { data } = useStore();
  const owned = new Set(data.garage.map((g) => g.carId));
  const likes = useCloud().carLikes;
  const [view, setView] = useState<'tier' | 'az'>('tier');
  // Start on the tier you're working on, or the first one with cars still to build.
  const [tier, setTier] = useState<Tier['n']>(() => {
    const started = CARS.filter((c) => !owned.has(c.id) && (data.builds[c.id] ?? 0) > 0).sort((a, b) => (data.builds[b.id] ?? 0) / buildMs(b) - (data.builds[a.id] ?? 0) / buildMs(a))[0];
    return started?.tier ?? TIERS.find((t) => carsInTier(t.n).some((c) => !owned.has(c.id)))?.n ?? 1;
  });
  const [letter, setLetter] = useState<string>(LETTERS[0] ?? 'A');

  const grid = (cars: Car[], showTime: boolean) => (
    <ul className="garage-grid">
      {cars.map((car) => {
        const has = owned.has(car.id);
        const progress = has ? 1 : Math.min(1, (data.builds[car.id] ?? 0) / buildMs(car));
        return (
          <li key={car.id} className={has ? 'is-owned' : ''}>
            {has ? <CarPhoto car={car} /> : <CarArt car={car} locked label={`${car.name}, ${Math.floor(progress * 100)}% built`} />}
            {!has && progress > 0 && <Bar value={progress} label={`${car.name} build progress`} />}
            <small className="car-brand">{car.brand}</small>
            <span className="car-option-name">{car.model}</span>
            {has && (likes[car.id] ?? 0) > 0 && <LikesBadge n={likes[car.id]} />}
            <small className="muted">{has ? 'Built' : `${progress > 0 ? `${Math.floor(progress * 100)}% built` : 'Not started'}${showTime ? ` · ${buildTimeLabel(car)}` : ''}`}</small>
          </li>
        );
      })}
    </ul>
  );

  const progressOf = (car: Car) => (owned.has(car.id) ? 1 : Math.min(1, (data.builds[car.id] ?? 0) / buildMs(car)));
  // The car you're furthest into, shown first like a project on the workbench.
  const inShop = CARS.filter((c) => !owned.has(c.id) && (data.builds[c.id] ?? 0) > 0).sort((a, b) => progressOf(b) - progressOf(a))[0];
  const shopTier = inShop ? TIERS[inShop.tier - 1] : undefined;
  const cars = view === 'tier' ? carsInTier(tier) : carsWithLetter(letter);

  return (
    <div className="page">
      <header className="page-head gr-head">
        <Link to="/progress" className="icon-btn" aria-label="Back to Progress">
          <Icon name="chevron" className="flip-x" />
        </Link>
        <div>
          <h1 className="page-title">Garage</h1>
          <p className="page-sub">
            {owned.size} of {CARS.length} cars
          </p>
        </div>
      </header>

      {inShop && shopTier && (
        <section className="card gr-shop" aria-labelledby="shop-h">
          <div className="gr-shop-top">
            <h2 id="shop-h" className="eyebrow">
              In the workshop
            </h2>
            <span className="gr-shop-tag">
              Tier {shopTier.n} · {shopTier.buildMin >= 60 ? `${shopTier.buildMin / 60}h` : `${shopTier.buildMin} min`}
            </span>
          </div>
          <CarArt car={inShop} progress={progressOf(inShop)} label={`${inShop.name}, ${Math.floor(progressOf(inShop) * 100)}% built`} />
          <div className="subject-bars-top">
            <span className="gr-shop-name">{inShop.name}</span>
            <span className="num">{Math.floor(progressOf(inShop) * 100)}%</span>
          </div>
          <Bar value={progressOf(inShop)} color="var(--honey)" label={`${inShop.name} build progress`} />
        </section>
      )}

      <div role="radiogroup" aria-label="How to list cars" className="segmented segmented-sm">
        <button type="button" role="radio" aria-checked={view === 'tier'} className={`segment${view === 'tier' ? ' is-on' : ''}`} onClick={() => setView('tier')}>
          By tier
        </button>
        <button type="button" role="radio" aria-checked={view === 'az'} className={`segment${view === 'az' ? ' is-on' : ''}`} onClick={() => setView('az')}>
          A to Z
        </button>
      </div>

      {view === 'tier' ? (
        <div role="radiogroup" aria-label="Tier" className="gr-chips">
          {TIERS.map((t) => {
            const have = carsInTier(t.n).filter((c) => owned.has(c.id)).length;
            return (
              <button key={t.n} type="button" role="radio" aria-checked={tier === t.n} className={`chip${tier === t.n ? ' is-on' : ''}`} onClick={() => setTier(t.n)}>
                T{t.n} · {t.buildMin >= 60 ? `${t.buildMin / 60}h` : `${t.buildMin}m`}
                <span className="sr-only">
                  , {have} of {carsInTier(t.n).length} built
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div role="radiogroup" aria-label="Brand starts with" className="gr-chips">
          {LETTERS.map((l) => {
            const inLetter = carsWithLetter(l);
            const have = inLetter.filter((c) => owned.has(c.id)).length;
            return (
              <button key={l} type="button" role="radio" aria-checked={letter === l} className={`chip${letter === l ? ' is-on' : ''}`} onClick={() => setLetter(l)}>
                {l}
                <span className="sr-only">
                  , {have} of {inLetter.length} built
                </span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'tier' && <p className="muted small gr-blurb">{TIERS[tier - 1].blurb}</p>}
      {grid(cars, view === 'az')}

      <Link to="/study" className="btn btn-primary">
        Start a build
      </Link>

      <details className="card credits">
        <summary className="card-title">Photo credits</summary>
        <p className="muted small">
          Photos of built cars come from Wikimedia Commons and are used under their free licences. They were resized and compressed for the app. Brand and model names belong to their owners.
        </p>
        <ul>
          {CARS.map((car) => {
            const ph = CAR_PHOTOS[car.id];
            if (!ph) return null;
            return (
              <li key={car.id}>
                <strong>{car.name}</strong>: <a href={ph.page} target="_blank" rel="noreferrer noopener">photo</a> by {ph.author},{' '}
                {ph.licenseUrl ? (
                  <a href={ph.licenseUrl} target="_blank" rel="noreferrer noopener">
                    {ph.license}
                  </a>
                ) : (
                  ph.license
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted small">
          Some finished cars are shown as real 3D models (made by other people, shrunk for phones, used under CC BY 4.0):
        </p>
        <ul>
          {CARS.map((car) => {
            const m = CAR_MODELS[car.id];
            if (!m) return null;
            return (
              <li key={car.id}>
                <strong>{car.name}</strong>: “<a href={m.page} target="_blank" rel="noreferrer noopener">{m.title}</a>” by {m.author},{' '}
                <a href={m.licenseUrl} target="_blank" rel="noreferrer noopener">
                  {m.license}
                </a>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

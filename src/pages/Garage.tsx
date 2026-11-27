import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CARS, LETTERS, TIERS, buildMs, buildTimeLabel, carsInTier, carsWithLetter, type Car } from '../data/cars';
import { useStore } from '../store/store';
import { Bar } from '../components/bits';
import { CarArt } from '../components/CarArt';
import { CarPhoto } from '../components/CarPhoto';
import { CAR_PHOTOS } from '../data/carPhotos';

/** Every car you can build, grouped by tier. Finished cars are in colour; the rest are outlines with their progress. */
export default function Garage() {
  const { data } = useStore();
  const owned = new Set(data.garage.map((g) => g.carId));
  const [view, setView] = useState<'tier' | 'az'>('tier');

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
            <small className="muted">{has ? 'Built' : `${progress > 0 ? `${Math.floor(progress * 100)}% built` : 'Not started'}${showTime ? ` · ${buildTimeLabel(car)}` : ''}`}</small>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Your garage</h1>
        <p className="page-sub">
          {owned.size} of {CARS.length} built. Choose “Build a car” when you start a session, and study to fit its parts.
        </p>
      </header>

      <div role="radiogroup" aria-label="How to list cars" className="segmented segmented-sm">
        <button type="button" role="radio" aria-checked={view === 'tier'} className={`segment${view === 'tier' ? ' is-on' : ''}`} onClick={() => setView('tier')}>
          By tier
        </button>
        <button type="button" role="radio" aria-checked={view === 'az'} className={`segment${view === 'az' ? ' is-on' : ''}`} onClick={() => setView('az')}>
          A to Z
        </button>
      </div>

      {view === 'az' &&
        LETTERS.map((l) => {
          const cars = carsWithLetter(l);
          const have = cars.filter((c) => owned.has(c.id)).length;
          return (
            <section key={l} className="card" aria-labelledby={`letter-${l}`}>
              <div className="card-head">
                <h2 id={`letter-${l}`} className="card-title">
                  {l}
                </h2>
                <span className="muted small">
                  {have} of {cars.length}
                </span>
              </div>
              {grid(cars, true)}
            </section>
          );
        })}

      {view === 'tier' && TIERS.map((t) => {
        const cars = carsInTier(t.n);
        const have = cars.filter((c) => owned.has(c.id)).length;
        return (
          <section key={t.n} className="card" aria-labelledby={`tier-${t.n}`}>
            <div className="card-head">
              <h2 id={`tier-${t.n}`} className="card-title">
                {t.name} <span className="muted">· {t.buildMin >= 60 ? `${t.buildMin / 60} h` : `${t.buildMin} min`} each</span>
              </h2>
              <span className="muted small">
                {have} of {cars.length}
              </span>
            </div>
            {grid(cars, false)}
          </section>
        );
      })}

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
      </details>
    </div>
  );
}

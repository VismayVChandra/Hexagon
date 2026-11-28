import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GarageItem } from '../types';
import { CARS, buildMs, carById, type Car } from '../data/cars';
import { Bar } from './bits';
import { CarArt } from './CarArt';
import { CarPhoto } from './CarPhoto';
import { LikesBadge } from './LikesBadge';
import { useCloud } from '../cloud/cloud';

/** How many built cars the card shows before "See more". */
const PREVIEW = 3;

/** A short look at your garage: your newest built cars (more on request) and the one you're working on. */
export function GarageCard({ garage, builds }: { garage: GarageItem[]; builds: Record<string, number> }) {
  const owned = new Set(garage.map((g) => g.carId));
  const likes = useCloud().carLikes;
  const [expanded, setExpanded] = useState(false);
  const built = [...garage]
    .sort((a, b) => b.at - a.at)
    .map((g) => carById(g.carId))
    .filter((c): c is Car => !!c);
  // Three of your newest cars at first; the rest are one tap away.
  const recent = expanded ? built : built.slice(0, PREVIEW);
  const hidden = built.length - PREVIEW;
  const working = CARS.filter((c) => !owned.has(c.id) && (builds[c.id] ?? 0) > 0).sort((a, b) => (builds[b.id] ?? 0) / buildMs(b) - (builds[a.id] ?? 0) / buildMs(a))[0];
  const items = working ? [...recent, working] : recent;

  return (
    <section className="card garage-card" aria-labelledby="garage-h">
      <div className="card-head">
        <h2 id="garage-h" className="card-title">
          Your garage
        </h2>
        <span className="muted small">
          {owned.size} of {CARS.length} built
        </span>
      </div>
      {items.length > 0 ? (
        <ul className="garage-grid">
          {items.map((car) => {
            const has = owned.has(car.id);
            const progress = has ? 1 : Math.min(1, (builds[car.id] ?? 0) / buildMs(car));
            return (
              <li key={car.id} className={has ? 'is-owned' : ''}>
                {has ? <CarPhoto car={car} /> : <CarArt car={car} locked label={`${car.name}, ${Math.floor(progress * 100)}% built`} />}
                {!has && progress > 0 && <Bar value={progress} label={`${car.name} build progress`} />}
                <small className="car-brand">{car.brand}</small>
                <span className="car-option-name">{car.model}</span>
                {has && (likes[car.id] ?? 0) > 0 && <LikesBadge n={likes[car.id]} />}
                <small className="muted">{has ? 'Built' : `${Math.floor(progress * 100)}% built`}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Nothing built yet. Choose “Build a car” on the Study page and pick one to start.</p>
      )}
      {hidden > 0 && (
        <button type="button" className="btn btn-secondary btn-block" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `See ${hidden} more built ${hidden === 1 ? 'car' : 'cars'}`}
        </button>
      )}
      <div className="row">
        <Link to="/garage" className="link-btn">
          See all {CARS.length} cars
        </Link>
        <Link to="/study" className="link-btn">
          Keep building
        </Link>
      </div>
    </section>
  );
}

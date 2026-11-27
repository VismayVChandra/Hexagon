import { Link } from 'react-router-dom';
import type { GarageItem } from '../types';
import { CARS, buildMs, carById, type Car } from '../data/cars';
import { Bar } from './bits';
import { CarArt } from './CarArt';
import { CarPhoto } from './CarPhoto';

/** A short look at your garage: the cars you built most recently and the one you're working on. */
export function GarageCard({ garage, builds }: { garage: GarageItem[]; builds: Record<string, number> }) {
  const owned = new Set(garage.map((g) => g.carId));
  const recent = [...garage]
    .sort((a, b) => b.at - a.at)
    .map((g) => carById(g.carId))
    .filter((c): c is Car => !!c)
    .slice(0, 3);
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
                <small className="muted">{has ? 'Built' : `${Math.floor(progress * 100)}% built`}</small>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Nothing built yet. Choose “Build a car” on the Study page and pick one to start.</p>
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

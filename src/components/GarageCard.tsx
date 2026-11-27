import { Link } from 'react-router-dom';
import type { GarageItem } from '../types';
import { CARS, buildMs } from '../data/cars';
import { Bar } from './bits';
import { CarArt } from './CarArt';

/** Your garage: finished cars in colour, the rest as outlines with their build progress. */
export function GarageCard({ garage, builds }: { garage: GarageItem[]; builds: Record<string, number> }) {
  const owned = new Set(garage.map((g) => g.carId));
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
      <ul className="garage-grid">
        {CARS.map((car) => {
          const has = owned.has(car.id);
          const progress = has ? 1 : Math.min(1, (builds[car.id] ?? 0) / buildMs(car));
          return (
            <li key={car.id} className={has ? 'is-owned' : ''}>
              <CarArt car={car} locked={!has} label={has ? `${car.name}, built` : `${car.name}, ${Math.floor(progress * 100)}% built`} />
              {!has && progress > 0 && <Bar value={progress} label={`${car.name} build progress`} />}
              <span className="car-option-name">{car.name}</span>
              <small className="muted">{has ? 'Built' : progress > 0 ? `${Math.floor(progress * 100)}% built` : `${car.buildMin} min of focus`}</small>
            </li>
          );
        })}
      </ul>
      {owned.size < CARS.length && (
        <Link to="/study" className="link-btn">
          Keep building
        </Link>
      )}
    </section>
  );
}

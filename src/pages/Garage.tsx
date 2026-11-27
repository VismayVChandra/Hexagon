import { Link } from 'react-router-dom';
import { CARS, TIERS, buildMs, carsInTier } from '../data/cars';
import { useStore } from '../store/store';
import { Bar } from '../components/bits';
import { CarArt } from '../components/CarArt';

/** Every car you can build, grouped by tier. Finished cars are in colour; the rest are outlines with their progress. */
export default function Garage() {
  const { data } = useStore();
  const owned = new Set(data.garage.map((g) => g.carId));

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">Your garage</h1>
        <p className="page-sub">
          {owned.size} of {CARS.length} built. Choose “Build a car” when you start a session, and study to fit its parts.
        </p>
      </header>

      {TIERS.map((t) => {
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
            <ul className="garage-grid">
              {cars.map((car) => {
                const has = owned.has(car.id);
                const progress = has ? 1 : Math.min(1, (data.builds[car.id] ?? 0) / buildMs(car));
                return (
                  <li key={car.id} className={has ? 'is-owned' : ''}>
                    <CarArt car={car} locked={!has} label={has ? `${car.name}, built` : `${car.name}, ${Math.floor(progress * 100)}% built`} />
                    {!has && progress > 0 && <Bar value={progress} label={`${car.name} build progress`} />}
                    <small className="car-brand">{car.brand}</small>
                    <span className="car-option-name">{car.model}</span>
                    <small className="muted">{has ? 'Built' : progress > 0 ? `${Math.floor(progress * 100)}% built` : 'Not started'}</small>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <Link to="/study" className="btn btn-primary">
        Start a build
      </Link>
    </div>
  );
}

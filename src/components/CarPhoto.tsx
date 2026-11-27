import { useState } from 'react';
import type { Car } from '../data/cars';
import { CarArt } from './CarArt';

/**
 * The real photo of a car you've built (see src/data/carPhotos.ts for credits). If the photo can't load, for example
 * offline before it was first cached, it falls back to the drawn car so nothing looks broken.
 */
export function CarPhoto({ car, className }: { car: Car; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <CarArt car={car} label={car.name} className={className} />;
  return (
    <img
      className={`car-photo${className ? ` ${className}` : ''}`}
      src={`${import.meta.env.BASE_URL}cars/${car.id}.webp`}
      alt={car.name}
      width={640}
      height={400}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

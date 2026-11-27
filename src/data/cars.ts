import { MIN } from '../lib/time';
import type { GarageItem } from '../types';

/**
 * The garage: cars you build by studying. Each tier needs a set amount of focus time, and progress carries over
 * between sessions, so a long build can be finished across several sittings.
 *
 * Brand and model names are shown as plain text only (no logos), and the artwork is a simple illustration of a body style
 * (hatch, sedan, SUV, coupe, supercar, limousine) in a signature colour, not a replica of any real model.
 */

export type BodyStyle = 'hatch' | 'sedan' | 'suv' | 'coupe' | 'supercar' | 'limo';

export interface Tier {
  n: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  /** Focus time needed to finish a car in this tier. */
  buildMin: number;
  blurb: string;
}

export const TIERS: Tier[] = [
  { n: 1, name: 'Starter', buildMin: 25, blurb: 'Quick wins. One focus block.' },
  { n: 2, name: 'Everyday icons', buildMin: 45, blurb: 'The cars everyone knows.' },
  { n: 3, name: 'Premium', buildMin: 60, blurb: 'A solid hour of focus.' },
  { n: 4, name: 'Performance', buildMin: 90, blurb: 'Power and presence.' },
  { n: 5, name: 'Legends', buildMin: 180, blurb: 'Three hours for the dream cars.' },
  { n: 6, name: 'Hypercars', buildMin: 300, blurb: 'Five hours for the cars everyone dreams of.' },
];

export interface Car {
  id: string;
  brand: string;
  model: string;
  /** Brand and model, e.g. "BMW X5". */
  name: string;
  tier: Tier['n'];
  buildMin: number;
  style: BodyStyle;
  /** Main body colour. */
  color: string;
  /** Darker shade for shading and trim (derived from `color`). */
  shade: string;
  /** Optional stripe colour for the sporty ones. */
  accent?: string;
}

/** Darken a #rrggbb colour by `amount` (0..1). */
export function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function car(id: string, brand: string, model: string, tier: Tier['n'], style: BodyStyle, color: string, accent?: string): Car {
  return { id, brand, model, name: `${brand} ${model}`, tier, buildMin: TIERS[tier - 1].buildMin, style, color, shade: darken(color, 0.3), accent };
}

const ALL_CARS: Car[] = [
  // Tier 1: Starter (25 min)
  car('maruti-alto', 'Maruti Suzuki', 'Alto', 1, 'hatch', '#E5533D'),
  car('maruti-swift', 'Maruti Suzuki', 'Swift', 1, 'hatch', '#F4B400'),
  car('maruti-wagon-r', 'Maruti Suzuki', 'Wagon R', 1, 'hatch', '#5FA8D3'),
  car('maruti-baleno', 'Maruti Suzuki', 'Baleno', 1, 'hatch', '#3A86C8'),
  car('maruti-brezza', 'Maruti Suzuki', 'Brezza', 1, 'suv', '#7A8B99'),

  // Tier 2: Everyday icons (45 min)
  car('toyota-corolla', 'Toyota', 'Corolla', 2, 'sedan', '#B7BDC6'),
  car('toyota-innova', 'Toyota', 'Innova', 2, 'suv', '#8A6E52'),
  car('toyota-fortuner', 'Toyota', 'Fortuner', 2, 'suv', '#E9EBEF'),
  car('tesla-model-3', 'Tesla', 'Model 3', 2, 'sedan', '#C5283D'),
  car('audi-a3', 'Audi', 'A3', 2, 'hatch', '#6D7A8A'),
  car('mercedes-a-class', 'Mercedes-Benz', 'A-Class', 2, 'hatch', '#2F3E55'),

  // Tier 3: Premium (60 min)
  car('bmw-x1', 'BMW', 'X1', 3, 'suv', '#1C69D4'),
  car('bmw-x2', 'BMW', 'X2', 3, 'suv', '#F26B21'),
  car('bmw-3-series', 'BMW', '3 Series', 3, 'sedan', '#262C36'),
  car('audi-a4', 'Audi', 'A4', 3, 'sedan', '#B22A36'),
  car('audi-q3', 'Audi', 'Q3', 3, 'suv', '#3F7D5C'),
  car('mercedes-c-class', 'Mercedes-Benz', 'C-Class', 3, 'sedan', '#C9CED6'),
  car('tesla-model-y', 'Tesla', 'Model Y', 3, 'suv', '#E5E7EB'),

  // Tier 4: Performance (90 min)
  car('bmw-x3', 'BMW', 'X3', 4, 'suv', '#0F4C81'),
  car('bmw-x5', 'BMW', 'X5', 4, 'suv', '#3B2F2F'),
  car('bmw-m4', 'BMW', 'M4', 4, 'coupe', '#1AA6B7', '#FFFFFF'),
  car('audi-q7', 'Audi', 'Q7', 4, 'suv', '#2A2D33'),
  car('mercedes-e-class', 'Mercedes-Benz', 'E-Class', 4, 'sedan', '#8D99AE'),
  car('mercedes-gle', 'Mercedes-Benz', 'GLE', 4, 'suv', '#5C4B8A'),
  car('porsche-macan', 'Porsche', 'Macan', 4, 'suv', '#C79A2B'),
  car('jeep-wagoneer', 'Jeep', 'Wagoneer', 4, 'suv', '#2F4A3C'),

  // Tier 5: Legends (180 min)
  car('porsche-911', 'Porsche', '911', 5, 'coupe', '#C1121F', '#FFFFFF'),
  car('audi-r8', 'Audi', 'R8', 5, 'supercar', '#9B9EA6', '#C5283D'),
  car('mercedes-amg-gt', 'Mercedes-Benz', 'AMG GT', 5, 'supercar', '#1D7F5A', '#FFFFFF'),
  car('tesla-model-s', 'Tesla', 'Model S Plaid', 5, 'sedan', '#101418', '#C5283D'),
  car('ferrari-f8', 'Ferrari', 'F8 Tributo', 5, 'supercar', '#D00000', '#FFE600'),
  car('lamborghini-huracan', 'Lamborghini', 'Huracán', 5, 'supercar', '#6BC21F', '#101418'),
  car('lamborghini-urus', 'Lamborghini', 'Urus', 5, 'suv', '#F5A300', '#101418'),
  car('rolls-royce-ghost', 'Rolls-Royce', 'Ghost', 5, 'limo', '#E9E4D8'),
  car('rolls-royce-phantom', 'Rolls-Royce', 'Phantom', 5, 'limo', '#1B1F3B'),
  car('mclaren-720s', 'McLaren', '720S', 5, 'supercar', '#F26B21', '#101418'),
  car('lamborghini-aventador', 'Lamborghini', 'Aventador', 5, 'supercar', '#2A5CAA', '#101418'),
  car('lamborghini-revuelto', 'Lamborghini', 'Revuelto', 5, 'supercar', '#E9EBEF', '#F5A300'),
  car('ferrari-488', 'Ferrari', '488 GTB', 5, 'supercar', '#E8B70D', '#101418'),
  car('nissan-gtr', 'Nissan', 'GT-R', 5, 'coupe', '#E5E7EB', '#C5283D'),
  car('corvette-c8', 'Chevrolet', 'Corvette C8', 5, 'supercar', '#E0C200', '#101418'),
  car('aston-martin-vantage', 'Aston Martin', 'Vantage', 5, 'coupe', '#6E7B5C', '#E9EBEF'),

  // Tier 6: Hypercars (300 min)
  car('bugatti-chiron', 'Bugatti', 'Chiron', 6, 'supercar', '#1C69D4', '#101418'),
  car('bugatti-veyron', 'Bugatti', 'Veyron', 6, 'supercar', '#1F2A4D', '#B87333'),
  car('koenigsegg-jesko', 'Koenigsegg', 'Jesko', 6, 'supercar', '#3A3F45', '#E5533D'),
  car('pagani-huayra', 'Pagani', 'Huayra', 6, 'supercar', '#B21E3B', '#C9A227'),
  car('ferrari-laferrari', 'Ferrari', 'LaFerrari', 6, 'supercar', '#D00000', '#101418'),
  car('mclaren-p1', 'McLaren', 'P1', 6, 'supercar', '#F5A300', '#101418'),
  car('porsche-918', 'Porsche', '918 Spyder', 6, 'supercar', '#A9AEB5', '#1D7F5A'),
  car('rimac-nevera', 'Rimac', 'Nevera', 6, 'supercar', '#1AA6B7', '#101418'),
  car('aston-martin-valkyrie', 'Aston Martin', 'Valkyrie', 6, 'supercar', '#2F8F83', '#F4D000'),
  car('mercedes-amg-one', 'Mercedes-Benz', 'AMG One', 6, 'supercar', '#C9CED6', '#00A99D'),

  // A to Z: one icon per brand, with a free-licence photo
  car('abarth-595', 'Abarth', '595', 2, 'hatch', '#D1202F'),
  car('acura-nsx', 'Acura', 'NSX', 5, 'supercar', '#C1121F'),
  car('alfa-romeo-giulia', 'Alfa Romeo', 'Giulia', 4, 'sedan', '#A3162A'),
  car('alpine-a110', 'Alpine', 'A110', 4, 'coupe', '#2D6CDF'),
  car('ariel-atom', 'Ariel', 'Atom', 4, 'coupe', '#E5533D'),
  car('bentley-continental-gt', 'Bentley', 'Continental GT', 5, 'coupe', '#1B3A2E'),
  car('buick-regal', 'Buick', 'Regal', 2, 'sedan', '#8D99AE'),
  car('byd-seal', 'BYD', 'Seal', 3, 'sedan', '#2F6F9F'),
  car('cadillac-escalade', 'Cadillac', 'Escalade', 4, 'suv', '#14181F'),
  car('caterham-seven', 'Caterham', 'Seven', 4, 'coupe', '#2F5D50'),
  car('chrysler-300', 'Chrysler', '300', 3, 'sedan', '#3A3F45'),
  car('citroen-2cv', 'Citroën', '2CV', 1, 'hatch', '#E9B44C'),
  car('cupra-formentor', 'Cupra', 'Formentor', 3, 'suv', '#B87333'),
  car('dacia-duster', 'Dacia', 'Duster', 1, 'suv', '#7A8B6F'),
  car('daihatsu-copen', 'Daihatsu', 'Copen', 1, 'coupe', '#E5533D'),
  car('datsun-240z', 'Datsun', '240Z', 4, 'coupe', '#F5A300'),
  car('delorean-dmc-12', 'DeLorean', 'DMC-12', 5, 'coupe', '#B8BCC4'),
  car('dodge-challenger', 'Dodge', 'Challenger', 4, 'coupe', '#6B2D8A'),
  car('eagle-talon', 'Eagle', 'Talon', 3, 'coupe', '#C5283D'),
  car('fiat-500', 'Fiat', '500', 1, 'hatch', '#E9E4D8'),
  car('fisker-ocean', 'Fisker', 'Ocean', 3, 'suv', '#3F8F9A'),
  car('force-gurkha', 'Force', 'Gurkha', 3, 'suv', '#2F4A3C'),
  car('ford-mustang', 'Ford', 'Mustang', 4, 'coupe', '#1C69D4'),
  car('genesis-g80', 'Genesis', 'G80', 3, 'sedan', '#262C36'),
  car('gmc-hummer-ev', 'GMC', 'Hummer EV', 4, 'suv', '#E9EBEF'),
  car('gordon-murray-t-50', 'Gordon Murray', 'T.50', 6, 'supercar', '#1F2A4D'),
  car('great-wall-tank-300', 'Great Wall', 'Tank 300', 3, 'suv', '#4F8A6B'),
  car('hennessey-venom-f5', 'Hennessey', 'Venom F5', 6, 'supercar', '#2A2D33'),
  car('hindustan-ambassador', 'Hindustan', 'Ambassador', 2, 'sedan', '#E9E4D8'),
  car('honda-civic', 'Honda', 'Civic', 2, 'hatch', '#C5283D'),
  car('hyundai-creta', 'Hyundai', 'Creta', 1, 'suv', '#E9EBEF'),
  car('ineos-grenadier', 'Ineos', 'Grenadier', 3, 'suv', '#2F4A3C'),
  car('infiniti-q50', 'Infiniti', 'Q50', 3, 'sedan', '#3A3F45'),
  car('iso-grifo', 'Iso', 'Grifo', 4, 'coupe', '#A3162A'),
  car('isuzu-d-max', 'Isuzu', 'D-Max', 2, 'suv', '#8D99AE'),
  car('jaguar-f-type', 'Jaguar', 'F-Type', 4, 'coupe', '#1F6F4A'),
  car('jensen-interceptor', 'Jensen', 'Interceptor', 4, 'coupe', '#8D99AE'),
  car('karma-revero', 'Karma', 'Revero', 4, 'sedan', '#3A3F45'),
  car('kia-seltos', 'Kia', 'Seltos', 1, 'suv', '#3F7D5C'),
  car('ktm-x-bow', 'KTM', 'X-Bow', 4, 'supercar', '#F26B21'),
  car('lancia-delta-integrale', 'Lancia', 'Delta Integrale', 3, 'hatch', '#B22A36'),
  car('land-rover-defender', 'Land Rover', 'Defender', 4, 'suv', '#4F8A6B'),
  car('lexus-lc-500', 'Lexus', 'LC 500', 4, 'coupe', '#6D7A8A'),
  car('lincoln-navigator', 'Lincoln', 'Navigator', 4, 'suv', '#14181F'),
  car('lotus-emira', 'Lotus', 'Emira', 4, 'coupe', '#F4B400'),
  car('lucid-air', 'Lucid', 'Air', 4, 'sedan', '#E5E7EB'),
  car('mahindra-thar', 'Mahindra', 'Thar', 1, 'suv', '#C4694A'),
  car('maserati-mc20', 'Maserati', 'MC20', 5, 'supercar', '#1C69D4'),
  car('mazda-mx-5', 'Mazda', 'MX-5', 3, 'coupe', '#C1121F'),
  car('mg-hector', 'MG', 'Hector', 1, 'suv', '#C5283D'),
  car('mini-cooper', 'Mini', 'Cooper', 2, 'hatch', '#F4B400'),
  car('mitsubishi-lancer-evolution', 'Mitsubishi', 'Lancer Evolution', 4, 'sedan', '#C5283D'),
  car('morgan-plus-four', 'Morgan', 'Plus Four', 4, 'coupe', '#1F6F4A'),
  car('nio-et7', 'NIO', 'ET7', 3, 'sedan', '#2F3E55'),
  car('noble-m600', 'Noble', 'M600', 5, 'supercar', '#F26B21'),
  car('opel-corsa', 'Opel', 'Corsa', 1, 'hatch', '#F4B400'),
  car('peugeot-208', 'Peugeot', '208', 1, 'hatch', '#3A86C8'),
  car('plymouth-barracuda', 'Plymouth', 'Barracuda', 4, 'coupe', '#6B2D8A'),
  car('polestar-2', 'Polestar', '2', 3, 'sedan', '#E5E7EB'),
  car('pontiac-firebird', 'Pontiac', 'Firebird', 4, 'coupe', '#14181F'),
  car('premier-padmini', 'Premier', 'Padmini', 1, 'hatch', '#F4B400'),
  car('qoros-3', 'Qoros', '3', 2, 'sedan', '#3A86C8'),
  car('ram-1500-trx', 'Ram', '1500 TRX', 4, 'suv', '#C1121F'),
  car('range-rover-sport', 'Range Rover', 'Sport', 4, 'suv', '#2F4A3C'),
  car('reliant-robin', 'Reliant', 'Robin', 1, 'hatch', '#E9E4D8'),
  car('renault-kwid', 'Renault', 'Kwid', 1, 'hatch', '#E5533D'),
  car('rivian-r1t', 'Rivian', 'R1T', 4, 'suv', '#1D7F5A'),
  car('saab-900', 'Saab', '900', 2, 'sedan', '#B22A36'),
  car('seat-leon', 'SEAT', 'Leon', 2, 'hatch', '#C5283D'),
  car('shelby-cobra', 'Shelby', 'Cobra', 5, 'coupe', '#1C69D4'),
  car('skoda-octavia', 'Skoda', 'Octavia', 2, 'sedan', '#3F7D5C'),
  car('smart-fortwo', 'Smart', 'ForTwo', 1, 'hatch', '#F4B400'),
  car('spyker-c8', 'Spyker', 'C8', 5, 'supercar', '#F26B21'),
  car('ssangyong-rexton', 'SsangYong', 'Rexton', 2, 'suv', '#7A8B99'),
  car('ssc-tuatara', 'SSC', 'Tuatara', 6, 'supercar', '#E5533D'),
  car('subaru-wrx-sti', 'Subaru', 'WRX STI', 3, 'sedan', '#1C69D4'),
  car('suzuki-jimny', 'Suzuki', 'Jimny', 1, 'suv', '#F4B400'),
  car('tata-nano', 'Tata', 'Nano', 1, 'hatch', '#F4B400'),
  car('trabant-601', 'Trabant', '601', 1, 'sedan', '#E9E4D8'),
  car('tvr-griffith', 'TVR', 'Griffith', 4, 'coupe', '#C1121F'),
  car('uaz-hunter', 'UAZ', 'Hunter', 2, 'suv', '#4F8A6B'),
  car('ultima-gtr', 'Ultima', 'GTR', 5, 'supercar', '#E5533D'),
  car('vauxhall-astra', 'Vauxhall', 'Astra', 1, 'hatch', '#C5283D'),
  car('vector-w8', 'Vector', 'W8', 5, 'supercar', '#E9EBEF'),
  car('vinfast-vf-8', 'VinFast', 'VF 8', 3, 'suv', '#E5E7EB'),
  car('volkswagen-golf', 'Volkswagen', 'Golf', 2, 'hatch', '#3A86C8'),
  car('volvo-xc90', 'Volvo', 'XC90', 3, 'suv', '#3A3F45'),
  car('w-motors-lykan-hypersport', 'W Motors', 'Lykan HyperSport', 6, 'supercar', '#C1121F'),
  car('wiesmann-gt-mf5', 'Wiesmann', 'GT MF5', 5, 'coupe', '#2F5D50'),
  car('willys-mb', 'Willys', 'MB', 2, 'suv', '#4F6B3C'),
  car('wuling-hongguang-mini-ev', 'Wuling', 'Hongguang Mini EV', 1, 'hatch', '#E9B8C4'),
  car('xiaomi-su7', 'Xiaomi', 'SU7', 3, 'sedan', '#3F8F9A'),
  car('xpeng-p7', 'Xpeng', 'P7', 3, 'sedan', '#3A86C8'),
  car('yangwang-u9', 'Yangwang', 'U9', 6, 'supercar', '#14181F'),
  car('yugo-45', 'Yugo', '45', 1, 'hatch', '#C5283D'),
  car('zastava-750', 'Zastava', '750', 1, 'hatch', '#E9E4D8'),
  car('zeekr-001', 'Zeekr', '001', 3, 'sedan', '#E5E7EB'),
  car('zenvo-tsr-s', 'Zenvo', 'TSR-S', 6, 'supercar', '#2A5CAA'),
];

/** Every car, cheapest tier first (cars keep their listed order within a tier). */
export const CARS: Car[] = [...ALL_CARS].sort((a, b) => a.tier - b.tier);

export const carById = (id: string | undefined) => CARS.find((c) => c.id === id);
export const buildMs = (car: Car) => car.buildMin * MIN;
export const carsInTier = (n: Tier['n']) => CARS.filter((c) => c.tier === n);
export const tierOf = (car: Car) => TIERS[car.tier - 1];

/** The first letter of a car's brand, A to Z (accents dropped), for the A to Z view. */
export function brandLetter(car: Car): string {
  const c = car.brand.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
/** Every car, by brand and then model. */
export const CARS_AZ: Car[] = [...CARS].sort((a, b) => a.brand.localeCompare(b.brand, 'en', { sensitivity: 'base' }) || a.model.localeCompare(b.model, 'en', { numeric: true, sensitivity: 'base' }));
/** The letters that have at least one car. */
export const LETTERS: string[] = [...new Set(CARS.map(brandLetter))].sort();
export const carsWithLetter = (letter: string) => CARS_AZ.filter((c) => brandLetter(c) === letter);
export const buildTimeLabel = (car: Car) => (car.buildMin >= 60 ? `${car.buildMin / 60} h` : `${car.buildMin} min`);

/** Cars from the first version of the garage, so anyone who already built one keeps it. */
export const LEGACY_CAR_IDS: Record<string, string> = {
  'mini-hatch': 'maruti-alto',
  'street-coupe': 'toyota-corolla',
  executive: 'bmw-3-series',
  supercar: 'bmw-m4',
  'grand-luxe': 'rolls-royce-ghost',
};
export const migrateCarId = (id: string) => LEGACY_CAR_IDS[id] ?? id;

/** The parts of a car, in the order they are fitted. */
export const PARTS = [
  { id: 'frame', label: 'Frame' },
  { id: 'wheels', label: 'Wheels' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'engine', label: 'Engine' },
  { id: 'body', label: 'Body' },
  { id: 'paint', label: 'Paint and trim' },
] as const;

export type PartId = (typeof PARTS)[number]['id'];

export interface PartState {
  id: PartId;
  label: string;
  /** 0 = not started, 1 = fitted. A part under construction has a value in between. */
  amount: number;
}

/** Which parts are fitted at `progress` (0..1). Each part owns an equal slice of the build. */
export function partStates(progress: number): PartState[] {
  const p = Math.max(0, Math.min(1, progress));
  const n = PARTS.length;
  return PARTS.map((part, i) => ({ id: part.id, label: part.label, amount: Math.max(0, Math.min(1, p * n - i)) }));
}

/** The part being worked on right now, or null when nothing has started or everything is done. */
export function currentPart(progress: number): PartState | null {
  if (progress <= 0 || progress >= 1) return null;
  return partStates(progress).find((s) => s.amount > 0 && s.amount < 1) ?? null;
}

export interface BuildResult {
  builds: Record<string, number>;
  garage: GarageItem[];
  /** The car finished by this session, if any. */
  completed: Car | null;
}

/**
 * Adds a session's focus time to a car. Reaching its build time adds it to the garage (once) and resets its progress.
 * Pure: returns new objects.
 */
export function applyBuild(builds: Record<string, number>, garage: GarageItem[], carId: string | undefined, studiedMs: number, now: number): BuildResult {
  const car = carById(carId);
  if (!car || garage.some((g) => g.carId === car.id)) return { builds, garage, completed: null };
  const total = (builds[car.id] ?? 0) + Math.max(0, studiedMs);
  if (total >= buildMs(car)) {
    const { [car.id]: _done, ...rest } = builds;
    void _done;
    return { builds: rest, garage: [...garage, { carId: car.id, at: now }], completed: car };
  }
  return { builds: { ...builds, [car.id]: total }, garage, completed: null };
}

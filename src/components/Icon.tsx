import { LOGO_OUTER, LOGO_RING } from '../lib/hexPaths';

const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  users: 'M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15.5 5.2a3.5 3.5 0 010 6.6',
  calendar: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 10h16M8 3v4M16 3v4',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14M16 5v14',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  flame: 'M12 3c1 3.5 5 5.5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2-.5-3 0-5.5 1-8z',
  coffee: 'M4 9h13v6a4 4 0 01-4 4H8a4 4 0 01-4-4zM17 10h1.5a2.5 2.5 0 010 5H17M8 3v3M12 3v3',
  download: 'M12 4v11M7.5 11L12 15.5 16.5 11M5 20h14',
  share: 'M12 15V4M8 8l4-4 4 4M6 12v7a1 1 0 001 1h10a1 1 0 001-1v-7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  chevron: 'M9 6l6 6-6 6',
  device: 'M4 5h16v11H4zM9 20h6M12 16v4',
  moon: 'M20.5 13.4A8.5 8.5 0 1110.6 3.5a6.8 6.8 0 009.9 9.9z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  skip: 'M5 5l10 7-10 7zM19 5v14',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  headphones: 'M4 15v-3a8 8 0 0116 0v3M4 14h3.5v6.5H4zM16.5 14H20v6.5h-3.5z',
  list: 'M4 7l2 2 3.5-3.5M4 15l2 2 3.5-3.5M13 8h7M13 16h7',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'play' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logo-forest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a8a77" />
          <stop offset="1" stopColor="#1f463c" />
        </linearGradient>
        <linearGradient id="logo-honey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7d675" />
          <stop offset="1" stopColor="#e0a02c" />
        </linearGradient>
      </defs>
      <path d={LOGO_OUTER} fill="url(#logo-forest)" />
      <path d={LOGO_RING} fill="url(#logo-honey)" fillRule="evenodd" />
    </svg>
  );
}

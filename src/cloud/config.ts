/**
 * Cloud (real friends) is optional. It switches on when a Supabase project URL and its public "anon" key
 * are provided at build time (see docs/FRIENDS_SETUP.md). The anon key is designed to be public: it grants no
 * access by itself, because every table is locked and all access goes through checked functions.
 */
export const CLOUD_URL: string = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
export const CLOUD_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** Development only: `npm run dev` then open /?mockcloud=1 to try the friends UI with an in-memory fake server. */
export const USE_MOCK: boolean = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('mockcloud');

export const cloudConfigured: boolean = USE_MOCK || Boolean(CLOUD_URL && CLOUD_KEY);

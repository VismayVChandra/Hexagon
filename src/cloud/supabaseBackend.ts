import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_KEY, CLOUD_URL } from './config';
import { CloudError, type AddFriendResult, type CloudBackend, type CloudProfile, type CloudUser, type PresenceUpdate, type RemoteFriend } from './types';

interface ProfileRow {
  id: string;
  display_name: string;
  friend_code: string;
  share_presence: boolean;
  share_subject: boolean;
}

const toProfile = (r: ProfileRow): CloudProfile => ({
  id: r.id,
  displayName: r.display_name,
  friendCode: r.friend_code,
  sharePresence: r.share_presence,
  shareSubject: r.share_subject,
});

/** Turn SDK/Postgres errors into short messages a student can act on. */
function wrap(e: unknown): CloudError {
  if (e instanceof CloudError) return e;
  const err = e as { message?: string; status?: number; code?: string };
  const msg = err?.message ?? 'Something went wrong';
  if (/anonymous sign-ins are disabled/i.test(msg)) return new CloudError('Friends isn’t switched on for this app yet. The app’s owner needs to enable anonymous sign-ins in Supabase.', 'server');
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) return new CloudError('Too many attempts. Please wait a few minutes and try again.', 'rate-limit');
  if (/failed to fetch|network|load failed/i.test(msg)) return new CloudError('Can’t reach the server. Check your connection and try again.', 'network');
  if (/not signed in|jwt|invalid claim|user from sub claim/i.test(msg)) return new CloudError('Your friends account was reset. Please turn friends on again.', 'auth');
  if (/could not find the function|schema cache/i.test(msg)) return new CloudError('The friends database isn’t set up yet. The app’s owner needs to run the setup SQL in Supabase.', 'server');
  // Messages raised by our own SQL functions are already friendly (e.g. "Name must be 1 to 30 characters").
  if (err?.code === 'P0001') return new CloudError(msg, 'validation');
  return new CloudError(msg, 'server');
}

async function run<T = void>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw wrap(error);
  return data as T;
}

export async function createSupabaseBackend(): Promise<CloudBackend> {
  // Loaded on demand so people who never use friends don't download the SDK.
  const { createClient } = await import('@supabase/supabase-js');
  const sb: SupabaseClient = createClient(CLOUD_URL, CLOUD_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  return {
    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session ? { id: data.session.user.id } : null;
    },
    async signInAnonymously() {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) throw wrap(error);
      if (!data.user) throw new CloudError('Couldn’t set up friends. Please try again.', 'server');
      return { id: data.user.id } satisfies CloudUser;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    onSignedOut(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') cb();
      });
      return () => data.subscription.unsubscribe();
    },

    async getProfile() {
      const { data } = await sb.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return null;
      const row = await run<ProfileRow | null>(sb.from('profiles').select('*').eq('id', uid).maybeSingle());
      return row ? toProfile(row) : null;
    },
    async saveProfile(displayName) {
      return toProfile(await run<ProfileRow>(sb.rpc('ensure_profile', { p_name: displayName })));
    },
    async regenerateCode() {
      return await run<string>(sb.rpc('regenerate_friend_code'));
    },
    async setSharing(sharePresence, shareSubject) {
      await run(sb.rpc('set_sharing', { p_presence: sharePresence, p_subject: shareSubject }));
    },

    async listFriends() {
      const rows = await run<
        { friendship_id: string; friend_id: string; display_name: string; state: RemoteFriend['state']; subject: string | null; session_ms: number | null; room_id: string | null; updated_at: string | null }[]
      >(sb.rpc('list_friends'));
      return (rows ?? []).map((r) => ({
        friendshipId: r.friendship_id,
        id: r.friend_id,
        name: r.display_name,
        state: r.state,
        subject: r.subject,
        sessionMs: Number(r.session_ms ?? 0),
        roomId: r.room_id,
        updatedAt: r.updated_at,
      }));
    },
    async addFriendByCode(code) {
      const r = await run<{ status: AddFriendResult['status']; name?: string }>(sb.rpc('add_friend_by_code', { p_code: code }));
      return (r.status === 'added' || r.status === 'already' ? { status: r.status, name: r.name ?? 'your friend' } : { status: r.status }) as AddFriendResult;
    },
    async removeFriendship(id) {
      await run(sb.rpc('remove_friendship', { p_id: id }));
    },

    async setPresence(p: PresenceUpdate) {
      await run(sb.rpc('set_presence', { p_state: p.state, p_subject: p.subject, p_session_ms: Math.round(p.sessionMs), p_room: p.roomId }));
    },
    async clearPresence() {
      await run(sb.rpc('clear_presence'));
    },
    async deleteMyData() {
      await run(sb.rpc('delete_my_data'));
    },
  };
}

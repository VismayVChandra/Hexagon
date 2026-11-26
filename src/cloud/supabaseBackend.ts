import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_KEY, CLOUD_URL } from './config';
import { CloudError, type CloudBackend, type CloudProfile, type CloudUser, type FriendRequest, type PresenceUpdate, type RemoteFriend } from './types';

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
  const err = e as { message?: string; status?: number; code?: string; name?: string };
  const msg = err?.message ?? 'Something went wrong';
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) return new CloudError('Too many attempts. Please wait a few minutes and try again.', 'rate-limit');
  if (/failed to fetch|network|load failed/i.test(msg)) return new CloudError('Can’t reach the server. Check your connection and try again.', 'network');
  if (/invalid.*(token|otp)|expired|token has expired/i.test(msg)) return new CloudError('That code is wrong or has expired. Request a new one.', 'auth');
  if (/not signed in|jwt|invalid claim/i.test(msg)) return new CloudError('You’ve been signed out. Please sign in again.', 'auth');
  // Messages raised by our own SQL functions are already friendly (e.g. "No one has that friend code").
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

  const userOf = (u: { id: string; email?: string | null } | null | undefined): CloudUser | null => (u ? { id: u.id, email: u.email ?? '' } : null);

  return {
    async getUser() {
      const { data } = await sb.auth.getSession();
      return userOf(data.session?.user);
    },
    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw wrap(error);
    },
    async verifyCode(email, code) {
      const { data, error } = await sb.auth.verifyOtp({ email, token: code.replace(/\s+/g, ''), type: 'email' });
      if (error) throw wrap(error);
      const u = userOf(data.user);
      if (!u) throw new CloudError('Sign-in didn’t complete. Please try again.', 'auth');
      return u;
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
    async listRequests() {
      const rows = await run<{ id: string; direction: FriendRequest['direction']; display_name: string; created_at: string }[]>(sb.rpc('list_friend_requests'));
      return (rows ?? []).map((r) => ({ id: r.id, direction: r.direction, name: r.display_name, createdAt: r.created_at }));
    },
    async sendRequest(code) {
      return (await run<'sent' | 'accepted'>(sb.rpc('send_friend_request', { p_code: code })));
    },
    async respond(requestId, accept) {
      await run(sb.rpc('respond_friend_request', { p_id: requestId, p_accept: accept }));
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

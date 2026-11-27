import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_KEY, CLOUD_URL } from './config';
import { parseAdminStats } from './adminStats';
import { CloudError, type AddFriendResult, type CloudBackend, type CloudProfile, type CloudUser, type PresenceUpdate, type RemoteFriend, type UserDataRead, type UserDataWrite } from './types';

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
  if (/email not confirmed/i.test(msg)) return new CloudError('Please confirm your email first. Tap the link we sent you, then sign in.', 'unconfirmed');
  if (/invalid login credentials/i.test(msg)) return new CloudError('Wrong email or password.', 'auth');
  if (/already registered|already been registered/i.test(msg)) return new CloudError('That email already has an account. Try signing in instead.', 'validation');
  if (/password should be|weak password|password.*(short|least)/i.test(msg)) return new CloudError('Choose a longer password (at least 8 characters).', 'validation');
  if (/unable to validate email|invalid.*email/i.test(msg)) return new CloudError('That email address doesn’t look right.', 'validation');
  if (/not authorized|not allowed|not in.*(team|organi[sz]ation)/i.test(msg)) return new CloudError('This app’s email sender can only email approved addresses right now. The app’s owner needs to finish the email setup.', 'server');
  if (/error sending (confirmation|recovery|magic)/i.test(msg)) return new CloudError('We couldn’t send the email just now. Wait a minute and try again.', 'server');
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) return new CloudError('Too many attempts. Please wait a few minutes and try again.', 'rate-limit');
  if (/failed to fetch|network|load failed/i.test(msg)) return new CloudError('Can’t reach the server. Check your connection and try again.', 'network');
  if (/not signed in|jwt|invalid claim|user from sub claim|refresh token/i.test(msg)) return new CloudError('You’ve been signed out. Please sign in again.', 'auth');
  if (/not allowed/i.test(msg) && err?.code === 'P0001') return new CloudError('Only the app’s owner can open the dashboard.', 'validation');
  if (/admin_stats|is_admin|log_event/i.test(msg) && /could not find the function|schema cache/i.test(msg)) return new CloudError('The dashboard needs the latest setup SQL. Run supabase/schema.sql again in Supabase.', 'server');
  if (/sync_get|sync_put|sync_delete|user_data/i.test(msg) && /could not find|schema cache|does not exist/i.test(msg)) return new CloudError('Syncing needs the latest setup SQL. The app’s owner needs to run supabase/schema.sql again in Supabase.', 'server');
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

  const userOf = (u: { id: string; email?: string | null }): CloudUser => ({ id: u.id, email: u.email ?? '' });

  return {
    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session ? userOf(data.session.user) : null;
    },
    async signUp(email, password, redirectTo) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      if (error) throw wrap(error);
      // For an address that already has an account, Supabase answers "success" with no identities (to avoid revealing who is registered).
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new CloudError('That email already has an account. Try signing in instead.', 'validation');
      }
      return data.session && data.user ? { status: 'signed-in', user: userOf(data.user) } : { status: 'confirm-email' };
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw wrap(error);
      return userOf(data.user);
    },
    async resendConfirmation(email, redirectTo) {
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
      if (error) throw wrap(error);
    },
    async sendPasswordReset(email, redirectTo) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw wrap(error);
    },
    async setSession(accessToken, refreshToken) {
      const { data, error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw wrap(error);
      const u = data.user ?? data.session?.user;
      if (!u) throw new CloudError('Sign-in didn’t complete. Please try again.', 'auth');
      return userOf(u);
    },
    async updatePassword(newPassword) {
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw wrap(error);
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

    async getUserData(sinceRev) {
      const r = await run<{ rev: number | string; doc?: unknown; unchanged?: boolean }>(sb.rpc('sync_get', { p_since: sinceRev }));
      return { rev: Number(r?.rev ?? 0), doc: r?.doc ?? null, unchanged: r?.unchanged === true } satisfies UserDataRead;
    },
    async putUserData(doc, baseRev) {
      const r = await run<{ status: 'ok' | 'conflict'; rev: number | string }>(sb.rpc('sync_put', { p_doc: doc, p_base_rev: baseRev }));
      return { status: r.status === 'ok' ? 'ok' : 'conflict', rev: Number(r.rev) } satisfies UserDataWrite;
    },
    async deleteUserData() {
      await run(sb.rpc('sync_delete'));
    },

    async logEvent(deviceId, name) {
      await run(sb.rpc('log_event', { p_device: deviceId, p_name: name }));
    },
    async forgetDevice(deviceId) {
      await run(sb.rpc('forget_device', { p_device: deviceId }));
    },
    async isAdmin() {
      return (await run<boolean>(sb.rpc('is_admin'))) === true;
    },
    async adminStats(timeZone) {
      return parseAdminStats(await run<unknown>(sb.rpc('admin_stats', { p_tz: timeZone })));
    },
  };
}

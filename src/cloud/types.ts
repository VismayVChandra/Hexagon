import type { AdminStats } from './adminStats';
import type { AnalyticsEvent } from './analytics';

/** Shapes shared by the cloud layer. The backend itself lives behind `CloudBackend`. */

export interface CloudUser {
  id: string;
  email: string;
}

export interface CloudProfile {
  id: string;
  displayName: string;
  /** 6 digits. Whoever types this in becomes a friend. */
  friendCode: string;
  sharePresence: boolean;
  shareSubject: boolean;
}

/** A friend, with presence only if they chose to share it. */
export interface RemoteFriend {
  friendshipId: string;
  id: string;
  name: string;
  state: 'online' | 'studying' | 'finished' | null;
  subject: string | null;
  sessionMs: number;
  roomId: string | null;
  /** ISO timestamp of the last presence update. */
  updatedAt: string | null;
}

export interface PresenceUpdate {
  state: 'online' | 'studying' | 'finished';
  subject: string | null;
  sessionMs: number;
  roomId: string | null;
}

export type AddFriendResult = { status: 'added' | 'already'; name: string } | { status: 'not_found' | 'self' | 'limited' };

/** What the account holds of the student's study data. `doc` is absent when nothing changed since `sinceRev`, or nothing is saved yet. */
export interface UserDataRead {
  rev: number;
  doc: unknown | null;
  unchanged: boolean;
}

export type UserDataWrite = { status: 'ok'; rev: number } | { status: 'conflict'; rev: number };

export type SignUpResult = { status: 'signed-in'; user: CloudUser } | { status: 'confirm-email' };

/**
 * Everything the app needs from a server. Supabase is the real implementation;
 * a small in-memory mock exists for development. Errors are thrown as `CloudError`.
 *
 * Accounts are email + password, so a student keeps their code and friends on any phone.
 */
export interface CloudBackend {
  /** The signed-in account saved on this device, if any. */
  getUser(): Promise<CloudUser | null>;
  /** Create an account. If the project requires email confirmation, resolves to 'confirm-email' and sends the link. */
  signUp(email: string, password: string, redirectTo: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<CloudUser>;
  resendConfirmation(email: string, redirectTo: string): Promise<void>;
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** Sign in with tokens from an email link (confirmation or password reset). */
  setSession(accessToken: string, refreshToken: string): Promise<CloudUser>;
  /** Set a new password for the signed-in account (after a reset link). */
  updatePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  /** Called when the session ends elsewhere. */
  onSignedOut(cb: () => void): () => void;

  getProfile(): Promise<CloudProfile | null>;
  /** Create the profile (and its friend code) on first call, rename it afterwards. */
  saveProfile(displayName: string): Promise<CloudProfile>;
  /** Replace my friend code. Existing friends stay. */
  regenerateCode(): Promise<string>;
  setSharing(sharePresence: boolean, shareSubject: boolean): Promise<void>;

  listFriends(): Promise<RemoteFriend[]>;
  /** Type in a friend's code. Friendship is immediate and mutual. */
  addFriendByCode(code: string): Promise<AddFriendResult>;
  removeFriendship(id: string): Promise<void>;

  setPresence(p: PresenceUpdate): Promise<void>;
  clearPresence(): Promise<void>;
  deleteMyData(): Promise<void>;

  /** The study data saved in my account. Pass the revision already held to learn cheaply whether it changed. */
  getUserData(sinceRev: number | null): Promise<UserDataRead>;
  /** Save my study data. Only succeeds if nobody saved since `baseRev` (0 = nothing saved yet); otherwise reports a conflict. */
  putUserData(doc: unknown, baseRev: number): Promise<UserDataWrite>;
  /** Remove the study data saved in my account. */
  deleteUserData(): Promise<void>;

  /** Record one anonymous usage event for this device (see analytics.ts). */
  logEvent(deviceId: string, name: AnalyticsEvent): Promise<void>;
  /** Delete every event recorded for a device. */
  forgetDevice(deviceId: string): Promise<void>;
  /** Is the signed-in account the app's owner? */
  isAdmin(): Promise<boolean>;
  /** Totals for the owner dashboard. Owner only. */
  adminStats(timeZone: string): Promise<AdminStats>;
}

export class CloudError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'rate-limit' | 'auth' | 'validation' | 'unconfirmed' | 'server' = 'server',
  ) {
    super(message);
  }
}

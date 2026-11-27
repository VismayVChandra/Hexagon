/** Shapes shared by the cloud layer. The backend itself lives behind `CloudBackend`. */

export interface CloudUser {
  id: string;
  email: string;
}

export interface CloudProfile {
  id: string;
  displayName: string;
  friendCode: string;
  sharePresence: boolean;
  shareSubject: boolean;
}

/** An accepted friend, with presence only if they chose to share it. */
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

export interface FriendRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  name: string;
  createdAt: string;
}

export interface PresenceUpdate {
  state: 'online' | 'studying' | 'finished';
  subject: string | null;
  sessionMs: number;
  roomId: string | null;
}

/**
 * Everything the app needs from a server. Supabase is the real implementation;
 * a small in-memory mock exists for development. Errors are thrown as `CloudError`.
 */
export interface CloudBackend {
  getUser(): Promise<CloudUser | null>;
  /** Email a one-time sign-in code (and link) to the address. */
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<CloudUser>;
  signOut(): Promise<void>;
  /** Sign in with tokens from an email link (fallback for people who click the link instead of typing the code). */
  setSession(accessToken: string, refreshToken: string): Promise<CloudUser>;
  /** Called when the session ends elsewhere (e.g. it expired). */
  onSignedOut(cb: () => void): () => void;

  getProfile(): Promise<CloudProfile | null>;
  /** Create the profile on first call, rename it afterwards. */
  saveProfile(displayName: string): Promise<CloudProfile>;
  setSharing(sharePresence: boolean, shareSubject: boolean): Promise<void>;

  listFriends(): Promise<RemoteFriend[]>;
  listRequests(): Promise<FriendRequest[]>;
  sendRequest(code: string): Promise<'sent' | 'accepted'>;
  respond(requestId: string, accept: boolean): Promise<void>;
  /** Remove a friend, cancel a request I sent, or decline one. */
  removeFriendship(id: string): Promise<void>;

  setPresence(p: PresenceUpdate): Promise<void>;
  clearPresence(): Promise<void>;
  deleteMyData(): Promise<void>;
}

export class CloudError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'rate-limit' | 'auth' | 'validation' | 'server' = 'server',
  ) {
    super(message);
  }
}

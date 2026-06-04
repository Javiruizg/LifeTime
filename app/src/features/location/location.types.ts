export type LocationRange = 500 | 1000 | 2000;
export type LocationDuration = 30 | 60 | 120;

export interface ConnectLocationInput {
  range: LocationRange;
  durationMinutes: LocationDuration;
}

export interface ConnectLocationResponse {
  range: number;
  expiresAt: string;
}

export interface LocationSession {
  active: boolean;
  range?: number;
  expiresAt?: string;
}

/* ------------------------------------------------------------------ */
/*  WebSocket payload types                                           */
/* ------------------------------------------------------------------ */

export interface LocationUpdatePayload {
  latitude: number;
  longitude: number;
}

export interface VisibleUserProfile {
  id: number;
  userId: number;
  name: string;
  message: string;
  imageUrl: string | null;
}

export interface VisibleUserPayload {
  userId: number;
  latitude: number;
  longitude: number;
  distance: number;
  profile: VisibleUserProfile | null;
}

export interface SessionExpiredPayload {
  reason: 'ttl_expired';
}

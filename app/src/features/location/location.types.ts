export type LocationRange = 500 | 1000 | 2000;
export type LocationDuration = 30 | 60 | 120;

export interface ConnectLocationInput {
  range: LocationRange;
  durationMinutes: LocationDuration;
}

export interface LocationSession {
  active: boolean;
  range?: number;
  expiresAt?: string;
}

export interface ConnectLocationResponse {
  range: number;
  expiresAt: string;
}

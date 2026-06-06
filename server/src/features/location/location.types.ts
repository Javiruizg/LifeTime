export interface LocationSession {
  active: boolean;
  range?: number;
  expiresAt?: string;
}

export interface ConnectLocationResult {
  range: number;
  expiresAt: string;
}

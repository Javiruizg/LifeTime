export interface ProfileResponse {
  id: number;
  userId: number;
  name: string;
  message: string;
  imageUrl: string | null;
}

export interface UpdateProfileInput {
  name?: string;
  message?: string;
}

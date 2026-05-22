export interface ProfileResponse {
  id: number;
  userId: number;
  name: string;
  message: string;
  imageUrl: string;
}

export interface UpdateProfileInput {
  name?: string;
  message?: string;
}

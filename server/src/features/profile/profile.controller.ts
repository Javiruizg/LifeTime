import { Response } from 'express';
import { ProfileService } from './profile.service';
import { updateProfileSchema } from './profile.validation';
import type { AuthenticatedRequest } from '../../shared/types/auth';

const profileService = new ProfileService();

export async function getProfileController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const profile = await profileService.getMyProfile(req.user!.id);
    res.status(200).json(profile);
  } catch (err) {
    if (err instanceof Error && err.message === 'Profile not found') {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateProfileController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const validation = updateProfileSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid input', details: validation.error.flatten() });
      return;
    }

    const profile = await profileService.updateProfile(req.user!.id, validation.data);
    res.status(200).json(profile);
  } catch (err) {
    if (err instanceof Error && err.message === 'Profile not found') {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

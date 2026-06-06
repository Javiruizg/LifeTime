import { Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/types/auth';
import { connectLocationSchema } from './location.validation';
import {
  connectUserLocation,
  disconnectUserLocation,
  getUserLocationStatus,
} from './location.service';

export async function connectLocationController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const validation = connectLocationSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid input', details: validation.error.flatten() });
      return;
    }

    const { range, durationMinutes } = validation.data;
    const result = await connectUserLocation(req.user!.id, range, durationMinutes);

    res.status(200).json(result);
  } catch (error) {
    console.error('Connect location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function disconnectLocationController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    await disconnectUserLocation(req.user!.id);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Disconnect location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getLocationStatusController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const status = await getUserLocationStatus(req.user!.id);
    res.status(200).json(status);
  } catch (error) {
    console.error('Get location status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

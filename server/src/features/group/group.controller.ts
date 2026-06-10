import type { Request, Response } from 'express';
import { nearbyGroupsQuerySchema, joinGroupParamsSchema } from './group.validation';
import { getNearbyGroups, joinGroup } from './group.service';
import type { AuthenticatedRequest } from '../../shared/types/auth';

export async function getNearbyGroupsController(req: Request, res: Response) {
  try {
    const queryValidation = nearbyGroupsQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: queryValidation.error.flatten(),
      });
    }

    const { lat, lng, radius } = queryValidation.data;
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = authReq.user.id;

    const groups = await getNearbyGroups(lat, lng, radius, userId);

    return res.status(200).json({
      success: true,
      groups,
    });
  } catch (error) {
    console.error('Get nearby groups error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function joinGroupController(req: Request, res: Response) {
  try {
    const paramsValidation = joinGroupParamsSchema.safeParse(req.params);
    if (!paramsValidation.success) {
      return res.status(400).json({
        error: 'Invalid parameters',
        details: paramsValidation.error.flatten(),
      });
    }

    const { chatId } = paramsValidation.data;
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = authReq.user.id;

    await joinGroup(chatId, userId);

    return res.status(200).json({
      success: true,
      message: 'Joined group successfully',
    });
  } catch (error) {
    console.error('Join group error:', error);

    if (error instanceof Error) {
      if (error.message === 'User does not have an active location session') {
        return res.status(403).json({ error: 'Active location session required' });
      }
      if (error.message === 'User is too far from the group') {
        return res.status(403).json({ error: 'You are too far from this group' });
      }
      if (error.message === 'Group not found') {
        return res.status(404).json({ error: 'Group not found' });
      }
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
}

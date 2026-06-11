import { Response } from 'express';
import { ZodError } from 'zod';
import type { AuthenticatedRequest } from '../../shared/types/auth';
import {
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriendship,
  getFriends,
  getReceivedRequests,
  getFriendStatus,
} from './friends.service';
import {
  sendFriendRequestSchema,
  receiverIdParamsSchema,
  requestIdParamsSchema,
  friendIdParamsSchema,
  userIdParamsSchema,
} from './friends.validation';

export async function sendFriendRequestController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = sendFriendRequestSchema.parse(req.body);
    await sendFriendRequest(userId, body.receiverId);
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.issues });
      return;
    }
    if (err instanceof Error) {
      if (err.message === 'Cannot send friend request to yourself') {
        res.status(400).json({ error: err.message });
        return;
      }
      if (
        err.message.includes('Already friends') ||
        err.message.includes('Friend request')
      ) {
        res.status(409).json({ error: err.message });
        return;
      }
    }
    console.error('sendFriendRequest error:', err);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
}

export async function cancelFriendRequestController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = receiverIdParamsSchema.parse(req.params);
    await cancelFriendRequest(userId, params.receiverId);
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid parameters', details: err.issues });
      return;
    }
    if (err instanceof Error && err.message === 'No pending friend request found') {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('cancelFriendRequest error:', err);
    res.status(500).json({ error: 'Failed to cancel friend request' });
  }
}

export async function acceptFriendRequestController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = requestIdParamsSchema.parse(req.params);
    await acceptFriendRequest(userId, params.requestId);
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid parameters', details: err.issues });
      return;
    }
    if (err instanceof Error && err.message === 'Friend request not found') {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('acceptFriendRequest error:', err);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
}

export async function rejectFriendRequestController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = requestIdParamsSchema.parse(req.params);
    await rejectFriendRequest(userId, params.requestId);
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid parameters', details: err.issues });
      return;
    }
    if (err instanceof Error && err.message === 'Friend request not found') {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('rejectFriendRequest error:', err);
    res.status(500).json({ error: 'Failed to reject friend request' });
  }
}

export async function removeFriendController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = friendIdParamsSchema.parse(req.params);
    await removeFriendship(userId, params.friendId);
    res.status(200).json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid parameters', details: err.issues });
      return;
    }
    console.error('removeFriend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
}

export async function getFriendsController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const friends = await getFriends(userId);
    res.status(200).json(friends);
  } catch (err) {
    console.error('getFriends error:', err);
    res.status(500).json({ error: 'Failed to get friends' });
  }
}

export async function getReceivedRequestsController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const requests = await getReceivedRequests(userId);
    res.status(200).json(requests);
  } catch (err) {
    console.error('getReceivedRequests error:', err);
    res.status(500).json({ error: 'Failed to get friend requests' });
  }
}

export async function getFriendStatusController(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const params = userIdParamsSchema.parse(req.params);
    const status = await getFriendStatus(userId, params.userId);
    res.status(200).json(status);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid parameters', details: err.issues });
      return;
    }
    console.error('getFriendStatus error:', err);
    res.status(500).json({ error: 'Failed to get friend status' });
  }
}

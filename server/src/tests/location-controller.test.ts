import {
  connectLocationController,
  disconnectLocationController,
  getLocationStatusController,
} from '../features/location/location.controller';
import * as locationService from '../features/location/location.service';
import type { AuthenticatedRequest } from '../shared/types/auth';
import type { Response } from 'express';

jest.mock('../features/location/location.service');

const mockService = locationService as jest.Mocked<typeof locationService>;

function createMockReq(userId: number, body: any = {}): AuthenticatedRequest {
  return {
    user: { id: userId },
    body,
  } as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

describe('Location Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectLocationController', () => {
    it('should return 200 with result on valid input', async () => {
      const req = createMockReq(42, { range: 1000, durationMinutes: 60 });
      const res = createMockRes();
      mockService.connectUserLocation.mockResolvedValue({
        range: 1000,
        expiresAt: '2026-01-01T00:00:00.000Z',
      });

      await connectLocationController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        range: 1000,
        expiresAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('should return 400 on invalid input', async () => {
      const req = createMockReq(42, { range: 999, durationMinutes: 60 });
      const res = createMockRes();

      await connectLocationController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid input' })
      );
    });

    it('should return 500 on service error', async () => {
      const req = createMockReq(42, { range: 1000, durationMinutes: 60 });
      const res = createMockRes();
      mockService.connectUserLocation.mockRejectedValue(new Error('Redis down'));

      await connectLocationController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('disconnectLocationController', () => {
    it('should return 200 on success', async () => {
      const req = createMockReq(42);
      const res = createMockRes();
      mockService.disconnectUserLocation.mockResolvedValue();

      await disconnectLocationController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq(42);
      const res = createMockRes();
      mockService.disconnectUserLocation.mockRejectedValue(new Error('fail'));

      await disconnectLocationController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getLocationStatusController', () => {
    it('should return 200 with status', async () => {
      const req = createMockReq(42);
      const res = createMockRes();
      mockService.getUserLocationStatus.mockResolvedValue({ active: false });

      await getLocationStatusController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ active: false });
    });

    it('should return 500 on error', async () => {
      const req = createMockReq(42);
      const res = createMockRes();
      mockService.getUserLocationStatus.mockRejectedValue(new Error('fail'));

      await getLocationStatusController(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

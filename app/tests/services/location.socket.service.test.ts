import { startSharing, stopSharing } from '../../src/features/location/location.socket.service';
import { connectSocket, disconnectSocket, getSocket } from '../../src/shared/lib/socket';
import * as Location from 'expo-location';

jest.mock('../../src/shared/lib/socket', () => ({
  connectSocket: jest.fn(),
  disconnectSocket: jest.fn(),
  getSocket: jest.fn(),
}));

jest.mock('expo-location', () => ({
  watchPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const mockConnectSocket = connectSocket as jest.MockedFunction<typeof connectSocket>;
const mockDisconnectSocket = disconnectSocket as jest.MockedFunction<typeof disconnectSocket>;
const mockGetSocket = getSocket as jest.MockedFunction<typeof getSocket>;
const mockWatchPosition = Location.watchPositionAsync as jest.MockedFunction<typeof Location.watchPositionAsync>;

describe('Location Socket Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopSharing();
  });

  describe('startSharing', () => {
    it('should connect socket and start watching position', async () => {
      mockConnectSocket.mockResolvedValue({} as any);
      const mockRemove = jest.fn();
      mockWatchPosition.mockResolvedValue({ remove: mockRemove } as any);

      await startSharing();

      expect(mockConnectSocket).toHaveBeenCalled();
      expect(mockWatchPosition).toHaveBeenCalledWith(
        expect.objectContaining({ accuracy: 3 }),
        expect.any(Function)
      );
    });

    it('should emit location:update when position changes', async () => {
      mockConnectSocket.mockResolvedValue({} as any);
      const mockEmit = jest.fn();
      mockGetSocket.mockReturnValue({ emit: mockEmit } as any);

      let positionCallback: ((pos: any) => void) | null = null;
      mockWatchPosition.mockImplementation(async (_opts: any, callback: any) => {
        positionCallback = callback;
        return { remove: jest.fn() } as any;
      });

      await startSharing();

      positionCallback!({
        coords: { latitude: 37.38, longitude: -5.99 },
      });

      expect(mockEmit).toHaveBeenCalledWith('location:update', {
        latitude: 37.38,
        longitude: -5.99,
      });
    });

    it('should call onPosition callback when provided', async () => {
      mockConnectSocket.mockResolvedValue({} as any);
      const onPosition = jest.fn();

      let positionCallback: ((pos: any) => void) | null = null;
      mockWatchPosition.mockImplementation(async (_opts: any, callback: any) => {
        positionCallback = callback;
        return { remove: jest.fn() } as any;
      });

      await startSharing(onPosition);

      positionCallback!({
        coords: { latitude: 37.38, longitude: -5.99 },
      });

      expect(onPosition).toHaveBeenCalledWith({
        latitude: 37.38,
        longitude: -5.99,
      });
    });

    it('should not start if already watching', async () => {
      mockConnectSocket.mockResolvedValue({} as any);
      mockWatchPosition.mockResolvedValue({ remove: jest.fn() } as any);

      await startSharing();
      await startSharing();

      expect(mockConnectSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopSharing', () => {
    it('should remove watcher and disconnect socket', async () => {
      mockConnectSocket.mockResolvedValue({} as any);
      const mockRemove = jest.fn();
      mockWatchPosition.mockResolvedValue({ remove: mockRemove } as any);

      await startSharing();
      stopSharing();

      expect(mockRemove).toHaveBeenCalled();
      expect(mockDisconnectSocket).toHaveBeenCalled();
    });

    it('should be safe to call without starting', () => {
      expect(() => stopSharing()).not.toThrow();
      expect(mockDisconnectSocket).toHaveBeenCalled();
    });
  });
});

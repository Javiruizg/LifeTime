import * as Location from 'expo-location';
import { connectSocket, disconnectSocket, getSocket } from '../../shared/lib/socket';

let locationWatcher: Location.LocationSubscription | null = null;
let isStarting = false;

/**
 * Start watching the device's GPS and publishing updates to the server
 * via the shared WebSocket connection.
 *
 * Uses the same accuracy settings as HomeScreen:
 *   - accuracy: Balanced
 *   - distanceInterval: 20 metres
 *   - timeInterval: 7000 ms
 *
 * Optionally pass `onPosition` to receive coordinates for UI rendering.
 */
export async function startSharing(
  onPosition?: (coords: { latitude: number; longitude: number }) => void
): Promise<void> {
  if (locationWatcher || isStarting) {
    return;
  }

  isStarting = true;

  try {
    await connectSocket();

    locationWatcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 20,
        timeInterval: 7000,
      },
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        getSocket()?.emit('location:update', coords);
        onPosition?.(coords);
      }
    );
  } finally {
    isStarting = false;
  }
}

/**
 * Stop the GPS watcher and tear down the WebSocket connection.
 * Safe to call even if sharing was never started.
 */
export function stopSharing(): void {
  if (locationWatcher) {
    locationWatcher.remove();
    locationWatcher = null;
  }
  disconnectSocket();
}

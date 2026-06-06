import redis from '../shared/lib/redis';

const SESSION_KEY_PREFIX = 'location:session';
const GEO_KEY = 'geo:connected_users';

interface Point {
  lat: number;
  lng: number;
}

/**
 * Linear interpolation between two points.
 * t = 0 → start, t = 1 → end
 */
function lerp(start: Point, end: Point, t: number): Point {
  return {
    lat: start.lat + (end.lat - start.lat) * t,
    lng: start.lng + (end.lng - start.lng) * t,
  };
}

async function updateMockUser(userId: number, lat: number, lng: number, range: number): Promise<void> {
  const key = `${SESSION_KEY_PREFIX}:${userId}`;
  await redis.hset(key, 'range', String(range), 'lat', String(lat), 'lng', String(lng));
  await redis.geoadd(GEO_KEY, lng, lat, String(userId));
}

async function cleanupUser(userId: number): Promise<void> {
  await redis.del(`${SESSION_KEY_PREFIX}:${userId}`);
  await redis.zrem(GEO_KEY, String(userId));
}

async function findRealUserLocation(): Promise<{ lat: number; lng: number } | null> {
  const keys = await redis.keys(`${SESSION_KEY_PREFIX}:*`);
  for (const key of keys) {
    const userId = Number(key.split(':').pop());
    if (!userId || userId >= 9000) continue;

    const session = await redis.hgetall(key);
    if (session && session.lat && session.lng) {
      return {
        lat: parseFloat(session.lat),
        lng: parseFloat(session.lng),
      };
    }
  }
  return null;
}

async function runMovingUserSimulation(): Promise<void> {
  console.log('🔧 Connecting to Redis...');
  await redis.connect();

  const MOVING_USER_ID = 9005;
  const UPDATE_INTERVAL_MS = 2000; // Update position every 2 seconds
  const STEPS = 40; // Total steps in the journey

  // Cleanup any stale data
  await cleanupUser(MOVING_USER_ID);

  // Find real user to center the path around them
  const realUser = await findRealUserLocation();
  if (!realUser) {
    console.error('❌ No real user session found in Redis. Connect your app first!');
    await redis.quit();
    process.exit(1);
  }

  const center = realUser;
  console.log(`📡 Real user at (${center.lat}, ${center.lng})`);

  /*
   * Path: approach from 1 km north → pass within 50 m → continue 1 km south
   * ~0.009° ≈ 1 km in latitude
   */
  const start: Point = { lat: center.lat + 0.009, lng: center.lng };
  const passBy: Point = { lat: center.lat + 0.00045, lng: center.lng + 0.0002 }; // ~50 m east
  const end: Point = { lat: center.lat - 0.009, lng: center.lng };

  // Split journey: approach (start → passBy) + departure (passBy → end)
  const approachSteps = Math.floor(STEPS * 0.4);
  const departSteps = STEPS - approachSteps;

  const movingRange = 5000; // Large range so they see you too (mutual visibility)

  console.log('\n🚶 Moving user simulation starting...');
  console.log(`   Start:   (${start.lat}, ${start.lng})`);
  console.log(`   Pass-by: (${passBy.lat}, ${passBy.lng})`);
  console.log(`   End:     (${end.lat}, ${end.lng})`);
  console.log(`   Total duration: ~${(STEPS * UPDATE_INTERVAL_MS / 1000).toFixed(0)}s`);
  console.log(`   Press Ctrl+C to stop early\n`);

  let step = 0;

  const intervalId = setInterval(async () => {
    try {
      let pos: Point;

      if (step < approachSteps) {
        const t = step / approachSteps;
        pos = lerp(start, passBy, t);
      } else {
        const t = (step - approachSteps) / departSteps;
        pos = lerp(passBy, end, t);
      }

      await updateMockUser(MOVING_USER_ID, pos.lat, pos.lng, movingRange);

      const distMeters = Math.round(
        Math.sqrt(
          Math.pow((pos.lat - center.lat) * 111000, 2) +
          Math.pow((pos.lng - center.lng) * 111000 * Math.cos(center.lat * Math.PI / 180), 2)
        )
      );

      process.stdout.write(`\r   Step ${step + 1}/${STEPS} | Pos: (${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}) | Dist: ${distMeters}m`);

      step++;

      if (step >= STEPS) {
        clearInterval(intervalId);
        console.log('\n\n✅ Simulation complete. Cleaning up...');
        await cleanupUser(MOVING_USER_ID);
        await redis.quit();
        process.exit(0);
      }
    } catch (err) {
      console.error('\n❌ Error during simulation:', err);
      clearInterval(intervalId);
      await cleanupUser(MOVING_USER_ID);
      await redis.quit();
      process.exit(1);
    }
  }, UPDATE_INTERVAL_MS);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping simulation...');
    clearInterval(intervalId);
    await cleanupUser(MOVING_USER_ID);
    await redis.quit();
    process.exit(0);
  });
}

runMovingUserSimulation().catch((err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});

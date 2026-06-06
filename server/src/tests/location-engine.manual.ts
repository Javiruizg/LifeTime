import redis from '../shared/lib/redis';
import { findVisibleUsersFor } from '../features/location/location.engine';

const SESSION_KEY_PREFIX = 'location:session';
const GEO_KEY = 'geo:connected_users';
const MOCK_IDS = [9001, 9002, 9003];

async function seedUser(userId: number, lat: number, lng: number, range: number): Promise<void> {
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
    const userId = key.split(':').pop();
    if (!userId || MOCK_IDS.includes(Number(userId))) continue;

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

async function runTest(): Promise<void> {
  console.log('🔧 Connecting to Redis...');
  await redis.connect();

  const [userA, userB, userC] = MOCK_IDS;

  // Cleanup any stale data from previous runs
  await cleanupUser(userA);
  await cleanupUser(userB);
  await cleanupUser(userC);

  /* ------------------------------------------------------------------ */
  /*  Detect the real app user's location and seed fakes right next    */
  /*  to them with a huge range so mutual visibility is guaranteed.     */
  /* ------------------------------------------------------------------ */
  const realUser = await findRealUserLocation();

  const BASE_LAT = realUser?.lat ?? 37.38;
  const BASE_LNG = realUser?.lng ?? -5.99;
  const TEST_RANGE = 5000; // 5 km — guarantees visibility regardless of offset

  if (realUser) {
    console.log(`📡 Found real user at (${BASE_LAT}, ${BASE_LNG})`);
  } else {
    console.log(`⚠️  No real user session found; falling back to default (${BASE_LAT}, ${BASE_LNG})`);
  }

  // Seed ~111 m apart so they're distinct on the map
  await seedUser(userA, BASE_LAT + 0.001, BASE_LNG - 0.001, TEST_RANGE);
  await seedUser(userB, BASE_LAT + 0.002, BASE_LNG + 0.000, TEST_RANGE);
  await seedUser(userC, BASE_LAT - 0.001, BASE_LNG - 0.002, TEST_RANGE);

  console.log('\n📍 Seeded mock users:');
  console.log(`   A at (${BASE_LAT + 0.001}, ${BASE_LNG - 0.001}) range=${TEST_RANGE}m`);
  console.log(`   B at (${BASE_LAT + 0.002}, ${BASE_LNG + 0.000}) range=${TEST_RANGE}m`);
  console.log(`   C at (${BASE_LAT - 0.001}, ${BASE_LNG - 0.002}) range=${TEST_RANGE}m`);
  console.log();

  console.log('🔍 Checking visibility for each user (self-contained test)...');
  console.log();

  console.log('🔍 findVisibleUsersFor(A)');
  const visibleFromA = await findVisibleUsersFor(userA);
  console.log('   Result:', visibleFromA.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [B, C, real user]');
  console.log();

  console.log('🔍 findVisibleUsersFor(B)');
  const visibleFromB = await findVisibleUsersFor(userB);
  console.log('   Result:', visibleFromB.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [A, C, real user]');
  console.log();

  console.log('🔍 findVisibleUsersFor(C)');
  const visibleFromC = await findVisibleUsersFor(userC);
  console.log('   Result:', visibleFromC.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [A, B, real user]');
  console.log();

  if (realUser) {
    // Find the real user ID for the final check
    const keys = await redis.keys(`${SESSION_KEY_PREFIX}:*`);
    const realUserId = keys
      .map((k) => Number(k.split(':').pop()))
      .find((id) => !MOCK_IDS.includes(id) && id > 0);

    if (realUserId) {
      console.log(`🔍 findVisibleUsersFor(real user ${realUserId})`);
      const visibleFromReal = await findVisibleUsersFor(realUserId);
      console.log('   Result:', visibleFromReal.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
      console.log('   Expected: [A, B, C]');
      console.log();
    }
  }

  // Test lazy cleanup
  console.log('🧹 Testing lazy cleanup...');
  const ghostUser = 9999;
  await redis.geoadd(GEO_KEY, BASE_LNG, BASE_LAT + 0.003, String(ghostUser));
  // No session hash for ghostUser
  const visibleFromAWithGhost = await findVisibleUsersFor(userA);
  const ghostStillInGeo = await redis.zscore(GEO_KEY, String(ghostUser));
  console.log('   Ghost user in geo after cleanup check:', ghostStillInGeo !== null ? 'YES (BUG)' : 'NO (removed)');
  console.log();

  console.log('✅ Redis seeded. If your app is connected nearby, you should see');
  console.log('   markers appear on the map within ~7 seconds.');
  console.log();

  // Leave data in Redis for the running server to pick up.
  // Do NOT clean up here — the app test needs it.
  await redis.quit();
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

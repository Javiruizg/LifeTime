import redis from '../shared/lib/redis';
import { updateUserLocation, findVisibleUsersFor } from '../features/location/location.engine';

const SESSION_KEY_PREFIX = 'location:session';
const GEO_KEY = 'geo:connected_users';

async function seedUser(userId: number, lat: number, lng: number, range: number): Promise<void> {
  const key = `${SESSION_KEY_PREFIX}:${userId}`;
  await redis.hset(key, 'range', String(range), 'lat', String(lat), 'lng', String(lng));
  await redis.geoadd(GEO_KEY, lng, lat, String(userId));
}

async function cleanupUser(userId: number): Promise<void> {
  await redis.del(`${SESSION_KEY_PREFIX}:${userId}`);
  await redis.zrem(GEO_KEY, String(userId));
}

async function runTest(): Promise<void> {
  console.log('🔧 Connecting to Redis...');
  await redis.connect();

  const userA = 9001;
  const userB = 9002;
  const userC = 9003;

  // Cleanup any stale data from previous runs
  await cleanupUser(userA);
  await cleanupUser(userB);
  await cleanupUser(userC);

  /* ------------------------------------------------------------------ */
  /*  Seed fake users near Seville (app default location)                */
  /*  ~0.001° ≈ 111 m.  A at (37.381, -5.991), B at (37.382, -5.990),    */
  /*  C at (37.379, -5.992).  All within 500 m of the default.            */
  /* ------------------------------------------------------------------ */
  const BASE_LAT = 37.38;
  const BASE_LNG = -5.99;

  await seedUser(userA, BASE_LAT + 0.001, BASE_LNG - 0.001, 500);
  await seedUser(userB, BASE_LAT + 0.002, BASE_LNG + 0.000, 1000);
  await seedUser(userC, BASE_LAT - 0.001, BASE_LNG - 0.002, 2000);

  console.log('\n📍 Seeded users near app default location:');
  console.log(`   A at (${BASE_LAT + 0.001}, ${BASE_LNG - 0.001}) with range 500m`);
  console.log(`   B at (${BASE_LAT + 0.002}, ${BASE_LNG + 0.000}) with range 1000m`);
  console.log(`   C at (${BASE_LAT - 0.001}, ${BASE_LNG - 0.002}) with range 2000m`);
  console.log();

  console.log('🔍 Checking visibility for each user (self-contained test)...');
  console.log();

  console.log('🔍 findVisibleUsersFor(A)');
  const visibleFromA = await findVisibleUsersFor(userA);
  console.log('   Result:', visibleFromA.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [B] (C is outside A\'s 500m range)');
  console.log();

  console.log('🔍 findVisibleUsersFor(B)');
  const visibleFromB = await findVisibleUsersFor(userB);
  console.log('   Result:', visibleFromB.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [A, C]');
  console.log();

  console.log('🔍 findVisibleUsersFor(C)');
  const visibleFromC = await findVisibleUsersFor(userC);
  console.log('   Result:', visibleFromC.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [B] (A is outside A\'s own range, so mutual fails)');
  console.log();

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
  console.log('   cyan-bordered markers appear on the map within ~7 seconds.');
  console.log();

  // Leave data in Redis for the running server to pick up.
  // Do NOT clean up here — the app test needs it.
  await redis.quit();
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

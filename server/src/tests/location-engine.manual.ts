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

  console.log('\n📍 Seeding users...');
  // Use small longitude deltas so distances are in meters (at equator ~111m per 0.001 deg)
  // A at (0, 0), range 500m
  // B at (0, 0.004) ≈ 444m from A, range 1000m
  // C at (0, 0.009) ≈ 1000m from A, ~556m from B, range 2000m
  await seedUser(userA, 0, 0, 500);
  await seedUser(userB, 0, 0.004, 1000);
  await seedUser(userC, 0, 0.009, 2000);

  console.log('   A at (0, 0) with range 500m');
  console.log('   B at (0, 0.004) with range 1000m');
  console.log('   C at (0, 0.009) with range 2000m');
  console.log();

  console.log('🔍 findVisibleUsersFor(A)');
  const visibleFromA = await findVisibleUsersFor(userA);
  console.log('   Result:', visibleFromA.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [B]');
  const aHasB = visibleFromA.some((u) => u.userId === String(userB));
  const aHasC = visibleFromA.some((u) => u.userId === String(userC));
  console.log('   ✅ A sees B:', aHasB);
  console.log('   ❌ A sees C:', aHasC);
  console.log();

  console.log('🔍 findVisibleUsersFor(B)');
  const visibleFromB = await findVisibleUsersFor(userB);
  console.log('   Result:', visibleFromB.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [A, C]');
  const bHasA = visibleFromB.some((u) => u.userId === String(userA));
  const bHasC = visibleFromB.some((u) => u.userId === String(userC));
  console.log('   ✅ B sees A:', bHasA);
  console.log('   ✅ B sees C:', bHasC);
  console.log();

  console.log('🔍 findVisibleUsersFor(C)');
  const visibleFromC = await findVisibleUsersFor(userC);
  console.log('   Result:', visibleFromC.map((u) => `user ${u.userId} at ${u.distance.toFixed(1)}m`));
  console.log('   Expected: [B] (A is outside A\'s own range, so mutual fails)');
  const cHasA = visibleFromC.some((u) => u.userId === String(userA));
  const cHasB = visibleFromC.some((u) => u.userId === String(userB));
  console.log('   ❌ C sees A:', cHasA);
  console.log('   ✅ C sees B:', cHasB);
  console.log();

  // Test lazy cleanup
  console.log('🧹 Testing lazy cleanup...');
  const ghostUser = 9999;
  await redis.geoadd(GEO_KEY, 0, 0.002, String(ghostUser));
  // No session hash for ghostUser
  const visibleFromAWithGhost = await findVisibleUsersFor(userA);
  const ghostStillInGeo = await redis.zscore(GEO_KEY, String(ghostUser));
  console.log('   Ghost user in geo after cleanup check:', ghostStillInGeo !== null ? 'YES (BUG)' : 'NO (removed)');
  console.log();

  // Cleanup
  console.log('🧹 Cleaning up test data...');
  await cleanupUser(userA);
  await cleanupUser(userB);
  await cleanupUser(userC);
  await redis.zrem(GEO_KEY, String(ghostUser));

  console.log('✅ Done');
  await redis.quit();
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

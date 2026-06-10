import redis from '../src/shared/lib/redis';

async function cleanup(): Promise<void> {
  await redis.connect();

  console.log('🧹 Limpiando flags huérfanos en Redis...\n');

  const keys = await redis.keys('user:groups:*');
  for (const key of keys) {
    const groups = await redis.smembers(key);
    const userId = key.split(':').pop();
    for (const chatId of groups) {
      await redis.srem(`${USER_GROUPS_PREFIX}:${userId}`, String(chatId));
      await redis.srem(`${GROUP_MEMBERS_PREFIX}:${chatId}`, String(userId));
      console.log(`   ✅ Eliminado: ${key} → chatId ${chatId}`);
    }
  }

  // Also clean any group:members keys that might exist
  const membersKeys = await redis.keys('group:members:*');
  for (const key of membersKeys) {
    await redis.del(key);
    console.log(`   ✅ Eliminado: ${key}`);
  }

  console.log('\n🧹 Limpiando locks huérfanos...');
  const lockKeys = await redis.keys('group:creation_lock:*');
  for (const key of lockKeys) {
    await redis.del(key);
    console.log(`   ✅ Eliminado lock: ${key}`);
  }

  console.log('\n✅ Redis limpiado completamente.');
  await redis.quit();
}

const USER_GROUPS_PREFIX = 'user:groups';
const GROUP_MEMBERS_PREFIX = 'group:members';

cleanup().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

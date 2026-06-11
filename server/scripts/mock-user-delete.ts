import { prisma } from '../src/shared/lib/prisma';
import redis from '../src/shared/lib/redis';

const SESSION_PREFIX = 'location:session';
const GEO_KEY = 'geo:connected_users';
const USER_GROUPS_PREFIX = 'user:groups';
const GROUP_MEMBERS_PREFIX = 'group:members';

/**
 * Elimina un mock user por completo:
 * - PostgreSQL: User (cascade elimina Profile, ChatMembers, Messages, etc.)
 * - Redis: session, geo, group flags
 */
async function deleteMockUser(userId: number): Promise<void> {
  console.log(`🗑️  Eliminando mock user ${userId}...`);

  // 1. PostgreSQL (cascade delete se encarga del resto)
  try {
    await prisma.user.delete({ where: { id: userId } });
    console.log(`   ✅ PostgreSQL: User ${userId} eliminado`);
  } catch (e: any) {
    if (e.code === 'P2025') {
      console.log(`   ⚠️  PostgreSQL: User ${userId} no existía`);
    } else {
      console.error(`   ❌ Error PostgreSQL:`, e.message);
    }
  }

  // 2. Redis
  await redis.del(`${SESSION_PREFIX}:${userId}`);
  await redis.zrem(GEO_KEY, String(userId));
  await redis.del(`${USER_GROUPS_PREFIX}:${userId}`);
  // Si pertenecía a algún grupo, también lo quitamos del set de miembros
  // (aunque el deleteGroup ya debería haber limpiado eso)
  const groupIds = await redis.keys(`${GROUP_MEMBERS_PREFIX}:*`);
  for (const groupKey of groupIds) {
    await redis.srem(groupKey, String(userId));
  }
  console.log(`   ✅ Redis limpiado para user ${userId}`);
}

// ─── USO ───
// Ejecuta: npx tsx scripts/mock-user-delete.ts 9001
// o: npx tsx scripts/mock-user-delete.ts 9002

async function run(): Promise<void> {
  const userId = Number(process.argv[2]);
  if (!userId || Number.isNaN(userId)) {
    console.error('❌ Uso: npx tsx scripts/mock-user-delete.ts <userId>');
    console.error('   Ejemplo: npx tsx scripts/mock-user-delete.ts 9001');
    process.exit(1);
  }

  await deleteMockUser(userId);
  await redis.quit();
  await prisma.$disconnect();
  console.log('👋 Done');
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

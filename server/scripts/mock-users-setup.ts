import { prisma } from '../src/shared/lib/prisma';
import redis from '../src/shared/lib/redis';

const MOCK_IDS_OLD = [9001, 9002, 9003];
const MOCK_IDS_NEW = [9001, 9002]; // Reutilizamos IDs pero ahora con DB completa
const SESSION_PREFIX = 'location:session';
const GEO_KEY = 'geo:connected_users';
const USER_GROUPS_PREFIX = 'user:groups';
const GROUP_MEMBERS_PREFIX = 'group:members';

// Coordenadas exactas: 37°24'34.6"N 5°59'24.2"W
const BASE_LAT = 37 + 24/60 + 34.6/3600;  // 37.409611
const BASE_LNG = -(5 + 59/60 + 24.2/3600); // -5.990056
const TEST_RANGE = 5000; // 5km para garantizar visibilidad mutua

async function cleanupRedis(userId: number): Promise<void> {
  await redis.del(`${SESSION_PREFIX}:${userId}`);
  await redis.zrem(GEO_KEY, String(userId));
  await redis.del(`${USER_GROUPS_PREFIX}:${userId}`);
  console.log(`  🧹 Redis limpiado para user ${userId}`);
}

async function cleanupPostgres(userId: number): Promise<void> {
  try {
    // Prisma con cascade delete eliminará Profile, ChatMembers, etc.
    await prisma.user.delete({ where: { id: userId } });
    console.log(`  🗑️  PostgreSQL: User ${userId} eliminado (con cascade)`);
  } catch (e: any) {
    if (e.code === 'P2025') {
      console.log(`  ⚠️  PostgreSQL: User ${userId} no existía`);
    } else {
      console.error(`  ❌ Error eliminando user ${userId}:`, e.message);
    }
  }
}

async function createMockUser(userId: number, lat: number, lng: number): Promise<void> {
  const deviceId = `mock-device-${userId}`;

  // 1. Crear en PostgreSQL
  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      deviceId,
    },
  });

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      name: `Mock ${userId}`,
      message: 'Usuario de prueba para grupo',
      imageUrl: '/defaults/default-avatar.png',
    },
  });

  // 2. Seedear en Redis
  const sessionKey = `${SESSION_PREFIX}:${userId}`;
  await redis.hset(sessionKey, 'range', String(TEST_RANGE), 'lat', String(lat), 'lng', String(lng));
  await redis.geoadd(GEO_KEY, lng, lat, String(userId));

  // 3. Asegurar que no tiene flag de grupo
  await redis.del(`${USER_GROUPS_PREFIX}:${userId}`);

  console.log(`  ✅ User ${userId} creado:`);
  console.log(`     - DB: id=${user.id}, deviceId=${user.deviceId}, profile=${profile.name}`);
  console.log(`     - Redis: lat=${lat}, lng=${lng}, range=${TEST_RANGE}m`);
}

async function run(): Promise<void> {
  console.log('🔌 Conectando a PostgreSQL y Redis...\n');

  // ─── 1. LIMPIAR MOCK ANTIGUOS ───
  console.log('🧹 Fase 1: Limpiando mocks antiguos (9001, 9002, 9003)...');
  for (const id of MOCK_IDS_OLD) {
    await cleanupPostgres(id);
    await cleanupRedis(id);
  }
  console.log('');

  // ─── 2. CREAR NUEVOS MOCK USERS ───
  console.log('🌱 Fase 2: Creando 2 mock users completos...');
  // Separados ~111m para que se vean mutuamente y se vean bien en el mapa
  await createMockUser(9001, BASE_LAT + 0.001, BASE_LNG - 0.001); // ~111m NE
  await createMockUser(9002, BASE_LAT - 0.001, BASE_LNG + 0.001); // ~111m SW

  console.log('\n📋 Resumen:');
  console.log(`   Mock 9001: (${BASE_LAT + 0.001}, ${BASE_LNG - 0.001})`);
  console.log(`   Mock 9002: (${BASE_LAT - 0.001}, ${BASE_LNG + 0.001})`);
  console.log(`   Distancia entre ellos: ~157m (visibles mutuamente con range=5km)`);
  console.log('\n🚀 Ahora conecta tu app desde esa zona. Al ser el 3er usuario,');
  console.log('   se activará la creación automática del grupo.');

  await redis.quit();
  await prisma.$disconnect();
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

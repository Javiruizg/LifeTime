import redis from '../src/shared/lib/redis';
import { prisma } from '../src/shared/lib/prisma';

async function inspect(): Promise<void> {
  await redis.connect();

  console.log('🔍 === INSPECCIÓN DE ESTADO DE GRUPOS ===\n');

  // 1. Redis: user:groups flags
  const userGroupsKeys = await redis.keys('user:groups:*');
  console.log(`📌 Redis — user:groups flags: ${userGroupsKeys.length}`);
  for (const key of userGroupsKeys) {
    const userId = key.split(':').pop();
    const groups = await redis.smembers(key);
    console.log(`   ${key} → [${groups.join(', ')}]`);
  }
  console.log('');

  // 2. Redis: group:members sets
  const groupMembersKeys = await redis.keys('group:members:*');
  console.log(`📌 Redis — group:members sets: ${groupMembersKeys.length}`);
  for (const key of groupMembersKeys) {
    const chatId = key.split(':').pop();
    const members = await redis.smembers(key);
    console.log(`   ${key} → [${members.join(', ')}]`);
  }
  console.log('');

  // 3. Redis: group:creation_lock
  const lockKeys = await redis.keys('group:creation_lock:*');
  console.log(`📌 Redis — group:creation_lock: ${lockKeys.length}`);
  for (const key of lockKeys) {
    console.log(`   ${key}`);
  }
  console.log('');

  // 4. PostgreSQL: GroupChat
  const dbGroups = await prisma.groupChat.findMany({
    include: {
      chat: {
        include: { members: true },
      },
      profile: true,
    },
  });
  console.log(`🐘 PostgreSQL — group_chats: ${dbGroups.length}`);
  for (const g of dbGroups) {
    const memberIds = g.chat.members.map((m) => m.userId).join(', ');
    console.log(`   #${g.chatId} — ${g.profile.name} (creado por ${g.createdById})`);
    console.log(`      Miembros (${g.chat.members.length}): [${memberIds}]`);
    console.log(`      Ubicación: (${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)})`);
  }
  console.log('');

  // 5. PostgreSQL: ChatMember (sin filtro, solo conteo)
  const chatMemberCount = await prisma.chatMember.count();
  console.log(`🐘 PostgreSQL — chat_members total: ${chatMemberCount}`);
  console.log('');

  // 6. Cross-check: flags huérfanos
  console.log('⚠️  Cross-check: flags huérfanos en Redis sin grupo en PostgreSQL');
  const orphaned: string[] = [];
  for (const key of userGroupsKeys) {
    const userId = key.split(':').pop()!;
    const groupIds = await redis.smembers(key);
    for (const chatId of groupIds) {
      const exists = await prisma.groupChat.findUnique({
        where: { chatId: parseInt(chatId, 10) },
        select: { id: true },
      });
      if (!exists) {
        orphaned.push(`user:groups:${userId} → chatId ${chatId} (NO EXISTE en PostgreSQL)`);
      }
    }
  }
  if (orphaned.length === 0) {
    console.log('   ✅ No hay flags huérfanos. Todo sincronizado.');
  } else {
    for (const o of orphaned) {
      console.log(`   ❌ ${o}`);
    }
  }

  console.log('\n🏁 === FIN DE INSPECCIÓN ===\n');
  await redis.quit();
  await prisma.$disconnect();
}

inspect().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

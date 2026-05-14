import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Do not pass datasource/adapter options to the PrismaClient constructor.
// Passing `adapter` or datasource URLs here triggers strict validation errors
// in some Prisma client builds (see runtime errors). Keep a minimal client
// and use environment variables in the Prisma schema / CLI operations.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

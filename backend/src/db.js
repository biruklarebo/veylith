import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

// The only file that knows which database is in use. Everything else uses this client.
// The structure is in prisma/schema.prisma, and migrations run before the server starts.
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Stores a profile picture under a new id, so the old picture's link stops working.
export async function saveAvatar(userId, contentType, data) {
  const id = randomUUID();
  await prisma.file.upsert({
    where: { userId_key: { userId, key: 'avatar' } },
    create: { id, userId, key: 'avatar', contentType, data },
    update: { id, contentType, data },
  });
  return prisma.user.update({ where: { id: userId }, data: { avatarId: id } });
}

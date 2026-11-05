import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { prisma, saveAvatar } from './db.js';
import { checkPassword, hashPassword, signToken, userIdFrom } from './auth.js';
import { googleEnabled, googleRoutes } from './google.js';

const PORT = 8090;
const MIN_PASSWORD = 8;
const MAX_FILE = 15 * 1024 * 1024;
const MAX_ITEM = 12 * 1024 * 1024;
const COLLECTIONS = new Set(['sessions', 'routines', 'exercises', 'programs', 'body_stats', 'photos', 'scheduled_days', 'exercise_records', 'user_state']);

const app = Fastify({ logger: { level: 'warn' }, bodyLimit: MAX_ITEM, trustProxy: true });
await app.register(rateLimit, { global: false });
app.addContentTypeParser(/^image\//, { parseAs: 'buffer', bodyLimit: MAX_FILE }, (_, body, done) => done(null, body));

const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

const account = (u) => ({ id: u.id, email: u.email, name: u.name, verified: u.verified, avatar: u.avatarId });
const withToken = async (u) => ({ token: await signToken(u.id), user: account(u) });
const UNIQUE_VIOLATION = 'P2002';

// Rejects the request unless it has a valid token, and sets request.userId.
async function signedIn(request, reply) {
  request.userId = await userIdFrom(request);
  if (!request.userId) return reply.code(401).send({ error: 'Sign in again' });
}
const secured = { preHandler: signedIn };

app.get('/api/health', async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok' };
});

app.get('/api/auth/methods', async () => ({ google: googleEnabled() }));

app.post('/api/auth/register', authLimit, async (request, reply) => {
  const { name, email, password } = request.body ?? {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return reply.code(400).send({ error: 'Enter a valid email and a longer password' });
  }
  try {
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), name: String(name ?? '').slice(0, 255), passwordHash: await hashPassword(password) },
    });
    return withToken(user);
  } catch (e) {
    if (e.code === UNIQUE_VIOLATION) return reply.code(409).send({ error: 'That email already has an account' });
    throw e;
  }
});

app.post('/api/auth/login', authLimit, async (request, reply) => {
  const { email, password } = request.body ?? {};
  const user = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!(await checkPassword(String(password), user?.passwordHash))) return reply.code(401).send({ error: 'Wrong email or password' });
  return withToken(user);
});

googleRoutes(app);

// A fresh token each time, so anyone who keeps using the app stays signed in.
app.get('/api/auth/me', secured, async (request, reply) => {
  const user = await prisma.user.findUnique({ where: { id: request.userId } });
  if (!user) return reply.code(401).send({ error: 'Sign in again' });
  return withToken(user);
});

app.patch('/api/auth/me', secured, async (request) => {
  const user = await prisma.user.update({ where: { id: request.userId }, data: { name: String(request.body?.name ?? '').slice(0, 255) } });
  return account(user);
});

app.put('/api/auth/me/avatar', secured, async (request, reply) => {
  if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'Send an image' });
  return account(await saveAvatar(request.userId, request.headers['content-type'], request.body));
});

app.delete('/api/auth/me/avatar', secured, async (request) => {
  await prisma.file.deleteMany({ where: { userId: request.userId, key: 'avatar' } });
  return account(await prisma.user.update({ where: { id: request.userId }, data: { avatarId: null } }));
});

// Readable by anyone with the link, which is random and changes with each new picture.
app.get('/api/avatars/:id', async (request, reply) => {
  if (!/^[0-9a-f-]{36}$/.test(request.params.id)) return reply.code(404).send();
  const file = await prisma.file.findFirst({ where: { id: request.params.id, key: 'avatar' } });
  if (!file) return reply.code(404).send();
  return reply.type(file.contentType).header('Cache-Control', 'public, max-age=31536000, immutable').send(Buffer.from(file.data));
});

app.get('/api/sync', secured, async (request) => ({
  items: await prisma.item.findMany({ where: { userId: request.userId }, select: { collection: true, key: true, data: true } }),
}));

const knownCollection = async (request, reply) => {
  if (!COLLECTIONS.has(request.params.collection)) return reply.code(404).send({ error: 'Unknown collection' });
};

app.put('/api/items/:collection/:key', { preHandler: [signedIn, knownCollection] }, async (request, reply) => {
  const data = request.body?.data;
  if (data === undefined || data === null) return reply.code(400).send({ error: 'Send data' });
  const { collection, key } = request.params;
  await prisma.item.upsert({
    where: { userId_collection_key: { userId: request.userId, collection, key } },
    create: { userId: request.userId, collection, key, data },
    update: { data },
  });
  return reply.code(204).send();
});

app.delete('/api/items/:collection/:key', { preHandler: [signedIn, knownCollection] }, async (request, reply) => {
  const { collection, key } = request.params;
  await prisma.item.deleteMany({ where: { userId: request.userId, collection, key } });
  if (collection === 'photos') await prisma.file.deleteMany({ where: { userId: request.userId, key: `photo:${key}` } });
  return reply.code(204).send();
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

app.put('/api/photos/:key', secured, async (request, reply) => {
  if (!Buffer.isBuffer(request.body) || !request.body.subarray(0, 3).equals(JPEG)) return reply.code(415).send({ error: 'Send a JPEG' });
  const key = `photo:${request.params.key}`;
  await prisma.file.upsert({
    where: { userId_key: { userId: request.userId, key } },
    create: { userId: request.userId, key, contentType: 'image/jpeg', data: request.body },
    update: { data: request.body },
  });
  return reply.code(204).send();
});

app.get('/api/photos/:key', secured, async (request, reply) => {
  const file = await prisma.file.findUnique({ where: { userId_key: { userId: request.userId, key: `photo:${request.params.key}` } } });
  if (!file) return reply.code(404).send();
  return reply.type('image/jpeg').send(Buffer.from(file.data));
});

await app.listen({ host: '0.0.0.0', port: PORT });
console.log(`Backend listening on ${PORT}`);

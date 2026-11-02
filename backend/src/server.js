import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { migrate, query } from './db.js';
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

const account = (u) => ({ id: u.id, email: u.email, name: u.name, verified: u.verified, avatar: u.avatar_id });
const withToken = async (u) => ({ token: await signToken(u.id), user: account(u) });
const USER_COLUMNS = 'id, email, name, verified, avatar_id';

// Rejects the request unless it has a valid token, and sets request.userId.
async function signedIn(request, reply) {
  request.userId = await userIdFrom(request);
  if (!request.userId) return reply.code(401).send({ error: 'Sign in again' });
}
const secured = { preHandler: signedIn };

app.get('/api/health', async () => {
  await query('SELECT 1');
  return { status: 'ok' };
});

app.get('/api/auth/methods', async () => ({ google: googleEnabled() }));

app.post('/api/auth/register', authLimit, async (request, reply) => {
  const { name, email, password } = request.body ?? {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return reply.code(400).send({ error: 'Enter a valid email and a longer password' });
  }
  const created = await query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING ${USER_COLUMNS}`,
    [email.toLowerCase(), String(name ?? '').slice(0, 255), await hashPassword(password)],
  );
  if (!created.rows[0]) return reply.code(409).send({ error: 'That email already has an account' });
  return withToken(created.rows[0]);
});

app.post('/api/auth/login', authLimit, async (request, reply) => {
  const { email, password } = request.body ?? {};
  const user = (await query(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`, [String(email).toLowerCase()])).rows[0];
  if (!(await checkPassword(String(password), user?.password_hash))) return reply.code(401).send({ error: 'Wrong email or password' });
  return withToken(user);
});

googleRoutes(app);

// A fresh token each time, so anyone who keeps using the app stays signed in.
app.get('/api/auth/me', secured, async (request, reply) => {
  const user = (await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [request.userId])).rows[0];
  if (!user) return reply.code(401).send({ error: 'Sign in again' });
  return withToken(user);
});

app.patch('/api/auth/me', secured, async (request) => {
  const user = await query(`UPDATE users SET name = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`, [String(request.body?.name ?? '').slice(0, 255), request.userId]);
  return account(user.rows[0]);
});

app.put('/api/auth/me/avatar', secured, async (request, reply) => {
  if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'Send an image' });
  const file = await query(
    `INSERT INTO files (user_id, key, content_type, data) VALUES ($1, 'avatar', $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET content_type = $2, data = $3, id = gen_random_uuid() RETURNING id`,
    [request.userId, request.headers['content-type'], request.body],
  );
  const user = await query(`UPDATE users SET avatar_id = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`, [file.rows[0].id, request.userId]);
  return account(user.rows[0]);
});

app.delete('/api/auth/me/avatar', secured, async (request) => {
  await query(`DELETE FROM files WHERE user_id = $1 AND key = 'avatar'`, [request.userId]);
  const user = await query(`UPDATE users SET avatar_id = NULL WHERE id = $1 RETURNING ${USER_COLUMNS}`, [request.userId]);
  return account(user.rows[0]);
});

// Readable by anyone with the link, which is random and changes with each new picture.
app.get('/api/avatars/:id', async (request, reply) => {
  if (!/^[0-9a-f-]{36}$/.test(request.params.id)) return reply.code(404).send();
  const file = (await query(`SELECT content_type, data FROM files WHERE id = $1 AND key = 'avatar'`, [request.params.id])).rows[0];
  if (!file) return reply.code(404).send();
  return reply.type(file.content_type).header('Cache-Control', 'public, max-age=31536000, immutable').send(file.data);
});

app.get('/api/sync', secured, async (request) => {
  const items = await query('SELECT collection, key, data FROM items WHERE user_id = $1', [request.userId]);
  return { items: items.rows };
});

const knownCollection = async (request, reply) => {
  if (!COLLECTIONS.has(request.params.collection)) return reply.code(404).send({ error: 'Unknown collection' });
};

app.put('/api/items/:collection/:key', { preHandler: [signedIn, knownCollection] }, async (request, reply) => {
  if (request.body?.data === undefined) return reply.code(400).send({ error: 'Send data' });
  await query(
    `INSERT INTO items (user_id, collection, key, data) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, collection, key) DO UPDATE SET data = $4, updated_at = now()`,
    [request.userId, request.params.collection, request.params.key, JSON.stringify(request.body.data)],
  );
  return reply.code(204).send();
});

app.delete('/api/items/:collection/:key', { preHandler: [signedIn, knownCollection] }, async (request, reply) => {
  await query('DELETE FROM items WHERE user_id = $1 AND collection = $2 AND key = $3', [request.userId, request.params.collection, request.params.key]);
  if (request.params.collection === 'photos') await query('DELETE FROM files WHERE user_id = $1 AND key = $2', [request.userId, `photo:${request.params.key}`]);
  return reply.code(204).send();
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

app.put('/api/photos/:key', secured, async (request, reply) => {
  if (!Buffer.isBuffer(request.body) || !request.body.subarray(0, 3).equals(JPEG)) return reply.code(415).send({ error: 'Send a JPEG' });
  await query(
    `INSERT INTO files (user_id, key, content_type, data) VALUES ($1, $2, 'image/jpeg', $3)
     ON CONFLICT (user_id, key) DO UPDATE SET data = $3`,
    [request.userId, `photo:${request.params.key}`, request.body],
  );
  return reply.code(204).send();
});

app.get('/api/photos/:key', secured, async (request, reply) => {
  const file = (await query('SELECT data FROM files WHERE user_id = $1 AND key = $2', [request.userId, `photo:${request.params.key}`])).rows[0];
  if (!file) return reply.code(404).send();
  return reply.type('image/jpeg').send(file.data);
});

await migrate();
await app.listen({ host: '0.0.0.0', port: PORT });
console.log(`Backend listening on ${PORT}`);

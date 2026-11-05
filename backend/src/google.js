import { createHash, randomBytes } from 'node:crypto';
import { prisma, saveAvatar } from './db.js';
import { signToken } from './auth.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const USERINFO_URL = process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo';
const MAX_PICTURE = 5 * 1024 * 1024;
const COOKIE = 'google_login';

export const googleEnabled = () => !!(CLIENT_ID && CLIENT_SECRET);

const appOrigin = (request) => `${request.headers['x-forwarded-proto'] ?? request.protocol}://${request.headers.host}`;
const redirectUri = (request) => `${appOrigin(request)}/api/oauth2-redirect`;
const base64url = (b) => b.toString('base64url');

function readCookie(request) {
  const match = request.headers.cookie?.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!match) return {};
  const [state, verifier] = match[1].split('.');
  return { state, verifier };
}

// The picture is stored here rather than linked, so it keeps working if Google's link changes.
async function copyPicture(userId, url) {
  if (!url) return;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const type = res.headers.get('content-type')?.split(';')[0] ?? '';
    const data = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !type.startsWith('image/') || data.length > MAX_PICTURE) return;
    await saveAvatar(userId, type, data);
  } catch (e) {
    console.warn(`Could not copy the Google picture: ${e.message}`); // the account still works
  }
}

// Finds or creates the account for a Google profile. Returns its id, or null if refused.
async function accountFor(profile) {
  const email = profile.email.toLowerCase();
  const known = await prisma.user.findUnique({ where: { googleSub: profile.sub }, select: { id: true } });
  if (known) return known.id;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, verified: true } });
  if (existing) {
    if (!profile.email_verified) return null;
    // An unverified account may have been registered by someone else with this address, so
    // its password stops working now the real owner has shown up.
    await prisma.user.update({
      where: { id: existing.id },
      data: { googleSub: profile.sub, verified: true, ...(existing.verified ? {} : { passwordHash: null }) },
    });
    return existing.id;
  }

  const created = await prisma.user.create({
    data: { email, name: profile.name ?? '', googleSub: profile.sub, verified: !!profile.email_verified },
    select: { id: true },
  });
  await copyPicture(created.id, profile.picture);
  return created.id;
}

export function googleRoutes(app) {
  app.get('/api/auth/google/start', async (request, reply) => {
    if (!googleEnabled()) return reply.code(404).send({ error: 'Google sign-in is not set up' });
    const state = base64url(randomBytes(16));
    const verifier = base64url(randomBytes(32));
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(request),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    });
    const secure = appOrigin(request).startsWith('https') ? '; Secure' : '';
    reply.header('Set-Cookie', `${COOKIE}=${state}.${verifier}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=600${secure}`);
    return reply.redirect(url.toString());
  });

  // The app reads the result from the address fragment, which never reaches a server.
  app.get('/api/oauth2-redirect', async (request, reply) => {
    const fail = () => reply.redirect('/#auth_error=google');
    const { code, state } = request.query;
    const saved = readCookie(request);
    reply.header('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0`);
    if (!code || !state || state !== saved.state) return fail();
    try {
      const tokens = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: redirectUri(request),
          grant_type: 'authorization_code',
          code_verifier: saved.verifier,
        }),
      });
      if (!tokens.ok) return fail();
      const { access_token: accessToken } = await tokens.json();
      const info = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!info.ok) return fail();
      const profile = await info.json();
      if (!profile.sub || !profile.email) return fail();
      const userId = await accountFor(profile);
      if (!userId) return fail();
      return reply.redirect(`/#auth_token=${await signToken(userId)}`);
    } catch (e) {
      request.log.error(e);
      return fail();
    }
  });
}

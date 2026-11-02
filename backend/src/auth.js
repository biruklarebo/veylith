import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';

const derive = promisify(scrypt);
const KEY_LENGTH = 64;
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const TOKEN_LIFETIME = '30d';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

// Takes the same time for an unknown account, so timing doesn't reveal which emails exist.
const NO_ACCOUNT = `${'0'.repeat(32)}:${'0'.repeat(KEY_LENGTH * 2)}`;

export async function checkPassword(password, stored) {
  const [salt, key] = (stored ?? NO_ACCOUNT).split(':');
  const actual = await derive(password, Buffer.from(salt, 'hex'), KEY_LENGTH);
  return timingSafeEqual(actual, Buffer.from(key, 'hex')) && !!stored;
}

export const signToken = (userId) =>
  new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime(TOKEN_LIFETIME).sign(SECRET);

// The user id a request's bearer token belongs to, or null.
export async function userIdFrom(request) {
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return null;
  try {
    return (await jwtVerify(token, SECRET, { algorithms: ['HS256'] })).payload.sub;
  } catch {
    return null;
  }
}

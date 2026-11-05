import { useSyncExternalStore } from 'react';

// Every call to the backend is in this file, so a different backend only changes this file.
// Same origin by default: nginx, or Vite in development, forwards /api to the backend.
const BASE: string = import.meta.env.VITE_API_URL ?? '';
const AUTH_KEY = 'veylith-auth';

export interface Account {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  avatar: string | null;
}
interface Auth {
  token: string;
  user: Account;
}
export interface SyncedItem {
  collection: string;
  key: string;
  data: unknown;
}

export class ApiError extends Error {
  status: number; // 0 = the server couldn't be reached
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readAuth(): Auth | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null');
  } catch {
    return null;
  }
}

let auth = readAuth();
const authListeners = new Set<() => void>();

function setAuth(next: Auth | null) {
  auth = next;
  if (next) localStorage.setItem(AUTH_KEY, JSON.stringify(next));
  else localStorage.removeItem(AUTH_KEY);
  authListeners.forEach((l) => l());
}

export const clearAuth = () => setAuth(null);
export const currentAccount = () => auth?.user ?? null;
export function onAuthChange(listener: () => void) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}
export const useAccount = () => useSyncExternalStore(onAuthChange, currentAccount);

async function request(path: string, init: RequestInit = {}, token = auth?.token): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Request failed');
  return res;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const updateUser = async (res: Response) => {
  const user: Account = await res.json();
  if (auth) setAuth({ ...auth, user });
};

export const signInMethods = async (): Promise<{ google: boolean }> => (await request('/api/auth/methods')).json();

export async function register(name: string, email: string, password: string) {
  setAuth(await (await request('/api/auth/register', json('POST', { name, email, password }))).json());
}
export async function signIn(email: string, password: string) {
  setAuth(await (await request('/api/auth/login', json('POST', { email, password }))).json());
}

// Leaves the app for Google, which returns to it with the result in the address fragment.
export function signInWithGoogle() {
  window.location.href = `${BASE}/api/auth/google/start`;
}

function readGoogleReturn() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('auth_token');
  const failed = params.has('auth_error');
  if (token || failed) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  return { token, failed };
}
const googleResult = readGoogleReturn();
export const googleFailed = googleResult.failed;

// Settles once a return from Google, if there was one, has finished signing in.
export const googleReturn: Promise<void> = googleResult.token
  ? request('/api/auth/me', {}, googleResult.token)
      .then(async (res) => setAuth(await res.json()))
      .catch(() => undefined)
  : Promise.resolve();

// Renews the sign-in and picks up account changes from other devices. Offline, nothing changes.
export async function refreshAccount() {
  try {
    setAuth(await (await request('/api/auth/me')).json());
  } catch (e) {
    if ((e as ApiError).status === 401) clearAuth();
  }
}

export const updateName = async (name: string) => updateUser(await request('/api/auth/me', json('PATCH', { name })));
export const setAvatar = async (image: Blob) => updateUser(await request('/api/auth/me/avatar', { method: 'PUT', headers: { 'Content-Type': image.type }, body: image }));
export const removeAvatar = async () => updateUser(await request('/api/auth/me/avatar', { method: 'DELETE' }));
export const avatarUrl = (user: Account) => `${BASE}/api/avatars/${user.avatar}`;

export const listItems = async (): Promise<SyncedItem[]> => (await (await request('/api/sync')).json()).items;
const itemPath = (collection: string, key: string) => `/api/items/${collection}/${encodeURIComponent(key)}`;
export const putItem = async (collection: string, key: string, data: unknown) => {
  await request(itemPath(collection, key), json('PUT', { data }));
};
export const deleteItem = async (collection: string, key: string) => {
  await request(itemPath(collection, key), { method: 'DELETE' });
};

export const putPhoto = async (key: string, image: Blob) => {
  await request(`/api/photos/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: image });
};
export const getPhoto = async (key: string) => (await request(`/api/photos/${encodeURIComponent(key)}`)).blob();

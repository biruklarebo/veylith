import { useSyncExternalStore } from 'react';
import { clear, get, set } from 'idb-keyval';
import { useStore } from '../store';
import { pb } from './pb';
import { deletePhotoBlob, loadPhotoBlob } from './photos';
import { COLLECTIONS, HISTORY, canon, fromItems, merge, toItems, type Collection, type Items, type Synced } from './syncMerge';

// PocketBase holds the data. The store is this device's working copy, so the app keeps working
// without a connection: changes are pushed shortly after they happen, and the server is read on
// startup and whenever the app comes back into view or online.
const META_KEY = 'sync-meta';
const RETRY_MS = 30000;
const PUSH_DELAY_MS = 800;

type Row = { id: string; json: string };
interface Meta {
  user: string;
  base: Record<Collection, Record<string, Row>>;
}

const emptyBase = () => Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as Meta['base'];
const synced = (): Synced => useStore.getState();

let meta: Meta | null = null;
let stopWatching: (() => void) | null = null;
let startedFor: string | null = null;
let started = Promise.resolve();
let running = false;
let wanted: 'push' | 'full' | null = null;
let pushTimer = 0;
let retryTimer = 0;
let waiting = false;
const waitingListeners = new Set<() => void>();

function setWaiting(v: boolean) {
  if (v === waiting) return;
  waiting = v;
  waitingListeners.forEach((l) => l());
}

// True while changes are on this device but haven't reached the server.
export const useSyncWaiting = () =>
  useSyncExternalStore(
    (notify) => {
      waitingListeners.add(notify);
      return () => waitingListeners.delete(notify);
    },
    () => waiting,
  );

async function pull() {
  const user = pb.authStore.record!.id;
  const remote = {} as Record<Collection, { id: string; key: string; data: unknown }[]>;
  for (const c of COLLECTIONS) remote[c] = await pb.collection(c).getFullList({ fields: 'id,key,data', batch: 200 });

  const first = !meta;
  const emptyAccount = COLLECTIONS.every((c) => !remote[c].length);
  const prior = meta?.base;
  const local = toItems(synced());
  const merged = {} as Record<Collection, Items>;
  const base = emptyBase();
  for (const c of COLLECTIONS) {
    const items = Object.fromEntries(remote[c].map((r) => [r.key, r.data]));
    const agreed = prior && Object.fromEntries(Object.entries(prior[c]).map(([k, r]) => [k, r.json]));
    merged[c] = merge(local[c], items, first ? null : (agreed ?? {}), emptyAccount || HISTORY.includes(c));
    for (const r of remote[c]) base[c][r.key] = { id: r.id, json: canon(r.data) };
  }
  meta = { user, base };
  for (const k of Object.keys(local.photos)) if (!(k in merged.photos)) deletePhotoBlob(k);
  useStore.setState(fromItems(merged, synced()));
  await set(META_KEY, meta);
}

async function save(c: Collection, key: string, data: unknown) {
  const body: Record<string, unknown> = { user: meta!.user, key, data };
  const row = meta!.base[c][key];
  if (c === 'photos' && !row) {
    const blob = await loadPhotoBlob(key);
    if (blob) body.image = new File([blob], `${key}.jpg`, { type: 'image/jpeg' });
  }
  const saved = row ? await pb.collection(c).update(row.id, body) : await pb.collection(c).create(body);
  meta!.base[c][key] = { id: saved.id, json: canon(data) };
}

// Sends every item that differs from what the server last confirmed. An item the server rejects
// must not hold up the rest, so it is retried later. No connection or sign-in stops the push.
async function push() {
  if (!meta) return;
  const local = toItems(synced());
  let rejected: unknown;
  const attempt = async (send: () => Promise<void>) => {
    try {
      await send();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (!status || status === 401) throw e;
      rejected = e;
    }
  };
  try {
    for (const c of COLLECTIONS) {
      for (const [key, data] of Object.entries(local[c])) {
        if (canon(data) !== meta.base[c][key]?.json) await attempt(() => save(c, key, data));
      }
      for (const [key, row] of Object.entries(meta.base[c])) {
        if (key in local[c]) continue;
        await attempt(async () => {
          await pb.collection(c).delete(row.id);
          delete meta!.base[c][key];
        });
      }
    }
  } finally {
    await set(META_KEY, meta);
  }
  if (rejected) throw rejected;
}

function request(kind: 'push' | 'full') {
  if (wanted !== 'full') wanted = kind;
  void run();
}

async function run() {
  if (running || !pb.authStore.record) return;
  running = true;
  while (wanted) {
    const kind = wanted;
    wanted = null;
    try {
      if (kind === 'full') await pull();
      await push();
      setWaiting(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // An expired sign-in: pending changes stay on the device for the next sign-in.
      if (status === 401) pb.authStore.clear();
      else {
        setWaiting(true);
        clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => request('full'), RETRY_MS);
      }
      break;
    }
  }
  running = false;
}

const onVisible = () => {
  if (document.visibilityState === 'visible') request('full');
};
const onOnline = () => request('full');

// A later sign-in, after an expired one, starts sync again.
pb.authStore.onChange((token) => {
  if (!token) startedFor = null;
});

// Starts syncing for the signed-in user, once. The promise settles when the app can show.
export function startSync() {
  const user = pb.authStore.record?.id;
  if (!user) return Promise.resolve();
  if (startedFor !== user) {
    startedFor = user;
    started = begin(user);
  }
  return started;
}

// A device with no copy yet waits for the first pull.
async function begin(user: string) {
  meta = (await get<Meta>(META_KEY)) ?? null;
  if (meta && meta.user !== user) {
    await clearDevice();
    location.reload();
    return;
  }
  stopWatching?.();
  stopWatching = useStore.subscribe(() => {
    clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => request('push'), PUSH_DELAY_MS);
  });
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  pb.collection('users').authRefresh().catch((e) => e.status === 401 && pb.authStore.clear());
  request('full');
  if (!meta) await new Promise<void>((res) => {
    const check = () => (meta || !running ? res() : setTimeout(check, 50));
    check();
  });
}

const hasPending = () => {
  if (!meta) return true;
  const local = toItems(synced());
  return COLLECTIONS.some((c) => {
    const keys = new Set([...Object.keys(local[c]), ...Object.keys(meta!.base[c])]);
    return [...keys].some((k) => (k in local[c] ? canon(local[c][k]) : undefined) !== meta!.base[c][k]?.json);
  });
};

async function clearDevice() {
  stopWatching?.();
  await clear();
}

// Ends the session and removes this device's copy, once everything has reached the server.
export async function signOut() {
  try {
    await push();
  } catch {
    // Reported below.
  }
  if (hasPending() && !confirm('Some changes have not reached the server yet and will be lost. Sign out anyway?')) return;
  await clearDevice();
  pb.authStore.clear();
  location.reload();
}

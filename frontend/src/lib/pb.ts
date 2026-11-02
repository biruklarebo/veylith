import { useSyncExternalStore } from 'react';
import PocketBase from 'pocketbase';

// Same origin by default: nginx, or Vite in development, forwards /api to the backend.
export const pb = new PocketBase(import.meta.env.VITE_API_URL ?? window.location.origin);

// Sync sends many requests at once, and the SDK would otherwise cancel the repeats.
pb.autoCancellation(false);

// Reading authStore.record builds a new object each time, so React gets this stable copy.
let account = pb.authStore.record;
pb.authStore.onChange(() => {
  account = pb.authStore.record;
});

// The signed-in user's account: id, email, name and picture.
export function useAccount() {
  return useSyncExternalStore(
    (notify) => pb.authStore.onChange(notify),
    () => account,
  );
}

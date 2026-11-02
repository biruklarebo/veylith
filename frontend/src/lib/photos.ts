import { useEffect, useState } from 'react';
import { del, get, set } from 'idb-keyval';

// Photo files are kept out of the persisted app state (which is one JSON document) and stored
// as Blobs under their own IndexedDB keys.
const key = (id: string) => `photo:${id}`;

export const savePhotoBlob = (id: string, b: Blob) => set(key(id), b);
export const loadPhotoBlob = (id: string) => get<Blob>(key(id));
export const deletePhotoBlob = (id: string) => del(key(id));

// Backups are JSON, so photos travel as data URLs.
export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
export const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

// Re-encode to a JPEG no larger than `max` px on the long side. Drawing through a canvas also
// drops EXIF data, so location and camera details never get stored.
export async function shrinkImage(file: File, max = 1440): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85));
  return { blob, w, h };
}

// Object URL for a stored photo, revoked when the component unmounts or the id changes.
export function usePhotoUrl(id: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    let made: string | null = null;
    loadPhotoBlob(id).then((b) => {
      if (!live || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [id]);
  return url;
}

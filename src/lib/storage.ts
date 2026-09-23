import { IMAGE_TRANSFORMS_ENABLED } from '../config/supabase';
import { supabase } from './supabase';

// Ukuran maksimal gambar yang diunggah (sisi terpanjang), sama semangatnya dengan app HP:
// hemat kuota Supabase & kuota internet.
const MAX_UPLOAD_SIZE = 1600;
const UPLOAD_QUALITY = 0.8;

// Gambar digambar ulang ke canvas sebelum dikirim. Efeknya dua:
// ukurannya mengecil, dan semua metadata (termasuk lokasi GPS) hilang karena file dibuat baru.
export async function prepareImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  // imageOrientation 'from-image' = foto dari HP tidak jadi miring/terbalik.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(
    1,
    MAX_UPLOAD_SIZE / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Browser tidak bisa memproses gambar ini.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', UPLOAD_QUALITY),
  );
  if (!blob) {
    throw new Error('Gagal memproses gambar.');
  }
  return { blob, width, height };
}

// Mengembalikan path file di bucket (bukan URL), sama seperti app HP.
export async function uploadImage(options: {
  bucket: string;
  // Folder pertama: id user (foto profil/status) atau id room (gambar chat).
  // Aturan akses storage di database memeriksa folder ini.
  folder: string;
  prefix: string;
  file: File;
}): Promise<{ path: string; width: number; height: number }> {
  const { blob, width, height } = await prepareImage(options.file);
  const path = `${options.folder}/${options.prefix}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(options.bucket)
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (error) {
    throw error;
  }
  return { path, width, height };
}

export type ImageTransform = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill';
};

type CachedUrl = { url: string; expiresAt: number };

// Link sementara dipakai ulang selama masih berlaku, supaya browser memakai cache-nya
// sendiri dan tidak mengunduh gambar yang sama berkali-kali.
const signedUrlCache = new Map<string, CachedUrl>();
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

// Link sementara untuk banyak gambar sekaligus di bucket private.
// Mengembalikan Map path → URL; path yang gagal tidak ada di hasil.
export async function getSignedImageUrls(options: {
  bucket: string;
  paths: string[];
  ttlSeconds: number;
  transform?: ImageTransform;
}): Promise<Map<string, string>> {
  const transform = IMAGE_TRANSFORMS_ENABLED ? options.transform : undefined;
  const keyOf = (path: string) =>
    `${options.bucket}:${path}:${transform ? JSON.stringify(transform) : 'full'}`;
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];

  for (const path of new Set(options.paths)) {
    const cached = signedUrlCache.get(keyOf(path));
    if (cached && cached.expiresAt - now > REFRESH_MARGIN_MS) {
      result.set(path, cached.url);
    } else {
      missing.push(path);
    }
  }
  if (missing.length === 0) {
    return result;
  }

  const expiresAt = now + options.ttlSeconds * 1000;
  const remember = (path: string, url: string) => {
    signedUrlCache.set(keyOf(path), { url, expiresAt });
    result.set(path, url);
  };
  const bucket = supabase.storage.from(options.bucket);

  if (transform) {
    // Versi kecil harus dibuat satu per satu (tidak ada versi sekaligus).
    await Promise.all(
      missing.map(async path => {
        const { data, error } = await bucket.createSignedUrl(
          path,
          options.ttlSeconds,
          { transform },
        );
        if (error) {
          console.warn('Gagal membuat link gambar', path, error);
        } else if (data?.signedUrl) {
          remember(path, data.signedUrl);
        }
      }),
    );
  } else {
    const { data, error } = await bucket.createSignedUrls(
      missing,
      options.ttlSeconds,
    );
    if (error) {
      console.warn('Gagal membuat link gambar', error);
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        remember(item.path, item.signedUrl);
      }
    }
  }

  return result;
}

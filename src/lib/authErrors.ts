import type { AuthError } from '@supabase/supabase-js';

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email atau password salah.',
  email_not_confirmed: 'Email belum dikonfirmasi. Cek inbox kamu dulu.',
  user_already_exists: 'Email ini sudah terdaftar. Silakan masuk.',
  weak_password: 'Password terlalu lemah, coba yang lebih kuat.',
  // Batas kirim email Supabase (bawaan hanya beberapa email per jam).
  over_email_send_rate_limit:
    'Batas kirim email pendaftaran sudah tercapai. Coba lagi sekitar 1 jam lagi.',
  // Batas jumlah percobaan dari satu jaringan (menit-menitan).
  over_request_rate_limit:
    'Terlalu banyak percobaan dari jaringan ini. Tunggu beberapa menit, lalu coba lagi.',
};

export function getAuthErrorMessage(error: AuthError): string {
  console.warn('Auth error', error.code, error.status, error.message);
  return (error.code && MESSAGES[error.code]) || error.message;
}

export function validateEmail(value: string) {
  const email = value.trim();
  if (!email) {
    return 'Email wajib diisi.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Format email belum benar.';
  }
  return null;
}

export function validatePassword(value: string) {
  if (!value) {
    return 'Password wajib diisi.';
  }
  if (value.length < 8) {
    return 'Password minimal 8 karakter.';
  }
  return null;
}

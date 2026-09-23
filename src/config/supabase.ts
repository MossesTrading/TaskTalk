// Sama dengan app HP: project Supabase & aturan RLS yang sama, jadi akunnya juga sama.
// Nilainya diisi lewat file .env (lokal) atau Environment Variables (Vercel/Netlify).
// Anon key memang dipakai di sisi klien; yang rahasia (service_role) tidak pernah ada di sini.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi. Lihat web/.env.example.',
  );
}

// Paket Pro: Supabase bisa membuatkan versi kecil gambar (hemat kuota).
export const IMAGE_TRANSFORMS_ENABLED = true;

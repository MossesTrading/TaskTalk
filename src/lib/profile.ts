import { IMAGE_TRANSFORMS_ENABLED } from '../config/supabase';
import { uploadImage } from './storage';
import { supabase } from './supabase';

export type Option = {
  id: number;
  name: string;
};

export type Profile = {
  id: string;
  full_name: string;
  avatar_path: string | null;
  job_id: number | null;
  company_id: number | null;
  job: Option | null;
  company: Option | null;
};

const PROFILE_TABLE = 'chat_profiles';
const AVATAR_BUCKET = 'chat-avatars';
// Jabatan & perusahaan diambil dari master data yang sudah ada (tabel job & company).
const PROFILE_COLUMNS =
  'id, full_name, avatar_path, job_id, company_id, job:job_id(id, name:job), company:company_id(id, name:Perusahaan)';

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  // Relasi many-to-one mengembalikan objek, bukan array seperti tebakan tipe supabase-js.
  return data as unknown as Profile | null;
}

// Profil dianggap lengkap kalau jabatan & perusahaan sudah dipilih.
export function isProfileComplete(profile: Profile | null): boolean {
  return !!profile && profile.job_id !== null && profile.company_id !== null;
}

export async function fetchJobOptions(): Promise<Option[]> {
  const { data, error } = await supabase
    .from('job')
    .select('id, name:job')
    .order('id');
  if (error) {
    throw error;
  }
  return data as Option[];
}

export async function fetchCompanyOptions(): Promise<Option[]> {
  const { data, error } = await supabase
    .from('company')
    .select('id, name:Perusahaan')
    .order('id');
  if (error) {
    throw error;
  }
  return data as Option[];
}

export type ProfileInput = {
  fullName: string;
  jobId: number;
  companyId: number;
  newPhoto: File | null;
  removePhoto: boolean;
};

// Dipakai untuk membuat profil pertama kali maupun mengubahnya.
export async function submitProfile(
  userId: string,
  input: ProfileInput,
  currentAvatarPath: string | null,
): Promise<Profile> {
  let avatarPath = currentAvatarPath;
  if (input.newPhoto) {
    const uploaded = await uploadImage({
      bucket: AVATAR_BUCKET,
      folder: userId,
      prefix: 'avatar',
      file: input.newPhoto,
    });
    avatarPath = uploaded.path;
  } else if (input.removePhoto) {
    avatarPath = null;
  }

  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .upsert({
      id: userId,
      full_name: input.fullName.trim(),
      job_id: input.jobId,
      company_id: input.companyId,
      avatar_path: avatarPath,
    })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) {
    throw error;
  }

  // Bersihkan foto lama. Kalau gagal pun tidak apa-apa, profilnya sudah tersimpan.
  if (currentAvatarPath && currentAvatarPath !== avatarPath) {
    await supabase.storage.from(AVATAR_BUCKET).remove([currentAvatarPath]);
  }

  return data as unknown as Profile;
}

// Foto grup: diunggah ke folder milik pembuat grup.
export async function uploadGroupPhoto(userId: string, file: File) {
  const uploaded = await uploadImage({
    bucket: AVATAR_BUCKET,
    folder: userId,
    prefix: 'group',
    file,
  });
  return uploaded.path;
}

// Bucket avatar bersifat publik, jadi URL-nya tetap dan bisa di-cache browser.
export function getAvatarUrl(
  path: string | null | undefined,
  size: 'small' | 'large' = 'small',
) {
  if (!path) {
    return null;
  }
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  if (size === 'small' && IMAGE_TRANSFORMS_ENABLED) {
    return bucket.getPublicUrl(path, {
      transform: { width: 192, height: 192, resize: 'cover', quality: 75 },
    }).data.publicUrl;
  }
  return bucket.getPublicUrl(path).data.publicUrl;
}

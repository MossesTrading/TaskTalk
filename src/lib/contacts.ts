import type { Option } from './profile';
import { supabase } from './supabase';

export type Contact = {
  id: string;
  full_name: string;
  avatar_path: string | null;
  job: Option | null;
  company: Option | null;
};

// Semua pengguna dengan profil lengkap, kecuali diri sendiri.
export async function fetchContacts(currentUserId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('chat_profiles')
    .select(
      'id, full_name, avatar_path, job:job_id(id, name:job), company:company_id(id, name:Perusahaan)',
    )
    .neq('id', currentUserId)
    .not('job_id', 'is', null)
    .not('company_id', 'is', null)
    .order('full_name');
  if (error) {
    throw error;
  }
  // Relasi many-to-one mengembalikan objek, bukan array seperti tebakan tipe supabase-js.
  return data as unknown as Contact[];
}

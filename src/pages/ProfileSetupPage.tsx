import { ProfileForm } from '../components/ProfileForm';
import { useAuth } from '../context/AuthContext';
import { AuthLayout } from './AuthLayout';

// Muncul sekali setelah daftar: nama, jabatan, perusahaan, foto (opsional).
export function ProfileSetupPage() {
  const { session, profile, setProfile, signOut } = useAuth();
  const userId = session!.user.id;

  return (
    <AuthLayout
      title="Lengkapi profil"
      subtitle="Data ini yang dilihat rekan kerja di daftar kontak & chat."
      footer={
        <button type="button" className="btn ghost small" onClick={signOut}>
          Keluar
        </button>
      }
    >
      <ProfileForm
        userId={userId}
        profile={profile}
        submitLabel="Simpan & lanjut"
        onSaved={setProfile}
      />
    </AuthLayout>
  );
}

import { useState } from 'react';
import { CircleCheck, LogOut } from 'lucide-react';
import { useDialog } from '../components/Dialog';
import { NotificationToggle } from '../components/NotificationToggle';
import { ProfileForm } from '../components/ProfileForm';
import { useAuth } from '../context/AuthContext';
import './ProfilePage.css';

export function ProfilePage() {
  const { session, profile, setProfile, signOut } = useAuth();
  const dialog = useDialog();
  const [saved, setSaved] = useState(false);

  const confirmSignOut = async () => {
    const yes = await dialog.confirm({
      title: 'Keluar dari TalkTask?',
      message: 'Kamu perlu masuk lagi untuk membuka chat.',
      confirmLabel: 'Keluar',
      destructive: true,
    });
    if (yes) {
      signOut();
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Profil saya</h1>
          <p className="sub">Data ini yang dilihat rekan kerja di kontak & chat.</p>
        </div>
      </header>

      <div className="page-body">
        <div className="profile-page">
          {saved ? (
            <p className="saved">
              <CircleCheck size={18} /> Profil tersimpan.
            </p>
          ) : null}

          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              value={session?.user.email ?? ''}
              readOnly
              disabled
            />
            <span className="muted note">
              Email dipakai untuk masuk dan tidak bisa diubah dari sini.
            </span>
          </label>

          <ProfileForm
            userId={session!.user.id}
            profile={profile}
            submitLabel="Simpan perubahan"
            onSaved={next => {
              setProfile(next);
              setSaved(true);
            }}
          />

          <div className="profile-extra">
            <NotificationToggle />
            <button type="button" className="btn danger block" onClick={confirmSignOut}>
              <LogOut size={18} />
              Keluar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

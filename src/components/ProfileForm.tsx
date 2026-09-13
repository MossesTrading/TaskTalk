import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import {
  fetchCompanyOptions,
  fetchJobOptions,
  getAvatarUrl,
  submitProfile,
  type Option,
  type Profile,
} from '../lib/profile';
import { Avatar } from './Avatar';
import { useErrorDialog } from './Dialog';
import './ProfileForm.css';

type Props = {
  userId: string;
  profile: Profile | null;
  submitLabel: string;
  onSaved: (profile: Profile) => void;
};

type Errors = { fullName?: string; jobId?: string; companyId?: string };

// Dipakai di "Lengkapi profil" (pertama kali) dan di halaman Profil (ubah data).
export function ProfileForm({ userId, profile, submitLabel, onSaved }: Props) {
  const showError = useErrorDialog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [jobId, setJobId] = useState<number | null>(profile?.job_id ?? null);
  const [companyId, setCompanyId] = useState<number | null>(
    profile?.company_id ?? null,
  );
  const [jobs, setJobs] = useState<Option[]>([]);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchJobOptions(), fetchCompanyOptions()])
      .then(([jobOptions, companyOptions]) => {
        setJobs(jobOptions);
        setCompanies(companyOptions);
      })
      .catch(error => console.warn('Gagal memuat pilihan jabatan', error));
  }, []);

  // Bebaskan alamat sementara foto pilihan saat diganti / komponen ditutup.
  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const currentPhotoUrl = removePhoto
    ? null
    : (photoPreview ?? getAvatarUrl(profile?.avatar_path));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Errors = {
      fullName: fullName.trim() ? undefined : 'Nama wajib diisi.',
      jobId: jobId ? undefined : 'Pilih jabatan.',
      companyId: companyId ? undefined : 'Pilih perusahaan.',
    };
    setErrors(nextErrors);
    if (nextErrors.fullName || nextErrors.jobId || nextErrors.companyId) {
      return;
    }

    setSaving(true);
    try {
      const saved = await submitProfile(
        userId,
        {
          fullName,
          jobId: jobId!,
          companyId: companyId!,
          newPhoto: photo,
          removePhoto,
        },
        profile?.avatar_path ?? null,
      );
      setPhoto(null);
      setRemovePhoto(false);
      onSaved(saved);
    } catch (error) {
      await showError('Gagal menyimpan profil', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={submit} noValidate>
      <div className="photo-row">
        <Avatar url={currentPhotoUrl} name={fullName} size={92} />
        <div className="photo-actions">
          <button
            type="button"
            className="btn secondary small"
            onClick={() => fileInput.current?.click()}
          >
            <Camera size={16} />
            {currentPhotoUrl ? 'Ganti foto' : 'Pilih foto'}
          </button>
          {currentPhotoUrl ? (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setPhoto(null);
                setRemovePhoto(true);
              }}
            >
              <Trash2 size={16} />
              Hapus
            </button>
          ) : null}
          <p className="muted hint">Foto tidak wajib. Ukurannya dikecilkan otomatis.</p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={event => {
            const file = event.target.files?.[0] ?? null;
            if (file) {
              setPhoto(file);
              setRemovePhoto(false);
            }
            event.target.value = '';
          }}
        />
      </div>

      <label className="field">
        <span className="label">Nama lengkap</span>
        <input
          className={`input${errors.fullName ? ' invalid' : ''}`}
          value={fullName}
          onChange={event => setFullName(event.target.value)}
          placeholder="Nama yang dilihat rekan kerja"
          maxLength={80}
        />
        {errors.fullName ? (
          <span className="error">{errors.fullName}</span>
        ) : null}
      </label>

      <label className="field">
        <span className="label">Jabatan</span>
        <select
          className={`select${errors.jobId ? ' invalid' : ''}`}
          value={jobId ?? ''}
          onChange={event => setJobId(Number(event.target.value) || null)}
        >
          <option value="">Pilih jabatan</option>
          {jobs.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        {errors.jobId ? <span className="error">{errors.jobId}</span> : null}
      </label>

      <label className="field">
        <span className="label">Perusahaan</span>
        <select
          className={`select${errors.companyId ? ' invalid' : ''}`}
          value={companyId ?? ''}
          onChange={event => setCompanyId(Number(event.target.value) || null)}
        >
          <option value="">Pilih perusahaan</option>
          {companies.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        {errors.companyId ? (
          <span className="error">{errors.companyId}</span>
        ) : null}
      </label>

      <button className="btn block" type="submit" disabled={saving}>
        {saving ? <span className="spinner" /> : submitLabel}
      </button>
    </form>
  );
}

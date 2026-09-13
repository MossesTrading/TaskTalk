import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDialog } from '../components/Dialog';
import {
  getAuthErrorMessage,
  validateEmail,
  validatePassword,
} from '../lib/authErrors';
import { supabase } from '../lib/supabase';
import { AuthLayout } from './AuthLayout';

type Errors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function RegisterPage() {
  const dialog = useDialog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: Errors = {
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
      confirmPassword:
        password === confirmPassword ? undefined : 'Ulangi password sama persis.',
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password || nextErrors.confirmPassword) {
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) {
        dialog.alert({
          title: 'Gagal daftar',
          message: getAuthErrorMessage(error),
          tone: 'error',
        });
        return;
      }
      // Kalau konfirmasi email aktif, Supabase tidak mengembalikan error untuk email
      // yang sudah terdaftar, tapi user-nya tidak punya identity.
      if (data.user && data.user.identities?.length === 0) {
        dialog.alert({
          title: 'Email sudah terdaftar',
          message: 'Silakan masuk pakai email ini.',
        });
        return;
      }
      if (!data.session) {
        await dialog.alert({
          title: 'Cek email kamu',
          message:
            'Akun dibuat. Buka link konfirmasi di email, lalu masuk seperti biasa.',
        });
      }
      // Kalau langsung dapat sesi, AuthProvider memindahkan ke "Lengkapi profil".
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Buat akun"
      subtitle="Daftar dulu, data diri dilengkapi di langkah berikutnya."
      footer={
        <>
          Sudah punya akun? <Link to="/masuk">Masuk</Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <label className="field">
          <span className="label">Email</span>
          <input
            className={`input${errors.email ? ' invalid' : ''}`}
            type="email"
            autoComplete="email"
            placeholder="nama@perusahaan.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
          {errors.email ? <span className="error">{errors.email}</span> : null}
        </label>

        <label className="field">
          <span className="label">Password</span>
          <input
            className={`input${errors.password ? ' invalid' : ''}`}
            type="password"
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          {errors.password ? (
            <span className="error">{errors.password}</span>
          ) : null}
        </label>

        <label className="field">
          <span className="label">Ulangi password</span>
          <input
            className={`input${errors.confirmPassword ? ' invalid' : ''}`}
            type="password"
            autoComplete="new-password"
            placeholder="Ketik ulang password"
            value={confirmPassword}
            onChange={event => setConfirmPassword(event.target.value)}
          />
          {errors.confirmPassword ? (
            <span className="error">{errors.confirmPassword}</span>
          ) : null}
        </label>

        <button className="btn block" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Daftar'}
          {loading ? null : <ArrowRight size={18} />}
        </button>
      </form>
    </AuthLayout>
  );
}

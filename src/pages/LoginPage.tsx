import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useDialog } from '../components/Dialog';
import { getAuthErrorMessage, validateEmail } from '../lib/authErrors';
import { supabase } from '../lib/supabase';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const dialog = useDialog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = {
      email: validateEmail(email) ?? undefined,
      password: password ? undefined : 'Password wajib diisi.',
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        dialog.alert({
          title: 'Gagal masuk',
          message: getAuthErrorMessage(error),
          tone: 'error',
        });
      }
      // Berhasil: AuthProvider menangkap perubahan sesi & memindahkan halaman.
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Masuk"
      subtitle="Pakai akun yang sama dengan aplikasi di HP."
      footer={
        <>
          Belum punya akun? <Link to="/daftar">Daftar</Link>
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
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          {errors.password ? (
            <span className="error">{errors.password}</span>
          ) : null}
        </label>

        <button className="btn block" type="submit" disabled={loading}>
          {loading ? <span className="spinner" /> : 'Masuk'}
          {loading ? null : <ArrowRight size={18} />}
        </button>
      </form>
    </AuthLayout>
  );
}

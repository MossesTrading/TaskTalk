import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { fetchProfile, type Profile } from '../lib/profile';
import { reportAppEvent } from '../lib/presence';
import { supabase } from '../lib/supabase';

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

type AuthValue = {
  session: Session | null;
  initializing: boolean;
  profile: Profile | null;
  profileStatus: ProfileStatus;
  reloadProfile: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setInitializing(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const reloadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileStatus('idle');
      return;
    }
    setProfileStatus(current => (current === 'ready' ? current : 'loading'));
    try {
      setProfile(await fetchProfile(userId));
      setProfileStatus('ready');
    } catch (error) {
      console.warn('Gagal memuat profil', error);
      setProfileStatus('error');
    }
  }, [userId]);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  const signOut = useCallback(async () => {
    // Beri tahu server dulu supaya status online orang ini langsung mati.
    await reportAppEvent('logout');
    await supabase.auth.signOut();
    setProfile(null);
    setProfileStatus('idle');
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      initializing,
      profile,
      profileStatus,
      reloadProfile,
      setProfile,
      signOut,
    }),
    [session, initializing, profile, profileStatus, reloadProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth harus dipakai di dalam AuthProvider');
  }
  return value;
}

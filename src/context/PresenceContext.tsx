import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchPresence,
  HEARTBEAT_INTERVAL_MS,
  PRESENCE_REFRESH_MS,
  reportAppEvent,
  subscribeToPresence,
  type Presence,
} from '../lib/presence';
import { useAuth } from './AuthContext';

const PresenceContext = createContext<Map<string, Presence>>(new Map());

// 1. Melaporkan "tab dibuka / ditinggal / ditutup" + heartbeat ke database.
// 2. Menyediakan status online orang lain untuk titik hijau & "Terakhir dilihat".
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [presence, setPresence] = useState<Map<string, Presence>>(new Map());

  // ─── Lapor keberadaan sendiri ───
  useEffect(() => {
    if (!userId) {
      return;
    }
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    const stopHeartbeat = () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };
    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeat = setInterval(
        () => reportAppEvent('heartbeat'),
        HEARTBEAT_INTERVAL_MS,
      );
    };

    reportAppEvent('open');
    startHeartbeat();

    // Tab pindah ke belakang / komputer dikunci → dianggap tidak di depan layar.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        reportAppEvent('foreground');
        startHeartbeat();
      } else {
        reportAppEvent('background');
        stopHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopHeartbeat();
    };
  }, [userId]);

  // ─── Status online orang lain ───
  const loadPresence = useCallback(async () => {
    if (!userId) {
      setPresence(new Map());
      return;
    }
    try {
      const list = await fetchPresence();
      setPresence(new Map(list.map(item => [item.user_id, item])));
    } catch (error) {
      console.warn('Gagal memuat status online', error);
    }
  }, [userId]);

  useEffect(() => {
    loadPresence();
  }, [loadPresence]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    return subscribeToPresence({
      onChange: item =>
        setPresence(current => new Map(current).set(item.user_id, item)),
      onResync: loadPresence,
    });
  }, [userId, loadPresence]);

  // Yang putus tanpa pamit (tab ditutup paksa, listrik mati) tidak memicu realtime,
  // jadi statusnya dicek ulang berkala selama tab ini terlihat.
  useEffect(() => {
    if (!userId) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadPresence();
      }
    }, PRESENCE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [userId, loadPresence]);

  const value = useMemo(() => presence, [presence]);
  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceMap() {
  return useContext(PresenceContext);
}

export function usePresence(userId: string | null | undefined) {
  const presence = useContext(PresenceContext);
  return userId ? presence.get(userId) : undefined;
}

export function isOnline(presence: Presence | undefined) {
  return presence?.online === true;
}

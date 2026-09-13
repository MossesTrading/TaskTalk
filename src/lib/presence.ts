import { listenToTables, type TableChange } from './realtime';
import { supabase } from './supabase';

export type AppEvent = 'open' | 'foreground' | 'background' | 'heartbeat' | 'logout';

export type Presence = {
  user_id: string;
  online: boolean;
  last_seen_at: string;
};

// Hanya jalan selama tab terlihat. Server menganggap putus kalau heartbeat diam > 15 detik.
export const HEARTBEAT_INTERVAL_MS = 5 * 1000;
// Yang putus tanpa pamit (tab ditutup paksa, listrik mati) ketahuan lewat pengecekan berkala.
export const PRESENCE_REFRESH_MS = 10 * 1000;

export async function reportAppEvent(event: AppEvent) {
  const { error } = await supabase.rpc('chat_report_app_event', {
    p_event: event,
    p_platform: 'web',
    p_device_model: null,
    p_os_version: navigator.userAgent.slice(0, 20),
  });
  if (error) {
    console.warn(`Gagal mengirim event app "${event}"`, error);
  }
}

// Status online dihitung server dengan jam server (jam komputer bisa salah).
export async function fetchPresence(): Promise<Presence[]> {
  const { data, error } = await supabase.rpc('chat_list_presence');
  if (error) {
    throw error;
  }
  return data as Presence[];
}

// Buka / tutup / logout orang lain, langsung dari server.
export function subscribeToPresence(handlers: {
  onChange: (presence: Presence) => void;
  onResync: () => void;
}) {
  const onRow = (change: TableChange) => {
    const row = change.new as {
      user_id: string;
      state: string;
      last_seen_at: string;
    };
    handlers.onChange({
      user_id: row.user_id,
      online: row.state === 'online',
      last_seen_at: row.last_seen_at,
    });
  };
  return listenToTables(
    'chat-presence',
    [
      { event: 'INSERT', table: 'chat_presence', onChange: onRow },
      { event: 'UPDATE', table: 'chat_presence', onChange: onRow },
    ],
    { onResync: handlers.onResync },
  );
}

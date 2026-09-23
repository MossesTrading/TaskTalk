import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { supabase } from './supabase';

// Semua langganan realtime lewat sini, dengan aturan yang sama seperti app HP:
//
// 1. Nama channel selalu unik. supabase.channel() dengan nama yang sama mengembalikan
//    channel LAMA — yang mungkin masih dipakai bagian lain atau sedang ditutup —
//    sehingga langganan baru bisa mati diam-diam ("ghost channel").
// 2. Event yang masih di jalan saat langganan dihentikan tidak diteruskan ke layar.
// 3. Koneksi pulih (internet putus-nyambung) → `onResync` dipanggil untuk memuat ulang,
//    karena Supabase tidak mengirim ulang event selama terputus.
//
// Bedanya dengan app HP: di browser channel TIDAK ditutup saat tab pindah ke belakang,
// karena di web tidak ada push notification sebagai gantinya.

export type TableChange = RealtimePostgresChangesPayload<{
  [key: string]: unknown;
}>;

export type TableListener = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  table: string;
  // Format "kolom=eq.nilai". Event DELETE tidak bisa difilter (batasan Supabase),
  // dan hanya membawa primary key.
  filter?: string;
  onChange: (change: TableChange) => void;
};

type Subscription = {
  name: string;
  listeners: TableListener[];
  onResync?: () => void;
  channel: RealtimeChannel | null;
};

const subscriptions = new Set<Subscription>();
let sequence = 0;

function openChannel(sub: Subscription) {
  sequence += 1;
  const channel = supabase.channel(`${sub.name}:${sequence}`, {
    // SUBSCRIBED baru dilaporkan setelah server siap mengirim perubahan, jadi data
    // yang dimuat ulang saat itu tidak melewatkan apa pun.
    config: { postgres_changes_options: { wait: true } },
  });
  sub.channel = channel;

  for (const listener of sub.listeners) {
    channel.on(
      'postgres_changes',
      {
        event: listener.event,
        schema: 'public',
        table: listener.table,
        ...(listener.filter ? { filter: listener.filter } : {}),
      },
      payload => {
        if (sub.channel === channel) {
          listener.onChange(payload);
        }
      },
    );
  }

  // Sambungan pertama: halaman sudah memuat datanya sendiri.
  // Sambungan berikutnya (koneksi pulih): muat ulang.
  let needsResync = false;
  channel.subscribe((status, error) => {
    if (sub.channel !== channel) {
      return;
    }
    if (status === 'SUBSCRIBED') {
      if (needsResync) {
        sub.onResync?.();
      }
      needsResync = true;
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn(`Realtime "${sub.name}": ${status}`, error);
      // Biasanya library menyambung ulang sendiri; ini jaring pengaman kalau
      // koneksi tertutup tepat saat channel baru dibuka. connect() tidak berbuat
      // apa-apa kalau koneksinya sedang/sudah tersambung.
      setTimeout(() => {
        if (sub.channel === channel) {
          supabase.realtime.connect();
        }
      }, 0);
    }
  });
}

// Kembalikan fungsi untuk berhenti mendengarkan (pakai sebagai cleanup useEffect).
export function listenToTables(
  name: string,
  listeners: TableListener[],
  options: { onResync?: () => void } = {},
) {
  const sub: Subscription = {
    name,
    listeners,
    onResync: options.onResync,
    channel: null,
  };
  subscriptions.add(sub);
  openChannel(sub);
  return () => {
    subscriptions.delete(sub);
    const channel = sub.channel;
    sub.channel = null;
    if (channel) {
      supabase.removeChannel(channel);
    }
  };
}

// Internet kembali nyambung → pastikan websocket-nya hidup lagi.
window.addEventListener('online', () => supabase.realtime.connect());

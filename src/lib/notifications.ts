import { listenToTables } from './realtime';
import { supabase } from './supabase';

export type StatusNotificationType =
  | 'status_like'
  | 'status_comment'
  | 'comment_reply';

export type StatusNotification = {
  id: string;
  type: StatusNotificationType;
  created_at: string;
  read_at: string | null;
  status_id: string;
  comment_id: string | null;
  actor: { id: string; full_name: string; avatar_path: string | null } | null;
  // null kalau status sudah lewat 24 jam / dihapus (RLS menyembunyikannya).
  status: {
    id: string;
    content: string | null;
    created_at: string;
    image_path: string | null;
  } | null;
  comment: { id: string; content: string } | null;
};

const NOTIFICATION_COLUMNS =
  'id, type, created_at, read_at, status_id, comment_id, actor:actor_id(id, full_name, avatar_path), status:status_id(id, content, created_at, image_path), comment:comment_id(id, content)';

// Database hanya mengembalikan notif dari status yang masih aktif (< 24 jam).
export async function fetchNotifications(
  limit = 50,
): Promise<StatusNotification[]> {
  const { data, error } = await supabase
    .from('chat_notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  return (data as unknown as StatusNotification[]).filter(
    item => item.status !== null,
  );
}

export async function markNotificationsRead() {
  const { error } = await supabase.rpc('chat_mark_notifications_read');
  if (error) {
    console.warn('Gagal menandai notifikasi sudah dibaca', error);
  }
}

// Notif baru untuk user ini, atau notif yang ditarik (batal suka, komentar dihapus).
export function subscribeToNotifications(
  userId: string,
  handlers: {
    onInserted: () => void;
    onDeleted: (id: string) => void;
    onResync: () => void;
  },
) {
  return listenToTables(
    'status-notifications',
    [
      {
        event: 'INSERT',
        table: 'chat_notifications',
        filter: `recipient_id=eq.${userId}`,
        onChange: () => handlers.onInserted(),
      },
      {
        event: 'DELETE',
        table: 'chat_notifications',
        onChange: change =>
          handlers.onDeleted((change.old as { id: string }).id),
      },
    ],
    { onResync: handlers.onResync },
  );
}

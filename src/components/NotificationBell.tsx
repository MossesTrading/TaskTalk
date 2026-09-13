import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Heart, MessageCircle, Reply } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatAge } from '../lib/format';
import {
  fetchNotifications,
  markNotificationsRead,
  subscribeToNotifications,
  type StatusNotification,
} from '../lib/notifications';
import { getAvatarUrl } from '../lib/profile';
import { isStatusActive } from '../lib/statuses';
import { Avatar } from './Avatar';
import './NotificationBell.css';

const TYPE_TEXT = {
  status_like: { icon: Heart, text: 'menyukai status kamu' },
  status_comment: { icon: MessageCircle, text: 'mengomentari status kamu' },
  comment_reply: { icon: Reply, text: 'membalas komentar kamu' },
};

type Props = {
  onOpenStatus: (statusId: string, commentId?: string | null) => void;
};

// Lonceng notifikasi suka / komentar / balasan. Notif ikut hilang saat statusnya lewat 24 jam.
export function NotificationBell({ onOpenStatus }: Props) {
  const { session } = useAuth();
  const myId = session!.user.id;
  const [items, setItems] = useState<StatusNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wrapper = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await fetchNotifications());
    } catch (error) {
      console.warn('Gagal memuat notifikasi', error);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribeToNotifications(myId, {
        onInserted: load,
        onDeleted: id =>
          setItems(current => current.filter(item => item.id !== id)),
        onResync: load,
      }),
    [myId, load],
  );

  // Notif basi (statusnya lewat 24 jam) langsung hilang tanpa menunggu muat ulang.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const visible = useMemo(
    () => items.filter(item => item.status && isStatusActive(item.status, now)),
    [items, now],
  );
  const unread = visible.filter(item => !item.read_at).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      markNotificationsRead();
      const readAt = new Date().toISOString();
      setItems(current =>
        current.map(item => (item.read_at ? item : { ...item, read_at: readAt })),
      );
    }
  };

  return (
    <div className="bell-wrap" ref={wrapper}>
      <button
        type="button"
        className="btn icon"
        aria-label={`Notifikasi${unread > 0 ? `, ${unread} belum dibaca` : ''}`}
        onClick={toggle}
      >
        <Bell size={20} />
        {unread > 0 ? <span className="bell-dot" /> : null}
      </button>

      {open ? (
        <div className="bell-panel">
          <header>
            <strong>Notifikasi</strong>
            <small className="muted">Hilang otomatis setelah 24 jam</small>
          </header>
          {visible.length === 0 ? (
            <p className="empty-note muted">Belum ada notifikasi.</p>
          ) : (
            <ul>
              {visible.map(item => {
                const meta = TYPE_TEXT[item.type];
                const Icon = meta.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.read_at ? undefined : 'unread'}
                      onClick={() => {
                        setOpen(false);
                        onOpenStatus(item.status_id, item.comment_id);
                      }}
                    >
                      <Avatar
                        url={getAvatarUrl(item.actor?.avatar_path)}
                        name={item.actor?.full_name}
                        size={36}
                      />
                      <span className="text">
                        <span>
                          <strong>{item.actor?.full_name ?? 'Seseorang'}</strong>{' '}
                          {meta.text}
                        </span>
                        {item.comment ? (
                          <span className="quote">"{item.comment.content}"</span>
                        ) : null}
                        <small className="muted">
                          {formatAge(item.created_at, now)} lalu
                        </small>
                      </span>
                      <Icon size={16} className="type-icon" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

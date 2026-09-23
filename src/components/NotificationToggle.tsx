import { useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  askNotificationPermission,
  notificationState,
  type NotificationState,
} from '../lib/webNotifications';

// Tombol minta izin notifikasi browser. Aturan browser: izin hanya boleh diminta
// dari klik user, jadi tidak bisa otomatis. Hilang sendiri setelah diizinkan.
export function NotificationToggle({ block = true }: { block?: boolean }) {
  const [state, setState] = useState<NotificationState>(() =>
    notificationState(),
  );

  if (state === 'granted' || state === 'unsupported') {
    return null;
  }

  if (state === 'denied') {
    return (
      <p className="notif-blocked muted">
        <BellOff size={14} /> Notifikasi diblokir di pengaturan browser.
      </p>
    );
  }

  return (
    <button
      type="button"
      className={`btn secondary small${block ? ' block' : ''}`}
      onClick={async () => setState(await askNotificationPermission())}
    >
      <Bell size={16} />
      Nyalakan notifikasi
    </button>
  );
}

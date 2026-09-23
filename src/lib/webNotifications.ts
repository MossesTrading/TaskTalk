// Notifikasi bawaan browser: tetap muncul (di Windows: pojok kanan bawah) walau tab
// TalkTask sedang tidak dilihat. Berbeda dengan notif kecil di dalam halaman, yang
// hanya terlihat kalau tab ini sedang aktif.
//
// Catatan: ini hanya jalan selama tab TalkTask masih terbuka (boleh di belakang).
// Kalau browser ditutup sama sekali, yang bekerja adalah push notif di app HP.

export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied';

const APP_ICON = '/TalkTask.png';

export function notificationState(): NotificationState {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// Izin hanya boleh diminta dari klik user (aturan browser).
export async function askNotificationPermission(): Promise<NotificationState> {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.warn('Gagal meminta izin notifikasi', error);
    return Notification.permission;
  }
}

export function showChatNotification(options: {
  title: string;
  body: string;
  // Foto profil/grup; kalau kosong pakai ikon TalkTask.
  icon?: string | null;
  // Notif dari room yang sama saling menimpa, jadi tidak menumpuk.
  tag: string;
  onClick: () => void;
}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || APP_ICON,
      badge: APP_ICON,
      tag: options.tag,
      // Pesan baru di room yang sama tetap berbunyi walau notif lamanya ditimpa.
      renotify: true,
    } as NotificationOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
      options.onClick();
    };
  } catch (error) {
    console.warn('Gagal menampilkan notifikasi', error);
  }
}

import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  ClipboardList,
  House,
  LogOut,
  MessagesSquare,
  UserRound,
  Users,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { useDialog } from '../components/Dialog';
import { IncomingChatToast } from '../components/IncomingChatToast';
import { NotificationToggle } from '../components/NotificationToggle';
import { useAuth } from '../context/AuthContext';
import { useChatInbox } from '../context/ChatInboxContext';
import { getAvatarUrl } from '../lib/profile';
import { setUnreadBadge } from '../lib/unreadBadge';
import './AppShell.css';

const NAV = [
  { to: '/beranda', label: 'Beranda', icon: House },
  { to: '/chat', label: 'Chat', icon: MessagesSquare },
  { to: '/task', label: 'Task', icon: ClipboardList },
  { to: '/kontak', label: 'Kontak', icon: Users },
];

export function AppShell() {
  const { profile, signOut } = useAuth();
  const { totalUnread } = useChatInbox();
  const dialog = useDialog();
  // Angka chat belum dibaca ikut tampil di judul & ikon tab, jadi kelihatan
  // walau user sedang membuka tab lain.
  useEffect(() => {
    setUnreadBadge(totalUnread);
  }, [totalUnread]);

  const confirmSignOut = async () => {
    const yes = await dialog.confirm({
      title: 'Keluar dari TalkTask?',
      message: 'Kamu perlu masuk lagi untuk membuka chat.',
      confirmLabel: 'Keluar',
      destructive: true,
    });
    if (yes) {
      signOut();
    }
  };

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <img src="/TalkTask.png" alt="" />
          <span>TalkTask</span>
        </div>

        <div className="nav">
          {NAV.map(item => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className="nav-item">
                <Icon size={20} />
                <span>{item.label}</span>
                {item.to === '/chat' && totalUnread > 0 ? (
                  <span className="badge">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </div>

        {/* Di HP menu ini jadi menu bawah, jadi ajakan notifikasi pindah ke halaman Profil. */}
        <div className="notif-hint">
          <NotificationToggle />
        </div>

        <div className="bottom">
          <NavLink to="/profil" className="me">
            <Avatar
              url={getAvatarUrl(profile?.avatar_path)}
              name={profile?.full_name}
              size={38}
            />
            <span className="me-text">
              <strong>{profile?.full_name}</strong>
              <small>{profile?.job?.name ?? 'Profil saya'}</small>
            </span>
            <UserRound size={16} className="me-icon" />
          </NavLink>
          <button type="button" className="btn ghost small" onClick={confirmSignOut}>
            <LogOut size={16} />
            Keluar
          </button>
        </div>
      </nav>

      <main className="content">
        <Outlet />
      </main>

      <IncomingChatToast />
    </div>
  );
}

import { useState } from 'react';
import { LogOut, UserMinus, X } from 'lucide-react';
import { isOnline, usePresenceMap } from '../context/PresenceContext';
import { leaveGroup, removeMember, type ChatRoomInfo, type RoomMember } from '../lib/chat';
import { getAvatarUrl } from '../lib/profile';
import { Avatar } from './Avatar';
import { useDialog, useErrorDialog } from './Dialog';
import './GroupInfoModal.css';

type Props = {
  roomId: string;
  info: ChatRoomInfo | null;
  members: RoomMember[];
  myId: string;
  myName: string;
  onClose: () => void;
  onChanged: () => void;
  onLeft: () => void;
};

// Info grup: daftar anggota, keluarkan anggota (khusus admin), dan keluar grup.
export function GroupInfoModal({
  roomId,
  info,
  members,
  myId,
  onClose,
  onChanged,
  onLeft,
}: Props) {
  const dialog = useDialog();
  const showError = useErrorDialog();
  const presence = usePresenceMap();
  const [busy, setBusy] = useState(false);
  const isAdmin = members.find(member => member.user_id === myId)?.role === 'admin';

  const kick = async (member: RoomMember) => {
    const name = member.profile?.full_name ?? 'anggota ini';
    const yes = await dialog.confirm({
      title: `Keluarkan ${name}?`,
      message: `${name} tidak bisa membaca atau mengirim pesan di grup ini lagi.`,
      confirmLabel: 'Keluarkan',
      destructive: true,
    });
    if (!yes) {
      return;
    }
    setBusy(true);
    try {
      await removeMember(roomId, member.user_id);
      onChanged();
    } catch (error) {
      await showError('Gagal mengeluarkan anggota', error);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    const yes = await dialog.confirm({
      title: 'Keluar dari grup?',
      message: 'Kamu tidak bisa membaca atau mengirim pesan di grup ini lagi.',
      confirmLabel: 'Keluar',
      destructive: true,
    });
    if (!yes) {
      return;
    }
    setBusy(true);
    try {
      await leaveGroup(roomId);
      onLeft();
    } catch (error) {
      await showError('Gagal keluar dari grup', error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal group-info"
        role="dialog"
        aria-modal="true"
        onClick={event => event.stopPropagation()}
      >
        <header>
          <strong>Info grup</strong>
          <button type="button" className="btn icon" aria-label="Tutup" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="group-head">
          <Avatar
            url={getAvatarUrl(info?.avatar_path, 'large')}
            name={info?.name}
            size={72}
          />
          <div>
            <h3>{info?.name ?? 'Grup'}</h3>
            <p className="muted">{members.length} anggota</p>
          </div>
        </div>

        <ul className="member-list">
          {members.map(member => (
            <li key={member.user_id}>
              <Avatar
                url={getAvatarUrl(member.profile?.avatar_path)}
                name={member.profile?.full_name}
                size={40}
                online={isOnline(presence.get(member.user_id))}
              />
              <div className="info">
                <strong>
                  {member.profile?.full_name ?? 'Pengguna'}
                  {member.user_id === myId ? ' (kamu)' : ''}
                </strong>
                {member.role === 'admin' ? <small className="tag">Admin</small> : null}
              </div>
              {isAdmin && member.user_id !== myId ? (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => kick(member)}
                  disabled={busy}
                >
                  <UserMinus size={16} />
                  Keluarkan
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <footer>
          <button type="button" className="btn danger block" onClick={leave} disabled={busy}>
            <LogOut size={18} />
            Keluar dari grup
          </button>
        </footer>
      </div>
    </div>
  );
}

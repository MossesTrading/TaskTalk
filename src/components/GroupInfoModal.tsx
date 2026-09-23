import { useState } from 'react';
import {
  LogOut,
  Pencil,
  ShieldCheck,
  ShieldOff,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { isOnline, usePresenceMap } from '../context/PresenceContext';
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  leaveGroup,
  removeMember,
  setMemberRole,
  updateGroupDescription,
  type ChatRoomInfo,
  type RoomMember,
} from '../lib/chat';
import { getAvatarUrl } from '../lib/profile';
import { AddMembersModal } from './AddMembersModal';
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

// Info grup: daftar anggota, tambah/keluarkan anggota, jadikan admin,
// ubah deskripsi grup (semua aksi ubah data khusus admin), dan keluar grup.
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
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(info?.description ?? '');
  const [savingDescription, setSavingDescription] = useState(false);
  const isAdmin = members.find(member => member.user_id === myId)?.role === 'admin';

  const startEditDescription = () => {
    setDescriptionDraft(info?.description ?? '');
    setEditingDescription(true);
  };

  const saveDescription = async () => {
    if (savingDescription) {
      return;
    }
    setSavingDescription(true);
    try {
      await updateGroupDescription(roomId, descriptionDraft);
      setEditingDescription(false);
      onChanged();
    } catch (error) {
      await showError('Gagal mengubah deskripsi grup', error);
    } finally {
      setSavingDescription(false);
    }
  };

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

  const toggleAdmin = async (member: RoomMember) => {
    const name = member.profile?.full_name ?? 'anggota ini';
    const makeAdmin = member.role !== 'admin';
    const yes = await dialog.confirm({
      title: makeAdmin ? `Jadikan ${name} admin?` : `Cabut admin dari ${name}?`,
      message: makeAdmin
        ? `${name} akan bisa menambah/mengeluarkan anggota dan mengubah info grup.`
        : `${name} tidak akan bisa lagi mengatur grup ini.`,
      confirmLabel: makeAdmin ? 'Jadikan admin' : 'Cabut admin',
      destructive: !makeAdmin,
    });
    if (!yes) {
      return;
    }
    setBusy(true);
    try {
      await setMemberRole(roomId, member.user_id, makeAdmin ? 'admin' : 'member');
      onChanged();
    } catch (error) {
      await showError('Gagal mengubah status admin', error);
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

        <div className="group-description">
          {editingDescription ? (
            <>
              <textarea
                className="textarea"
                rows={3}
                maxLength={GROUP_DESCRIPTION_MAX_LENGTH}
                placeholder="Tulis deskripsi grup…"
                value={descriptionDraft}
                onChange={event => setDescriptionDraft(event.target.value)}
                autoFocus
              />
              <div className="description-actions">
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setEditingDescription(false)}
                  disabled={savingDescription}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={saveDescription}
                  disabled={savingDescription}
                >
                  {savingDescription ? <span className="spinner" /> : 'Simpan'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={info?.description ? '' : 'muted'}>
                {info?.description || 'Belum ada deskripsi grup.'}
              </p>
              {isAdmin ? (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={startEditDescription}
                >
                  <Pencil size={14} />
                  {info?.description ? 'Ubah deskripsi' : 'Tambah deskripsi'}
                </button>
              ) : null}
            </>
          )}
        </div>

        {isAdmin ? (
          <div className="add-member-row">
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setShowAddMembers(true)}
            >
              <UserPlus size={16} />
              Tambah anggota
            </button>
          </div>
        ) : null}

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
                <div className="member-actions">
                  <button
                    type="button"
                    className="btn ghost small icon-only"
                    onClick={() => toggleAdmin(member)}
                    disabled={busy}
                    title={member.role === 'admin' ? 'Cabut admin' : 'Jadikan admin'}
                    aria-label={member.role === 'admin' ? 'Cabut admin' : 'Jadikan admin'}
                  >
                    {member.role === 'admin' ? (
                      <ShieldOff size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn ghost small icon-only"
                    onClick={() => kick(member)}
                    disabled={busy}
                    title="Keluarkan"
                    aria-label="Keluarkan"
                  >
                    <UserMinus size={16} />
                  </button>
                </div>
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

      {showAddMembers ? (
        <AddMembersModal
          roomId={roomId}
          existingMemberIds={members.map(member => member.user_id)}
          onClose={() => setShowAddMembers(false)}
          onAdded={() => {
            setShowAddMembers(false);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { addMembers } from '../lib/chat';
import { fetchContacts, type Contact } from '../lib/contacts';
import { getAvatarUrl } from '../lib/profile';
import { Avatar } from './Avatar';
import { useErrorDialog } from './Dialog';
import './NewGroupModal.css';

type Props = {
  roomId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onAdded: () => void;
};

// Tambah anggota ke grup yang sudah ada: kontak yang sudah jadi anggota disembunyikan.
export function AddMembersModal({ roomId, existingMemberIds, onClose, onAdded }: Props) {
  const { session } = useAuth();
  const myId = session!.user.id;
  const showError = useErrorDialog();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchContacts(myId)
      .then(setContacts)
      .catch(error => console.warn('Gagal memuat kontak', error));
  }, [myId]);

  const memberIds = new Set(existingMemberIds);
  const keyword = query.trim().toLowerCase();
  const visible = contacts
    .filter(contact => !memberIds.has(contact.id))
    .filter(contact =>
      keyword ? contact.full_name.toLowerCase().includes(keyword) : true,
    );

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const submit = async () => {
    if (selected.size === 0 || saving) {
      return;
    }
    setSaving(true);
    try {
      await addMembers(roomId, [...selected]);
      onAdded();
    } catch (error) {
      await showError('Gagal menambahkan anggota', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal new-group"
        role="dialog"
        aria-modal="true"
        onClick={event => event.stopPropagation()}
      >
        <header>
          <strong>Tambah anggota</strong>
          <button type="button" className="btn icon" aria-label="Tutup" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="search pick-search">
          <Search size={16} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Cari rekan kerja"
          />
        </div>

        <ul className="member-list">
          {visible.length === 0 ? (
            <li className="empty-hint muted">
              {keyword ? 'Tidak ada kontak yang cocok.' : 'Semua kontak sudah ada di grup ini.'}
            </li>
          ) : (
            visible.map(contact => {
              const picked = selected.has(contact.id);
              return (
                <li key={contact.id}>
                  <button
                    type="button"
                    className="pick-row"
                    onClick={() => toggle(contact.id)}
                  >
                    <Avatar
                      url={getAvatarUrl(contact.avatar_path)}
                      name={contact.full_name}
                      size={40}
                    />
                    <span className="info">
                      <strong>{contact.full_name}</strong>
                      <small className="muted">{contact.job?.name ?? ''}</small>
                    </span>
                    <span className={`check${picked ? ' on' : ''}`}>
                      {picked ? <Check size={14} /> : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <footer>
          <button
            type="button"
            className="btn block"
            onClick={submit}
            disabled={saving || selected.size === 0}
          >
            {saving ? (
              <span className="spinner" />
            ) : (
              `Tambahkan${selected.size > 0 ? ` (${selected.size})` : ''}`
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createGroup, GROUP_NAME_MAX_LENGTH } from '../lib/chat';
import { fetchContacts, type Contact } from '../lib/contacts';
import { getAvatarUrl, uploadGroupPhoto } from '../lib/profile';
import { Avatar } from './Avatar';
import { useErrorDialog } from './Dialog';
import './NewGroupModal.css';

type Props = {
  onClose: () => void;
  onCreated: (roomId: string) => void;
};

// Buat grup: nama wajib, foto opsional, minimal satu anggota.
export function NewGroupModal({ onClose, onCreated }: Props) {
  const { session } = useAuth();
  const myId = session!.user.id;
  const showError = useErrorDialog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchContacts(myId)
      .then(setContacts)
      .catch(error => console.warn('Gagal memuat kontak', error));
  }, [myId]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? contacts.filter(contact =>
        contact.full_name.toLowerCase().includes(keyword),
      )
    : contacts;

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
    if (!name.trim() || selected.size === 0 || saving) {
      return;
    }
    setSaving(true);
    try {
      const avatarPath = photo ? await uploadGroupPhoto(myId, photo) : null;
      const roomId = await createGroup({
        name,
        memberIds: [...selected],
        avatarPath,
      });
      onCreated(roomId);
    } catch (error) {
      await showError('Gagal membuat grup', error);
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
          <strong>Grup baru</strong>
          <button type="button" className="btn icon" aria-label="Tutup" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="group-form">
          <button
            type="button"
            className="photo-pick"
            onClick={() => fileInput.current?.click()}
            title="Foto grup (opsional)"
          >
            <Avatar url={preview} name={name || 'Grup'} size={64} />
            <span className="cam">
              <Camera size={14} />
            </span>
          </button>
          <input
            className="input"
            placeholder="Nama grup"
            maxLength={GROUP_NAME_MAX_LENGTH}
            value={name}
            onChange={event => setName(event.target.value)}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={event => {
              const file = event.target.files?.[0] ?? null;
              if (file) {
                setPhoto(file);
              }
              event.target.value = '';
            }}
          />
        </div>

        <div className="search pick-search">
          <Search size={16} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Cari rekan kerja"
          />
        </div>

        <ul className="member-list">
          {visible.map(contact => {
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
          })}
        </ul>

        <footer>
          <button
            type="button"
            className="btn block"
            onClick={submit}
            disabled={saving || !name.trim() || selected.size === 0}
          >
            {saving ? (
              <span className="spinner" />
            ) : (
              `Buat grup${selected.size > 0 ? ` (${selected.size})` : ''}`
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

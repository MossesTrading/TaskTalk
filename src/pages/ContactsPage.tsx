import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, Users, WifiOff } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { useErrorDialog } from '../components/Dialog';
import { useAuth } from '../context/AuthContext';
import { isOnline, usePresenceMap } from '../context/PresenceContext';
import { getOrCreateDirectRoom } from '../lib/chat';
import { fetchContacts, type Contact } from '../lib/contacts';
import { getAvatarUrl } from '../lib/profile';
import './ContactsPage.css';

export function ContactsPage() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const presence = usePresenceMap();
  const navigate = useNavigate();
  const showError = useErrorDialog();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setContacts(await fetchContacts(userId));
      setStatus('ready');
    } catch (error) {
      console.warn('Gagal memuat kontak', error);
      setStatus(current => (current === 'ready' ? current : 'error'));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return contacts;
    }
    return contacts.filter(contact =>
      [contact.full_name, contact.job?.name, contact.company?.name].some(value =>
        value?.toLowerCase().includes(keyword),
      ),
    );
  }, [contacts, query]);

  const startChat = async (contact: Contact) => {
    if (opening) {
      return;
    }
    setOpening(contact.id);
    try {
      const roomId = await getOrCreateDirectRoom(contact.id);
      navigate(`/chat/${roomId}`);
    } catch (error) {
      await showError('Gagal membuka chat', error);
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Kontak</h1>
          <p className="sub">
            {status === 'ready' ? `${contacts.length} rekan kerja` : 'Memuat…'}
          </p>
        </div>
        <div className="spacer" />
        <div className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Cari nama, jabatan, perusahaan"
          />
        </div>
      </header>

      <div className="page-body">
        {status === 'loading' ? (
          <div className="empty">
            <span className="spinner" />
          </div>
        ) : status === 'error' ? (
          <div className="empty">
            <WifiOff size={32} />
            <h3>Gagal memuat kontak</h3>
            <p>Periksa koneksi internet, lalu coba lagi.</p>
            <button type="button" className="btn secondary" onClick={load}>
              Coba lagi
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <Users size={32} />
            <h3>Kontak tidak ditemukan</h3>
            <p>Rekan kerja yang sudah melengkapi profil akan muncul di sini.</p>
          </div>
        ) : (
          <ul className="contact-grid">
            {visible.map(contact => (
              <li key={contact.id} className="contact-card">
                <Avatar
                  url={getAvatarUrl(contact.avatar_path)}
                  name={contact.full_name}
                  size={52}
                  online={isOnline(presence.get(contact.id))}
                />
                <div className="info">
                  <strong>{contact.full_name}</strong>
                  <small>
                    {[contact.job?.name, contact.company?.name]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={() => startChat(contact)}
                  disabled={opening === contact.id}
                >
                  <MessageCircle size={16} />
                  Chat
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

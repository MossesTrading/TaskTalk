import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Eraser,
  ImagePlus,
  Info,
  LogOut,
  MoreVertical,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useChatInbox } from '../context/ChatInboxContext';
import { isOnline, usePresence } from '../context/PresenceContext';
import {
  clearRoom,
  deleteMessage,
  fetchMessages,
  fetchRoomInfo,
  fetchRoomMembers,
  getChatImageUrls,
  leaveGroup,
  MESSAGE_PAGE_SIZE,
  sendMessage,
  subscribeToMembership,
  subscribeToRoom,
  uploadChatImage,
  type ChatMessage,
  type ChatRoomInfo,
  type RoomMember,
} from '../lib/chat';
import { formatDay, formatLastSeen, formatTime } from '../lib/format';
import { getAvatarUrl } from '../lib/profile';
import { Avatar } from './Avatar';
import { useDialog, useErrorDialog } from './Dialog';
import { GroupInfoModal } from './GroupInfoModal';
import { Menu } from './Menu';
import { SecureImage } from './SecureImage';
import './ChatRoom.css';

type LocalMessage = ChatMessage & {
  // Gambar yang baru dipilih: ditampilkan dari file lokal sampai ter-upload.
  localImageUrl?: string;
  sending?: boolean;
};

function mergeMessages(current: LocalMessage[], incoming: ChatMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, { ...existing, ...message, sending: false });
  }
  // Terbaru dulu (daftar digambar terbalik supaya menempel di bawah).
  return [...byId.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

export function ChatRoom({ roomId }: { roomId: string }) {
  const { session, profile } = useAuth();
  const myId = session!.user.id;
  const navigate = useNavigate();
  const dialog = useDialog();
  const showError = useErrorDialog();
  const { markRead, reload } = useChatInbox();
  const fileInput = useRef<HTMLInputElement>(null);

  const [info, setInfo] = useState<ChatRoomInfo | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // true = sudah bukan anggota grup (keluar / dikeluarkan).
  const [removed, setRemoved] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const isGroup = info?.type === 'group';
  const peer = useMemo(
    () => members.find(member => member.user_id !== myId),
    [members, myId],
  );
  const peerPresence = usePresence(isGroup ? null : peer?.user_id);

  // ─── Muat data ───
  const loadInfo = useCallback(async () => {
    try {
      const next = await fetchRoomInfo(roomId);
      setInfo(next);
    } catch (error) {
      console.warn('Gagal memuat info room', error);
    }
  }, [roomId]);

  const loadLatest = useCallback(async () => {
    try {
      const latest = await fetchMessages(roomId);
      setMessages(current => mergeMessages(current, latest));
      setHasMore(latest.length === MESSAGE_PAGE_SIZE);
      setStatus('ready');
      markRead(roomId);
    } catch (error) {
      console.warn('Gagal memuat pesan', error);
      setStatus(current => (current === 'ready' ? current : 'error'));
    }
  }, [roomId, markRead]);

  const loadMembers = useCallback(async () => {
    try {
      const list = await fetchRoomMembers(roomId);
      setMembers(list);
      if (list.length > 0 && !list.some(member => member.user_id === myId)) {
        setRemoved(true);
      }
    } catch (error) {
      console.warn('Gagal memuat anggota room', error);
    }
  }, [roomId, myId]);

  useEffect(() => {
    loadInfo();
    loadLatest();
    loadMembers();
  }, [roomId, loadInfo, loadLatest, loadMembers]);

  useEffect(
    () =>
      subscribeToRoom(roomId, {
        onMessage: message => {
          setMessages(current => mergeMessages(current, [message]));
          if (message.sender_id !== myId) {
            markRead(roomId);
          }
        },
        onMessageUpdated: message =>
          setMessages(current => mergeMessages(current, [message])),
        onInfoUpdated: setInfo,
        onResync: loadLatest,
      }),
    [roomId, myId, markRead, loadLatest],
  );

  useEffect(
    () =>
      subscribeToMembership(roomId, {
        onLeft: userId => {
          if (userId === myId) {
            setRemoved(true);
          } else {
            loadMembers();
          }
        },
        onJoined: loadMembers,
        // Ada yang membuka chat → centang berubah tanpa memuat ulang daftar.
        onUpdated: change =>
          setMembers(current =>
            current.map(member =>
              member.user_id === change.user_id
                ? {
                    ...member,
                    role: change.role,
                    last_read_at: change.last_read_at,
                  }
                : member,
            ),
          ),
        onResync: loadMembers,
      }),
    [roomId, myId, loadMembers],
  );

  // Link gambar (versi kecil) untuk gelembung chat.
  useEffect(() => {
    const missing = messages
      .map(message => message.attachment_path)
      .filter((path): path is string => !!path && !imageUrls.has(path));
    if (missing.length === 0) {
      return;
    }
    let active = true;
    getChatImageUrls(missing, 'thumb')
      .then(urls => {
        if (active && urls.size > 0) {
          setImageUrls(current => new Map([...current, ...urls]));
        }
      })
      .catch(error => console.warn('Gagal membuat link gambar', error));
    return () => {
      active = false;
    };
  }, [messages, imageUrls]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // ─── Kirim ───
  const send = async () => {
    const text = draft.trim();
    if ((!text && !photo) || sending || removed) {
      return;
    }
    const id = crypto.randomUUID();
    const localImageUrl = photoPreview ?? undefined;
    const optimistic: LocalMessage = {
      id,
      room_id: roomId,
      sender_id: myId,
      kind: photo ? 'image' : 'text',
      content: text,
      attachment_path: null,
      attachment_width: null,
      attachment_height: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      localImageUrl,
      sending: true,
    };
    // Tampilkan dulu di layar, baru dikirim (id-nya dipakai lagi saat balasan server datang).
    setMessages(current => [optimistic, ...current]);
    setDraft('');
    const pendingPhoto = photo;
    setPhoto(null);
    setSending(true);

    try {
      let image;
      if (pendingPhoto) {
        const uploaded = await uploadChatImage(roomId, pendingPhoto);
        image = {
          path: uploaded.path,
          width: uploaded.width,
          height: uploaded.height,
        };
      }
      const saved = await sendMessage({
        id,
        roomId,
        senderId: myId,
        content: text,
        image,
      });
      setMessages(current => mergeMessages(current, [saved]));
      reload();
    } catch (error) {
      setMessages(current => current.filter(message => message.id !== id));
      await showError('Gagal mengirim pesan', error);
    } finally {
      setSending(false);
    }
  };

  const loadOlder = async () => {
    const oldest = messages[messages.length - 1];
    if (!oldest || loadingOlder) {
      return;
    }
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(roomId, oldest.created_at);
      setMessages(current => mergeMessages(current, older));
      setHasMore(older.length === MESSAGE_PAGE_SIZE);
    } catch (error) {
      await showError('Gagal memuat pesan lama', error);
    } finally {
      setLoadingOlder(false);
    }
  };

  const removeMessage = async (message: LocalMessage) => {
    const yes = await dialog.confirm({
      title: 'Hapus pesan?',
      message: 'Pesan ini akan hilang untuk semua anggota.',
      confirmLabel: 'Hapus',
      destructive: true,
    });
    if (!yes) {
      return;
    }
    try {
      await deleteMessage(message.id);
      reload();
    } catch (error) {
      await showError('Gagal menghapus pesan', error);
    }
  };

  const confirmClear = async () => {
    const yes = await dialog.confirm({
      title: 'Hapus chat ini?',
      message:
        'Riwayat hilang dari layar kamu saja. Anggota lain tetap melihat chatnya.',
      confirmLabel: 'Hapus',
      destructive: true,
    });
    if (!yes) {
      return;
    }
    try {
      await clearRoom(roomId);
      await reload();
      navigate('/chat');
    } catch (error) {
      await showError('Gagal menghapus chat', error);
    }
  };

  const confirmLeave = async () => {
    const yes = await dialog.confirm({
      title: 'Keluar dari grup?',
      message: 'Kamu tidak bisa membaca atau mengirim pesan di grup ini lagi.',
      confirmLabel: 'Keluar',
      destructive: true,
    });
    if (!yes) {
      return;
    }
    try {
      await leaveGroup(roomId);
      await reload();
      navigate('/chat');
    } catch (error) {
      await showError('Gagal keluar dari grup', error);
    }
  };

  // Pesan kita dianggap dibaca kalau SEMUA anggota lain sudah membuka chat setelahnya.
  const readByAllUntil = useMemo(() => {
    const others = members.filter(member => member.user_id !== myId);
    if (others.length === 0) {
      return null;
    }
    return Math.min(
      ...others.map(member => new Date(member.last_read_at).getTime()),
    );
  }, [members, myId]);

  const membersById = useMemo(
    () => new Map(members.map(member => [member.user_id, member.profile])),
    [members],
  );

  const title = isGroup
    ? (info?.name ?? 'Grup')
    : (peer?.profile?.full_name ?? 'Chat');
  const subtitle = isGroup
    ? `${members.length} anggota`
    : isOnline(peerPresence)
      ? 'Online'
      : formatLastSeen(peerPresence?.last_seen_at);

  return (
    <div className="chat-room">
      <header className="room-head">
        <button
          type="button"
          className="btn icon back-to-list"
          aria-label="Kembali ke daftar chat"
          onClick={() => navigate('/chat')}
        >
          <ArrowLeft size={20} />
        </button>
        <Avatar
          url={getAvatarUrl(
            isGroup ? info?.avatar_path : peer?.profile?.avatar_path,
          )}
          name={title}
          size={44}
          online={isGroup ? undefined : isOnline(peerPresence)}
        />
        <div className="head-text">
          <strong>{title}</strong>
          <small className={isOnline(peerPresence) && !isGroup ? 'online' : 'muted'}>
            {subtitle}
          </small>
        </div>
        <Menu
          label="Menu chat"
          trigger={<MoreVertical size={20} />}
          items={[
            ...(isGroup
              ? [
                  {
                    key: 'info',
                    label: 'Info grup',
                    icon: Info,
                    onSelect: () => setShowInfo(true),
                  },
                ]
              : []),
            {
              key: 'clear',
              label: 'Hapus chat',
              icon: Eraser,
              destructive: true,
              onSelect: confirmClear,
            },
            ...(isGroup && !removed
              ? [
                  {
                    key: 'leave',
                    label: 'Keluar grup',
                    icon: LogOut,
                    destructive: true,
                    onSelect: confirmLeave,
                  },
                ]
              : []),
          ]}
        />
      </header>

      <div className="messages">
        {status === 'loading' ? (
          <div className="empty">
            <span className="spinner" />
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const next = messages[index + 1];
              const showDay =
                !next || formatDay(next.created_at) !== formatDay(message.created_at);
              const mine = message.sender_id === myId;
              const senderName = message.sender_id
                ? (membersById.get(message.sender_id)?.full_name ?? 'Pengguna')
                : '';
              const read =
                mine &&
                readByAllUntil !== null &&
                new Date(message.created_at).getTime() <= readByAllUntil;

              return (
                <div key={message.id}>
                  {message.kind === 'system' ? (
                    <div className="system">{message.content}</div>
                  ) : (
                    <div className={`row${mine ? ' mine' : ''}`}>
                      <div className={`bubble${mine ? ' mine' : ''}`}>
                        {isGroup && !mine ? (
                          <span className="sender">{senderName}</span>
                        ) : null}

                        {message.deleted_at ? (
                          <p className="deleted">Pesan dihapus</p>
                        ) : (
                          <>
                            {message.attachment_path || message.localImageUrl ? (
                              <SecureImage
                                url={
                                  message.localImageUrl ??
                                  imageUrls.get(message.attachment_path!) ??
                                  null
                                }
                                alt="Gambar chat"
                                maxWidth={260}
                                maxHeight={260}
                              />
                            ) : null}
                            {message.content ? (
                              <p className="text">{message.content}</p>
                            ) : null}
                          </>
                        )}

                        <span className="meta">
                          {formatTime(message.created_at)}
                          {mine && !message.deleted_at ? (
                            message.sending ? (
                              <Check size={14} className="tick pending" />
                            ) : read ? (
                              <CheckCheck size={14} className="tick read" />
                            ) : (
                              <CheckCheck size={14} className="tick" />
                            )
                          ) : null}
                        </span>
                      </div>

                      {mine && !message.deleted_at && !message.sending ? (
                        <button
                          type="button"
                          className="btn icon delete"
                          aria-label="Hapus pesan"
                          onClick={() => removeMessage(message)}
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  )}
                  {showDay ? (
                    <div className="day">{formatDay(message.created_at)}</div>
                  ) : null}
                </div>
              );
            })}

            {hasMore && messages.length > 0 ? (
              <div className="older">
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? 'Memuat…' : 'Muat pesan lama'}
                </button>
              </div>
            ) : null}

            {messages.length === 0 ? (
              <div className="empty">
                <p>Belum ada pesan. Sapa duluan.</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {removed ? (
        <div className="removed-note">
          Kamu bukan anggota grup ini lagi, jadi tidak bisa mengirim pesan.
        </div>
      ) : (
        <footer className="composer-bar">
          {photoPreview ? (
            <div className="photo-chip">
              <img src={photoPreview} alt="Foto yang dipilih" />
              <button
                type="button"
                className="btn icon"
                aria-label="Batalkan foto"
                onClick={() => setPhoto(null)}
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className="input-row">
            <button
              type="button"
              className="btn icon"
              aria-label="Kirim gambar"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus size={20} />
            </button>
            <input
              className="input"
              placeholder={photo ? 'Tambahkan keterangan…' : 'Tulis pesan…'}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              className="btn icon send"
              aria-label="Kirim"
              onClick={send}
              disabled={sending || (!draft.trim() && !photo)}
            >
              <Send size={18} />
            </button>
          </div>
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
        </footer>
      )}

      {showInfo ? (
        <GroupInfoModal
          roomId={roomId}
          info={info}
          members={members}
          myId={myId}
          myName={profile?.full_name ?? ''}
          onClose={() => setShowInfo(false)}
          onChanged={() => {
            loadMembers();
            loadInfo();
          }}
          onLeft={() => {
            setShowInfo(false);
            reload();
            navigate('/chat');
          }}
        />
      ) : null}
    </div>
  );
}

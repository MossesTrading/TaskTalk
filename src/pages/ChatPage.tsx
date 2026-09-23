import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessagesSquare, Plus, Search } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { ChatRoom } from '../components/ChatRoom';
import { NewGroupModal } from '../components/NewGroupModal';
import { useChatInbox } from '../context/ChatInboxContext';
import { isOnline, usePresenceMap } from '../context/PresenceContext';
import { formatRoomTime } from '../lib/format';
import { getAvatarUrl } from '../lib/profile';
import type { ChatRoomSummary } from '../lib/chat';
import './ChatPage.css';

export function ChatPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { rooms, loadStatus, setOpenRoomId } = useChatInbox();
  const presence = usePresenceMap();
  const [query, setQuery] = useState('');
  const [newGroup, setNewGroup] = useState(false);

  // Room yang sedang dibuka tidak memunculkan notif chat masuk.
  useEffect(() => {
    setOpenRoomId(roomId ?? null);
    return () => setOpenRoomId(null);
  }, [roomId, setOpenRoomId]);

  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? rooms.filter(room =>
        (room.room_type === 'group'
          ? (room.room_name ?? '')
          : (room.peer_full_name ?? '')
        )
          .toLowerCase()
          .includes(keyword),
      )
    : rooms;

  return (
    <div className={`chat-page${roomId ? " has-room" : ""}`}>
      <aside className="room-list">
        <header>
          <h1>Chat</h1>
          <button
            type="button"
            className="btn icon"
            aria-label="Grup baru"
            title="Grup baru"
            onClick={() => setNewGroup(true)}
          >
            <Plus size={20} />
          </button>
        </header>
        <div className="search">
          <Search size={16} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Cari chat"
          />
        </div>

        <div className="rooms">
          {loadStatus === 'loading' ? (
            <div className="empty">
              <span className="spinner" />
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <MessagesSquare size={28} />
              <p>Belum ada chat. Mulai dari halaman Kontak.</p>
            </div>
          ) : (
            visible.map(room => (
              <RoomRow
                key={room.room_id}
                room={room}
                active={room.room_id === roomId}
                online={
                  room.room_type === 'direct' &&
                  isOnline(presence.get(room.peer_id ?? ''))
                }
                onClick={() => navigate(`/chat/${room.room_id}`)}
              />
            ))
          )}
        </div>
      </aside>

      <section className="room-view">
        {roomId ? (
          <ChatRoom key={roomId} roomId={roomId} />
        ) : (
          <div className="empty">
            <MessagesSquare size={34} />
            <h3>Pilih chat</h3>
            <p>Pilih obrolan di sebelah kiri, atau mulai dari halaman Kontak.</p>
          </div>
        )}
      </section>

      {newGroup ? (
        <NewGroupModal
          onClose={() => setNewGroup(false)}
          onCreated={id => {
            setNewGroup(false);
            navigate(`/chat/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}

function RoomRow({
  room,
  active,
  online,
  onClick,
}: {
  room: ChatRoomSummary;
  active: boolean;
  online: boolean;
  onClick: () => void;
}) {
  const isGroup = room.room_type === 'group';
  const title = isGroup
    ? (room.room_name ?? 'Grup')
    : (room.peer_full_name ?? 'Pengguna');
  const prefix =
    isGroup && room.last_message_sender_name
      ? `${room.last_message_sender_name}: `
      : '';
  const preview =
    room.last_message_kind === 'image'
      ? `${prefix}📷 ${room.last_message_preview || 'Foto'}`
      : `${prefix}${room.last_message_preview ?? ''}`;

  return (
    <button
      type="button"
      className={`room-row${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <Avatar
        url={getAvatarUrl(isGroup ? room.room_avatar_path : room.peer_avatar_path)}
        name={title}
        size={46}
        online={isGroup ? undefined : online}
      />
      <span className="room-text">
        <span className="top">
          <strong>{title}</strong>
          <small className="muted">{formatRoomTime(room.last_message_at)}</small>
        </span>
        <span className="bottom">
          <span className="preview">{preview}</span>
          {room.unread_count > 0 ? (
            <span className="unread">
              {room.unread_count > 99 ? '99+' : room.unread_count}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

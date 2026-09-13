import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageIcon, X } from 'lucide-react';
import { useChatInbox } from '../context/ChatInboxContext';
import { getAvatarUrl } from '../lib/profile';
import { Avatar } from './Avatar';
import './IncomingChatToast.css';

const AUTO_HIDE_MS = 6000;

// Notif kecil di pojok kanan bawah saat ada chat masuk dari room yang tidak sedang dibuka.
export function IncomingChatToast() {
  const { incoming, dismissIncoming } = useChatInbox();
  const navigate = useNavigate();

  useEffect(() => {
    if (!incoming) {
      return;
    }
    const timer = setTimeout(dismissIncoming, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [incoming, dismissIncoming]);

  if (!incoming) {
    return null;
  }

  const { room, message } = incoming;
  const isGroup = room.room_type === 'group';
  const title = isGroup
    ? (room.room_name ?? 'Grup')
    : (room.peer_full_name ?? 'Chat');
  const senderPrefix =
    isGroup && room.last_message_sender_name
      ? `${room.last_message_sender_name}: `
      : '';

  return (
    <div className="chat-toast" role="status">
      <button
        type="button"
        className="body"
        onClick={() => {
          dismissIncoming();
          navigate(`/chat/${room.room_id}`);
        }}
      >
        <Avatar
          url={getAvatarUrl(
            isGroup ? room.room_avatar_path : room.peer_avatar_path,
          )}
          name={title}
          size={40}
        />
        <span className="text">
          <strong>{title}</strong>
          <span className="preview">
            {message.kind === 'image' ? (
              <>
                <ImageIcon size={14} /> {senderPrefix}
                {message.content || 'Foto'}
              </>
            ) : (
              `${senderPrefix}${message.content}`
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="btn icon"
        aria-label="Tutup"
        onClick={dismissIncoming}
      >
        <X size={18} />
      </button>
    </div>
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchRooms,
  markRoomRead,
  subscribeToInbox,
  type ChatMessage,
  type ChatRoomSummary,
} from '../lib/chat';
import { getAvatarUrl } from '../lib/profile';
import { showChatNotification } from '../lib/webNotifications';
import { useAuth } from './AuthContext';

type LoadStatus = 'loading' | 'ready' | 'error';

// Isi notif "chat masuk" di pojok layar.
export type IncomingChat = {
  key: string;
  room: ChatRoomSummary;
  message: ChatMessage;
};

type ChatInboxValue = {
  rooms: ChatRoomSummary[];
  loadStatus: LoadStatus;
  totalUnread: number;
  reload: () => Promise<void>;
  markRead: (roomId: string) => void;
  // Room yang sedang dibuka: pesan masuk dari room ini tidak dijadikan notif.
  setOpenRoomId: (roomId: string | null) => void;
  incoming: IncomingChat | null;
  dismissIncoming: () => void;
};

const ChatInboxContext = createContext<ChatInboxValue | null>(null);

// Satu sumber data daftar chat: halaman Chat, angka di menu samping, & notif chat masuk.
export function ChatInboxProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [incoming, setIncoming] = useState<IncomingChat | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBanner = useRef<ChatMessage | null>(null);
  const openRoomId = useRef<string | null>(null);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      const list = await fetchRooms();
      setRooms(list);
      setLoadStatus('ready');

      const message = pendingBanner.current;
      pendingBanner.current = null;
      if (message) {
        const room = list.find(item => item.room_id === message.room_id);
        if (room) {
          setIncoming({ key: message.id, room, message });
          // Tab TalkTask tidak sedang dilihat → pakai notifikasi browser, supaya
          // tetap muncul walau user sedang di tab lain.
          if (document.visibilityState !== 'visible') {
            notifyBrowser(room, message, () => navigate(`/chat/${room.room_id}`));
          }
        }
      }
    } catch (error) {
      console.warn('Gagal memuat daftar chat', error);
      setLoadStatus(prev => (prev === 'ready' ? 'ready' : 'error'));
    }
  }, [navigate]);

  useEffect(() => {
    if (myId) {
      reload();
    }
  }, [myId, reload]);

  useEffect(() => {
    if (!myId) {
      return;
    }
    const unsubscribe = subscribeToInbox({
      onMessage: message => {
        if (
          message.sender_id !== myId &&
          message.room_id !== openRoomId.current
        ) {
          pendingBanner.current = message;
        }
        // Pesan beruntun digabung jadi satu kali muat ulang.
        if (reloadTimer.current) {
          clearTimeout(reloadTimer.current);
        }
        reloadTimer.current = setTimeout(reload, 300);
      },
      onResync: reload,
    });
    return () => {
      unsubscribe();
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
      }
    };
  }, [myId, reload]);

  const markRead = useCallback((roomId: string) => {
    setRooms(current =>
      current.map(room =>
        room.room_id === roomId ? { ...room, unread_count: 0 } : room,
      ),
    );
    markRoomRead(roomId);
  }, []);

  const setOpenRoomId = useCallback((roomId: string | null) => {
    openRoomId.current = roomId;
  }, []);

  const dismissIncoming = useCallback(() => setIncoming(null), []);

  const value = useMemo<ChatInboxValue>(
    () => ({
      rooms,
      loadStatus,
      totalUnread: rooms.reduce((sum, room) => sum + room.unread_count, 0),
      reload,
      markRead,
      setOpenRoomId,
      incoming,
      dismissIncoming,
    }),
    [
      rooms,
      loadStatus,
      reload,
      markRead,
      setOpenRoomId,
      incoming,
      dismissIncoming,
    ],
  );

  return (
    <ChatInboxContext.Provider value={value}>
      {children}
    </ChatInboxContext.Provider>
  );
}

// Isi notifikasi browser untuk satu pesan masuk.
function notifyBrowser(
  room: ChatRoomSummary,
  message: ChatMessage,
  onClick: () => void,
) {
  const isGroup = room.room_type === 'group';
  const title = isGroup
    ? (room.room_name ?? 'Grup')
    : (room.peer_full_name ?? 'Chat');
  const senderPrefix =
    isGroup && room.last_message_sender_name
      ? `${room.last_message_sender_name}: `
      : '';
  const body =
    message.kind === 'image'
      ? `${senderPrefix}📷 ${message.content || 'Foto'}`
      : `${senderPrefix}${message.content}`;
  showChatNotification({
    title,
    body,
    icon: getAvatarUrl(isGroup ? room.room_avatar_path : room.peer_avatar_path),
    tag: `chat:${room.room_id}`,
    onClick,
  });
}

export function useChatInbox() {
  const value = useContext(ChatInboxContext);
  if (!value) {
    throw new Error('useChatInbox harus dipakai di dalam ChatInboxProvider');
  }
  return value;
}

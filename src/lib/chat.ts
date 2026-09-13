import { listenToTables } from './realtime';
import { getSignedImageUrls, uploadImage } from './storage';
import { supabase } from './supabase';

export type ChatRoomSummary = {
  room_id: string;
  room_type: 'direct' | 'group';
  room_name: string | null;
  room_avatar_path: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_kind: 'text' | 'image' | 'system' | null;
  last_message_sender_id: string | null;
  last_message_sender_name: string | null;
  peer_id: string | null;
  peer_full_name: string | null;
  peer_avatar_path: string | null;
  unread_count: number;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  sender_id: string | null;
  // 'system' = pesan otomatis dari server, misalnya "Andi membuat grup".
  kind: 'text' | 'image' | 'system';
  content: string;
  attachment_path: string | null;
  attachment_width: number | null;
  attachment_height: number | null;
  deleted_at: string | null;
  created_at: string;
};

export type ChatRoomInfo = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  avatar_path: string | null;
};

export type RoomMember = {
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  // Terakhir kali anggota ini membuka room → dasar tanda "sudah dibaca".
  last_read_at: string;
  profile: {
    id: string;
    full_name: string;
    avatar_path: string | null;
  } | null;
};

export type MemberChange = {
  user_id: string;
  role: RoomMember['role'];
  last_read_at: string;
};

export const MESSAGE_PAGE_SIZE = 50;
export const GROUP_NAME_MAX_LENGTH = 60;
const MESSAGE_COLUMNS =
  'id, room_id, sender_id, kind, content, attachment_path, attachment_width, attachment_height, deleted_at, created_at';

// Bucket private: gambar chat hanya bisa dibuka anggota room (folder = id room).
const CHAT_MEDIA_BUCKET = 'chat-media';
const CHAT_IMAGE_URL_TTL_SECONDS = 60 * 60;
const CHAT_THUMB_TRANSFORM = {
  width: 600,
  quality: 70,
  resize: 'contain',
} as const;

export async function createGroup(input: {
  name: string;
  memberIds: string[];
  avatarPath: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('chat_create_group', {
    p_name: input.name.trim(),
    p_member_ids: input.memberIds,
    p_avatar_path: input.avatarPath,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

export async function fetchRoomInfo(
  roomId: string,
): Promise<ChatRoomInfo | null> {
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('id, type, name, avatar_path')
    .eq('id', roomId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data as ChatRoomInfo | null;
}

// Admin dulu, lalu urut sesuai waktu bergabung.
export async function fetchRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase
    .from('chat_room_members')
    .select(
      'user_id, role, joined_at, last_read_at, profile:user_id(id, full_name, avatar_path)',
    )
    .eq('room_id', roomId)
    .order('joined_at');
  if (error) {
    throw error;
  }
  const members = data as unknown as RoomMember[];
  return [...members].sort(
    (a, b) => Number(b.role === 'admin') - Number(a.role === 'admin'),
  );
}

export async function fetchRooms(): Promise<ChatRoomSummary[]> {
  const { data, error } = await supabase.rpc('chat_list_rooms');
  if (error) {
    throw error;
  }
  return data as ChatRoomSummary[];
}

export async function getOrCreateDirectRoom(
  otherUserId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('chat_get_or_create_direct_room', {
    p_other_user_id: otherUserId,
  });
  if (error) {
    throw error;
  }
  return data as string;
}

// Pesan terbaru dulu. `before` untuk memuat pesan yang lebih lama.
export async function fetchMessages(
  roomId: string,
  before?: string,
): Promise<ChatMessage[]> {
  let query = supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before) {
    query = query.lt('created_at', before);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data as ChatMessage[];
}

export async function sendMessage(message: {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  image?: { path: string; width?: number; height?: number };
}): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      id: message.id,
      room_id: message.roomId,
      sender_id: message.senderId,
      kind: message.image ? 'image' : 'text',
      content: message.content,
      attachment_path: message.image?.path ?? null,
      attachment_width: message.image?.width ?? null,
      attachment_height: message.image?.height ?? null,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  return data as ChatMessage;
}

// Upload gambar ke folder room (ukuran dikecilkan & metadata hilang).
export function uploadChatImage(roomId: string, file: File) {
  return uploadImage({
    bucket: CHAT_MEDIA_BUCKET,
    folder: roomId,
    prefix: 'img',
    file,
  });
}

// 'thumb' untuk gelembung chat (hemat kuota), 'full' saat gambar dibuka besar.
export function getChatImageUrls(paths: string[], size: 'thumb' | 'full') {
  return getSignedImageUrls({
    bucket: CHAT_MEDIA_BUCKET,
    paths,
    ttlSeconds: CHAT_IMAGE_URL_TTL_SECONDS,
    transform: size === 'thumb' ? CHAT_THUMB_TRANSFORM : undefined,
  });
}

// Hapus pesan untuk semua anggota. File gambarnya ikut dihapus.
export async function deleteMessage(messageId: string) {
  const { data, error } = await supabase.rpc('chat_delete_message', {
    p_message_id: messageId,
  });
  if (error) {
    throw error;
  }
  const path = data as string | null;
  if (path) {
    const { error: removeError } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .remove([path]);
    if (removeError) {
      console.warn('Gagal menghapus file gambar', removeError);
    }
  }
}

// "Hapus chat": kosongkan riwayat & sembunyikan room hanya untuk diri sendiri.
export async function clearRoom(roomId: string) {
  const { error } = await supabase.rpc('chat_clear_room', { p_room_id: roomId });
  if (error) {
    throw error;
  }
}

export async function leaveGroup(roomId: string) {
  const { error } = await supabase.rpc('chat_leave_group', { p_room_id: roomId });
  if (error) {
    throw error;
  }
}

export async function removeMember(roomId: string, userId: string) {
  const { error } = await supabase.rpc('chat_remove_member', {
    p_room_id: roomId,
    p_user_id: userId,
  });
  if (error) {
    throw error;
  }
}

export async function markRoomRead(roomId: string) {
  const { error } = await supabase.rpc('chat_mark_room_read', {
    p_room_id: roomId,
  });
  if (error) {
    console.warn('Gagal menandai pesan sudah dibaca', error);
  }
}

// Pesan baru & pesan yang dihapus di satu room.
export function subscribeToRoom(
  roomId: string,
  handlers: {
    onMessage: (message: ChatMessage) => void;
    onMessageUpdated: (message: ChatMessage) => void;
    onResync: () => void;
  },
) {
  const filter = `room_id=eq.${roomId}`;
  return listenToTables(
    `chat-room:${roomId}`,
    [
      {
        event: 'INSERT',
        table: 'chat_messages',
        filter,
        onChange: change => handlers.onMessage(change.new as ChatMessage),
      },
      {
        event: 'UPDATE',
        table: 'chat_messages',
        filter,
        onChange: change => handlers.onMessageUpdated(change.new as ChatMessage),
      },
    ],
    { onResync: handlers.onResync },
  );
}

// Anggota masuk, berubah (baca chat / jadi admin), keluar / dikeluarkan.
export function subscribeToMembership(
  roomId: string,
  handlers: {
    onLeft: (userId: string) => void;
    onJoined?: () => void;
    onUpdated?: (change: MemberChange) => void;
    onResync: () => void;
  },
) {
  const filter = `room_id=eq.${roomId}`;
  return listenToTables(
    `chat-members:${roomId}`,
    [
      {
        event: 'INSERT',
        table: 'chat_room_members',
        filter,
        onChange: () => handlers.onJoined?.(),
      },
      {
        event: 'UPDATE',
        table: 'chat_room_members',
        filter,
        onChange: change => {
          const row = change.new as MemberChange;
          handlers.onUpdated?.({
            user_id: row.user_id,
            role: row.role,
            last_read_at: row.last_read_at,
          });
        },
      },
      {
        // Event DELETE tidak bisa difilter: cek room_id dari primary key yang dibawa event.
        event: 'DELETE',
        table: 'chat_room_members',
        onChange: change => {
          const row = change.old as { room_id?: string; user_id?: string };
          if (row.room_id === roomId && row.user_id) {
            handlers.onLeft(row.user_id);
          }
        },
      },
    ],
    { onResync: handlers.onResync },
  );
}

// Semua pesan baru yang boleh dilihat user (RLS menyaring per room), untuk daftar chat.
export function subscribeToInbox(handlers: {
  onMessage: (message: ChatMessage) => void;
  onResync: () => void;
}) {
  return listenToTables(
    'chat-inbox',
    [
      {
        event: 'INSERT',
        table: 'chat_messages',
        onChange: change => handlers.onMessage(change.new as ChatMessage),
      },
    ],
    { onResync: handlers.onResync },
  );
}

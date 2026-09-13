import { listenToTables, type TableListener } from './realtime';
import { getSignedImageUrls, uploadImage } from './storage';
import { supabase } from './supabase';

export const STATUS_MAX_LENGTH = 500;
export const COMMENT_MAX_LENGTH = 1000;
// Status hilang otomatis setelah 24 jam (dijaga juga oleh RLS & pg_cron di database).
export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function isStatusActive(post: { created_at: string }, now = Date.now()) {
  return now - new Date(post.created_at).getTime() < STATUS_LIFETIME_MS;
}

// Bucket private: foto status hanya bisa dibuka lewat link sementara.
const STATUS_MEDIA_BUCKET = 'chat-status-media';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const THUMB_TRANSFORM = { width: 720, quality: 70, resize: 'contain' } as const;

export type StatusPost = {
  id: string;
  content: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
  updated_at: string | null;
  author_id: string;
  author_full_name: string;
  author_avatar_path: string | null;
  author_job: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  // Link sementara ke foto, dibuat setelah data dimuat.
  image_url: string | null;
};

export type StatusComment = {
  id: string;
  status_id: string;
  content: string;
  created_at: string;
  author_id: string;
  author: {
    id: string;
    full_name: string;
    avatar_path: string | null;
  } | null;
  // Balasan: komentar & orang yang dibalas (divalidasi server).
  reply_to_comment_id: string | null;
  reply_to_user_id: string | null;
  reply_to_user: { id: string; full_name: string } | null;
};

// Target balasan: komentar tertentu, atau langsung ke pemilik status.
export type CommentReplyTarget = {
  userId: string;
  name: string;
  commentId?: string;
};

type StatusRow = Omit<StatusPost, 'image_url'>;
export type StatusImageSize = 'thumb' | 'full';

async function attachImageUrls(
  rows: StatusRow[],
  size: StatusImageSize,
): Promise<StatusPost[]> {
  const paths = rows
    .map(row => row.image_path)
    .filter((path): path is string => path !== null);
  const urls = await getSignedImageUrls({
    bucket: STATUS_MEDIA_BUCKET,
    paths,
    ttlSeconds: SIGNED_URL_TTL_SECONDS,
    transform: size === 'thumb' ? THUMB_TRANSFORM : undefined,
  });

  return rows.map(row => ({
    ...row,
    image_url: row.image_path ? (urls.get(row.image_path) ?? null) : null,
  }));
}

export async function fetchStatuses(limit = 50): Promise<StatusPost[]> {
  const { data, error } = await supabase.rpc('chat_list_statuses', {
    p_limit: limit,
  });
  if (error) {
    throw error;
  }
  return attachImageUrls(data as StatusRow[], 'thumb');
}

export async function fetchStatus(
  id: string,
  size: StatusImageSize = 'thumb',
): Promise<StatusPost | null> {
  const { data, error } = await supabase.rpc('chat_list_statuses', {
    p_limit: 1,
    p_status_id: id,
  });
  if (error) {
    throw error;
  }
  const [post] = await attachImageUrls(data as StatusRow[], size);
  return post ?? null;
}

export async function createStatus(input: {
  authorId: string;
  content: string;
  image: File | null;
}) {
  const content = input.content.trim() || null;
  const uploaded = input.image
    ? await uploadImage({
        bucket: STATUS_MEDIA_BUCKET,
        folder: input.authorId,
        prefix: 'status',
        file: input.image,
      })
    : null;

  const { error } = await supabase.from('chat_statuses').insert({
    author_id: input.authorId,
    content,
    image_path: uploaded?.path ?? null,
    image_width: uploaded?.width ?? null,
    image_height: uploaded?.height ?? null,
  });
  if (error) {
    // Jangan tinggalkan foto yatim kalau status gagal disimpan.
    if (uploaded) {
      await supabase.storage.from(STATUS_MEDIA_BUCKET).remove([uploaded.path]);
    }
    throw error;
  }
}

// Hanya teks/keterangan yang bisa diedit; fotonya tetap.
export async function updateStatusContent(id: string, content: string) {
  const { error } = await supabase
    .from('chat_statuses')
    .update({ content: content.trim() || null })
    .eq('id', id);
  if (error) {
    throw error;
  }
}

export async function deleteStatus(
  post: Pick<StatusPost, 'id' | 'image_path'>,
) {
  const { error } = await supabase
    .from('chat_statuses')
    .delete()
    .eq('id', post.id);
  if (error) {
    throw error;
  }
  if (post.image_path) {
    await supabase.storage.from(STATUS_MEDIA_BUCKET).remove([post.image_path]);
  }
}

export async function setStatusLiked(
  statusId: string,
  userId: string,
  liked: boolean,
) {
  const { error } = liked
    ? await supabase
        .from('chat_status_likes')
        .insert({ status_id: statusId, user_id: userId })
    : await supabase
        .from('chat_status_likes')
        .delete()
        .eq('status_id', statusId)
        .eq('user_id', userId);
  // 23505 = sudah disukai sebelumnya (klik dobel): anggap berhasil.
  if (error && error.code !== '23505') {
    throw error;
  }
}

const COMMENT_COLUMNS =
  'id, status_id, content, created_at, author_id, author:author_id(id, full_name, avatar_path), reply_to_comment_id, reply_to_user_id, reply_to_user:reply_to_user_id(id, full_name)';

export async function fetchComments(
  statusId: string,
): Promise<StatusComment[]> {
  const { data, error } = await supabase
    .from('chat_status_comments')
    .select(COMMENT_COLUMNS)
    .eq('status_id', statusId)
    .order('created_at', { ascending: true });
  if (error) {
    throw error;
  }
  return data as unknown as StatusComment[];
}

export async function addComment(
  statusId: string,
  authorId: string,
  content: string,
  replyTo?: CommentReplyTarget | null,
): Promise<StatusComment> {
  const { data, error } = await supabase
    .from('chat_status_comments')
    .insert({
      status_id: statusId,
      author_id: authorId,
      content: content.trim(),
      reply_to_comment_id: replyTo?.commentId ?? null,
      // Kalau membalas komentar, server mengisi sendiri penulis komentar tersebut.
      reply_to_user_id: replyTo?.commentId ? null : (replyTo?.userId ?? null),
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  return data as unknown as StatusComment;
}

export async function fetchComment(id: string): Promise<StatusComment | null> {
  const { data, error } = await supabase
    .from('chat_status_comments')
    .select(COMMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data as unknown as StatusComment | null;
}

export async function deleteComment(id: string) {
  const { error } = await supabase
    .from('chat_status_comments')
    .delete()
    .eq('id', id);
  if (error) {
    throw error;
  }
}

// Perubahan status dari server: jumlah suka/komentar & teks terbaru.
export type StatusChange = Pick<
  StatusPost,
  'id' | 'content' | 'updated_at' | 'like_count' | 'comment_count'
>;

export type StatusRealtimeHandlers = {
  onStatusInserted?: (id: string) => void;
  onStatusUpdated?: (change: StatusChange) => void;
  onStatusDeleted?: (id: string) => void;
  // Suka/batal suka milik user sendiri (misalnya dari HP).
  onMyLikeChanged?: (statusId: string, liked: boolean) => void;
  onCommentInserted?: (comment: { id: string; status_id: string }) => void;
  onCommentDeleted?: (id: string) => void;
};

// `statusId` = hanya satu status (halaman detail).
export function subscribeToStatuses(options: {
  channel: string;
  userId: string;
  statusId?: string;
  handlers: StatusRealtimeHandlers;
  onResync: () => void;
}) {
  const { handlers, statusId, userId } = options;
  const listeners: TableListener[] = [];

  if (handlers.onStatusInserted) {
    const onInserted = handlers.onStatusInserted;
    listeners.push({
      event: 'INSERT',
      table: 'chat_statuses',
      onChange: change => onInserted((change.new as { id: string }).id),
    });
  }
  if (handlers.onStatusUpdated) {
    const onUpdated = handlers.onStatusUpdated;
    listeners.push({
      event: 'UPDATE',
      table: 'chat_statuses',
      filter: statusId ? `id=eq.${statusId}` : undefined,
      onChange: change => {
        const row = change.new as StatusChange;
        onUpdated({
          id: row.id,
          content: row.content,
          updated_at: row.updated_at,
          like_count: row.like_count,
          comment_count: row.comment_count,
        });
      },
    });
  }
  if (handlers.onStatusDeleted) {
    const onDeleted = handlers.onStatusDeleted;
    listeners.push({
      event: 'DELETE',
      table: 'chat_statuses',
      onChange: change => onDeleted((change.old as { id: string }).id),
    });
  }
  if (handlers.onMyLikeChanged) {
    const onLike = handlers.onMyLikeChanged;
    // Suka baru: hanya milik sendiri (suka orang lain sudah terlihat dari like_count).
    listeners.push({
      event: 'INSERT',
      table: 'chat_status_likes',
      filter: `user_id=eq.${userId}`,
      onChange: change =>
        onLike((change.new as { status_id: string }).status_id, true),
    });
    // DELETE tidak bisa difilter; primary key suka = (status_id, user_id).
    listeners.push({
      event: 'DELETE',
      table: 'chat_status_likes',
      onChange: change => {
        const row = change.old as { status_id?: string; user_id?: string };
        if (row.user_id === userId && row.status_id) {
          onLike(row.status_id, false);
        }
      },
    });
  }
  if (handlers.onCommentInserted) {
    const onComment = handlers.onCommentInserted;
    listeners.push({
      event: 'INSERT',
      table: 'chat_status_comments',
      filter: statusId ? `status_id=eq.${statusId}` : undefined,
      onChange: change =>
        onComment(change.new as { id: string; status_id: string }),
    });
  }
  if (handlers.onCommentDeleted) {
    const onCommentDeleted = handlers.onCommentDeleted;
    listeners.push({
      event: 'DELETE',
      table: 'chat_status_comments',
      onChange: change => onCommentDeleted((change.old as { id: string }).id),
    });
  }

  return listenToTables(options.channel, listeners, {
    onResync: options.onResync,
  });
}

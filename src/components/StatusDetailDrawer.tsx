import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatAge } from '../lib/format';
import { getAvatarUrl } from '../lib/profile';
import {
  addComment,
  COMMENT_MAX_LENGTH,
  deleteComment,
  fetchComment,
  fetchComments,
  fetchStatus,
  subscribeToStatuses,
  type CommentReplyTarget,
  type StatusComment,
  type StatusPost,
} from '../lib/statuses';
import { Avatar } from './Avatar';
import { useDialog, useErrorDialog } from './Dialog';
import { SecureImage } from './SecureImage';
import './StatusDetailDrawer.css';

type Props = {
  statusId: string;
  // Dari notif lonceng: komentar yang disorot sebentar.
  highlightCommentId: string | null;
  onClose: () => void;
  onCountsChanged: (
    statusId: string,
    counts: { like_count: number; comment_count: number },
  ) => void;
};

// Panel kanan: status lengkap + komentar, termasuk balasan dengan @.
export function StatusDetailDrawer({
  statusId,
  highlightCommentId,
  onClose,
  onCountsChanged,
}: Props) {
  const { session, profile } = useAuth();
  const myId = session!.user.id;
  const dialog = useDialog();
  const showError = useErrorDialog();
  const [post, setPost] = useState<StatusPost | null>(null);
  const [comments, setComments] = useState<StatusComment[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(
    'loading',
  );
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommentReplyTarget | null>(null);
  const [sending, setSending] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);
  // Komentar yang disorot ditentukan sekali saat panel dibuka.
  const [highlighted] = useState(highlightCommentId);

  const load = useCallback(async () => {
    try {
      const [detail, list] = await Promise.all([
        fetchStatus(statusId, 'full'),
        fetchComments(statusId),
      ]);
      if (!detail) {
        setStatus('missing');
        return;
      }
      setPost(detail);
      setComments(list);
      setStatus('ready');
    } catch (error) {
      console.warn('Gagal memuat status', error);
    }
  }, [statusId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribeToStatuses({
        channel: `status-detail:${statusId}`,
        userId: myId,
        statusId,
        handlers: {
          onStatusUpdated: change => {
            setPost(current => (current ? { ...current, ...change } : current));
            onCountsChanged(statusId, {
              like_count: change.like_count,
              comment_count: change.comment_count,
            });
          },
          onStatusDeleted: id => {
            if (id === statusId) {
              setStatus('missing');
            }
          },
          onCommentInserted: async ({ id }) => {
            try {
              const comment = await fetchComment(id);
              if (comment) {
                setComments(current =>
                  current.some(item => item.id === comment.id)
                    ? current
                    : [...current, comment],
                );
              }
            } catch (error) {
              console.warn('Gagal memuat komentar baru', error);
            }
          },
          onCommentDeleted: id =>
            setComments(current => current.filter(item => item.id !== id)),
        },
        onResync: load,
      }),
    [statusId, myId, load, onCountsChanged],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [comments.length]);

  // Orang yang bisa dibalas: pemilik status + semua yang berkomentar (kecuali diri sendiri).
  const candidates = useMemo(() => {
    const byUser = new Map<string, CommentReplyTarget>();
    if (post && post.author_id !== myId) {
      byUser.set(post.author_id, {
        userId: post.author_id,
        name: post.author_full_name,
      });
    }
    for (const comment of comments) {
      if (comment.author_id !== myId && comment.author) {
        byUser.set(comment.author_id, {
          userId: comment.author_id,
          name: comment.author.full_name,
          commentId: comment.id,
        });
      }
    }
    return [...byUser.values()];
  }, [post, comments, myId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) {
      return;
    }
    setSending(true);
    try {
      const comment = await addComment(statusId, myId, text, replyTo);
      setComments(current =>
        current.some(item => item.id === comment.id)
          ? current
          : [...current, comment],
      );
      setDraft('');
      setReplyTo(null);
    } catch (error) {
      await showError('Gagal mengirim komentar', error);
    } finally {
      setSending(false);
    }
  };

  const removeComment = async (comment: StatusComment) => {
    const yes = await dialog.confirm({
      title: 'Hapus komentar?',
      confirmLabel: 'Hapus',
      destructive: true,
    });
    if (!yes) {
      return;
    }
    try {
      await deleteComment(comment.id);
      setComments(current => current.filter(item => item.id !== comment.id));
    } catch (error) {
      await showError('Gagal menghapus komentar', error);
    }
  };

  const startReply = (target: CommentReplyTarget) => {
    setReplyTo(target);
    setDraft(current =>
      current.startsWith(`@${target.name}`) ? current : `@${target.name} `,
    );
  };

  return (
    <aside className="detail-drawer" aria-label="Detail status">
      <header>
        <strong>Status</strong>
        <button
          type="button"
          className="btn icon"
          aria-label="Tutup"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>

      {status === 'loading' ? (
        <div className="empty">
          <span className="spinner" />
        </div>
      ) : status === 'missing' || !post ? (
        <div className="empty">
          <h3>Status tidak ada</h3>
          <p>Mungkin sudah dihapus atau lewat 24 jam.</p>
        </div>
      ) : (
        <>
          <div className="detail-body">
            <div className="post">
              <div className="who">
                <Avatar
                  url={getAvatarUrl(post.author_avatar_path)}
                  name={post.author_full_name}
                  size={40}
                />
                <div>
                  <strong>{post.author_full_name}</strong>
                  <small className="muted">
                    {formatAge(post.created_at)} lalu
                  </small>
                </div>
              </div>
              {post.content ? <p className="content">{post.content}</p> : null}
              {post.image_path ? (
                <SecureImage
                  url={post.image_url}
                  alt={`Foto status ${post.author_full_name}`}
                  maxWidth={340}
                  maxHeight={360}
                />
              ) : null}
              <small className="muted counts">
                {post.like_count} suka · {post.comment_count} komentar
              </small>
            </div>

            <ul className="comments">
              {comments.map(comment => (
                <li
                  key={comment.id}
                  className={
                    comment.id === highlighted ? 'highlight' : undefined
                  }
                >
                  <Avatar
                    url={getAvatarUrl(comment.author?.avatar_path)}
                    name={comment.author?.full_name}
                    size={34}
                  />
                  <div className="bubble">
                    <div className="line">
                      <strong>{comment.author?.full_name ?? 'Pengguna'}</strong>
                      <small className="muted">
                        {formatAge(comment.created_at)}
                      </small>
                      {comment.author_id === myId ? (
                        <button
                          type="button"
                          className="btn icon small-icon"
                          aria-label="Hapus komentar"
                          onClick={() => removeComment(comment)}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                    <p>
                      {comment.reply_to_user ? (
                        <span className="mention">
                          @{comment.reply_to_user.full_name}{' '}
                        </span>
                      ) : null}
                      {comment.content}
                    </p>
                    {comment.author_id !== myId && comment.author ? (
                      <button
                        type="button"
                        className="reply"
                        onClick={() =>
                          startReply({
                            userId: comment.author_id,
                            name: comment.author!.full_name,
                            commentId: comment.id,
                          })
                        }
                      >
                        Balas
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              <div ref={listEnd} />
            </ul>
          </div>

          <footer className="composer-row">
            {replyTo ? (
              <div className="reply-chip">
                Membalas <strong>{replyTo.name}</strong>
                <button
                  type="button"
                  aria-label="Batal membalas"
                  onClick={() => {
                    setReplyTo(null);
                    setDraft(current =>
                      current.replace(`@${replyTo.name}`, '').trimStart(),
                    );
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : candidates.length > 0 && !draft ? (
              <div className="reply-suggest">
                {candidates.slice(0, 3).map(candidate => (
                  <button
                    key={candidate.userId}
                    type="button"
                    onClick={() => startReply(candidate)}
                  >
                    @{candidate.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="input-row">
              <Avatar
                url={getAvatarUrl(profile?.avatar_path)}
                name={profile?.full_name}
                size={34}
              />
              <input
                className="input"
                placeholder="Tulis komentar…"
                maxLength={COMMENT_MAX_LENGTH}
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
                aria-label="Kirim komentar"
                onClick={send}
                disabled={sending || !draft.trim()}
              >
                <Send size={18} />
              </button>
            </div>
          </footer>
        </>
      )}
    </aside>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart,
  ImagePlus,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { useDialog, useErrorDialog } from '../components/Dialog';
import { Menu } from '../components/Menu';
import { NotificationBell } from '../components/NotificationBell';
import { SecureImage } from '../components/SecureImage';
import { StatusDetailDrawer } from '../components/StatusDetailDrawer';
import { useAuth } from '../context/AuthContext';
import { formatAge } from '../lib/format';
import { getAvatarUrl } from '../lib/profile';
import {
  createStatus,
  deleteStatus,
  fetchStatus,
  fetchStatuses,
  isStatusActive,
  setStatusLiked,
  STATUS_MAX_LENGTH,
  subscribeToStatuses,
  updateStatusContent,
  type StatusPost,
} from '../lib/statuses';
import './FeedPage.css';

type Opened = { statusId: string; highlightCommentId?: string | null };

// Beranda: status teks/foto yang hilang otomatis setelah 24 jam.
export function FeedPage() {
  const { session, profile } = useAuth();
  const myId = session!.user.id;
  const dialog = useDialog();
  const showError = useErrorDialog();
  const [posts, setPosts] = useState<StatusPost[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [opened, setOpened] = useState<Opened | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setPosts(await fetchStatuses());
      setStatus('ready');
    } catch (error) {
      console.warn('Gagal memuat status', error);
      setStatus(current => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Status yang lewat 24 jam langsung hilang dari layar & label waktunya ikut jalan.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const updatePost = useCallback(
    (id: string, change: (post: StatusPost) => StatusPost) =>
      setPosts(current =>
        current.map(post => (post.id === id ? change(post) : post)),
      ),
    [],
  );

  useEffect(
    () =>
      subscribeToStatuses({
        channel: 'status-feed',
        userId: myId,
        handlers: {
          onStatusInserted: async id => {
            try {
              const post = await fetchStatus(id);
              if (post) {
                setPosts(current =>
                  current.some(item => item.id === post.id)
                    ? current
                    : [post, ...current],
                );
              }
            } catch (error) {
              console.warn('Gagal memuat status baru', error);
            }
          },
          onStatusUpdated: change =>
            updatePost(change.id, post => ({ ...post, ...change })),
          onStatusDeleted: id =>
            setPosts(current => current.filter(post => post.id !== id)),
          onMyLikeChanged: (statusId, liked) =>
            updatePost(statusId, post => ({ ...post, liked_by_me: liked })),
        },
        onResync: load,
      }),
    [myId, load, updatePost],
  );

  const visible = useMemo(
    () => posts.filter(post => isStatusActive(post, now)),
    [posts, now],
  );

  const toggleLike = async (post: StatusPost) => {
    const liked = !post.liked_by_me;
    // Tampilkan dulu, baru kirim ke server (kalau gagal dikembalikan).
    updatePost(post.id, current => ({
      ...current,
      liked_by_me: liked,
      like_count: current.like_count + (liked ? 1 : -1),
    }));
    try {
      await setStatusLiked(post.id, myId, liked);
    } catch (error) {
      updatePost(post.id, current => ({
        ...current,
        liked_by_me: !liked,
        like_count: current.like_count + (liked ? -1 : 1),
      }));
      await showError('Gagal menyimpan suka', error);
    }
  };

  const removeStatus = async (post: StatusPost) => {
    const yes = await dialog.confirm({
      title: 'Hapus status?',
      message: 'Status ini akan hilang untuk semua orang.',
      confirmLabel: 'Hapus',
      destructive: true,
    });
    if (!yes) {
      return;
    }
    try {
      await deleteStatus(post);
      setPosts(current => current.filter(item => item.id !== post.id));
    } catch (error) {
      await showError('Gagal menghapus status', error);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Beranda</h1>
          <p className="sub">Status hilang otomatis setelah 24 jam.</p>
        </div>
        <div className="spacer" />
        <NotificationBell
          onOpenStatus={(statusId, highlightCommentId) =>
            setOpened({ statusId, highlightCommentId })
          }
        />
      </header>

      <div className="page-body">
        <div className="feed">
          <Composer
            avatarUrl={getAvatarUrl(profile?.avatar_path)}
            name={profile?.full_name}
            onPosted={load}
          />

          {status === 'loading' ? (
            <div className="empty">
              <span className="spinner" />
            </div>
          ) : status === 'error' ? (
            <div className="empty">
              <WifiOff size={32} />
              <h3>Gagal memuat status</h3>
              <p>Periksa koneksi internet, lalu coba lagi.</p>
              <button type="button" className="btn secondary" onClick={load}>
                Coba lagi
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <MessageCircle size={32} />
              <h3>Belum ada status</h3>
              <p>Bagikan kabar atau foto pekerjaan hari ini.</p>
            </div>
          ) : (
            visible.map(post => (
              <StatusCard
                key={post.id}
                post={post}
                now={now}
                isMine={post.author_id === myId}
                onLike={() => toggleLike(post)}
                onOpen={() => setOpened({ statusId: post.id })}
                onDelete={() => removeStatus(post)}
                onEdited={content => updatePost(post.id, p => ({ ...p, content }))}
              />
            ))
          )}
        </div>
      </div>

      {opened ? (
        <StatusDetailDrawer
          statusId={opened.statusId}
          highlightCommentId={opened.highlightCommentId ?? null}
          onClose={() => setOpened(null)}
          onCountsChanged={(id, counts) =>
            updatePost(id, post => ({ ...post, ...counts }))
          }
        />
      ) : null}
    </div>
  );
}

// ─── Kotak tulis status ───
function Composer({
  avatarUrl,
  name,
  onPosted,
}: {
  avatarUrl: string | null;
  name: string | null | undefined;
  onPosted: () => void;
}) {
  const { session } = useAuth();
  const showError = useErrorDialog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const submit = async () => {
    if (!content.trim() && !photo) {
      return;
    }
    setPosting(true);
    try {
      await createStatus({
        authorId: session!.user.id,
        content,
        image: photo,
      });
      setContent('');
      setPhoto(null);
      onPosted();
    } catch (error) {
      await showError('Gagal memposting status', error);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="composer">
      <Avatar url={avatarUrl} name={name} size={42} />
      <div className="composer-body">
        <textarea
          className="textarea"
          rows={preview ? 2 : 2}
          maxLength={STATUS_MAX_LENGTH}
          placeholder="Bagikan kabar atau foto pekerjaan…"
          value={content}
          onChange={event => setContent(event.target.value)}
        />
        {preview ? (
          <div className="composer-photo">
            <img src={preview} alt="Foto yang dipilih" />
            <button
              type="button"
              className="btn icon"
              aria-label="Batalkan foto"
              onClick={() => setPhoto(null)}
            >
              <X size={18} />
            </button>
          </div>
        ) : null}
        <div className="composer-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={18} />
            Foto
          </button>
          <span className="muted count">
            {content.length}/{STATUS_MAX_LENGTH}
          </span>
          <button
            type="button"
            className="btn small"
            onClick={submit}
            disabled={posting || (!content.trim() && !photo)}
          >
            {posting ? <span className="spinner" /> : <Send size={16} />}
            Posting
          </button>
        </div>
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
    </div>
  );
}

// ─── Satu status ───
function StatusCard({
  post,
  now,
  isMine,
  onLike,
  onOpen,
  onDelete,
  onEdited,
}: {
  post: StatusPost;
  now: number;
  isMine: boolean;
  onLike: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onEdited: (content: string) => void;
}) {
  const showError = useErrorDialog();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.content ?? '');
  const [saving, setSaving] = useState(false);

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateStatusContent(post.id, draft);
      onEdited(draft.trim() || '');
      setEditing(false);
    } catch (error) {
      await showError('Gagal menyimpan perubahan', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="status-card">
      <header>
        <Avatar
          url={getAvatarUrl(post.author_avatar_path)}
          name={post.author_full_name}
          size={42}
        />
        <div className="who">
          <strong>{post.author_full_name}</strong>
          <small className="muted">
            {[post.author_job, `${formatAge(post.created_at, now)} lalu`]
              .filter(Boolean)
              .join(' · ')}
            {post.updated_at ? ' · diedit' : ''}
          </small>
        </div>
        {isMine ? (
          <Menu
            label="Menu status"
            trigger={<MoreHorizontal size={20} />}
            items={[
              {
                key: 'edit',
                label: 'Edit teks',
                icon: Pencil,
                onSelect: () => {
                  setDraft(post.content ?? '');
                  setEditing(true);
                },
              },
              {
                key: 'delete',
                label: 'Hapus status',
                icon: Trash2,
                destructive: true,
                onSelect: onDelete,
              },
            ]}
          />
        ) : null}
      </header>

      {editing ? (
        <div className="edit-box">
          <textarea
            className="textarea"
            rows={3}
            maxLength={STATUS_MAX_LENGTH}
            value={draft}
            onChange={event => setDraft(event.target.value)}
          />
          <div className="edit-actions">
            <button
              type="button"
              className="btn neutral small"
              onClick={() => setEditing(false)}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn small"
              onClick={saveEdit}
              disabled={saving}
            >
              Simpan
            </button>
          </div>
        </div>
      ) : post.content ? (
        <p className="content">{post.content}</p>
      ) : null}

      {post.image_path ? (
        <SecureImage
          url={post.image_url}
          alt={`Foto status ${post.author_full_name}`}
          maxWidth={320}
          maxHeight={320}
        />
      ) : null}

      <footer>
        <button
          type="button"
          className={`react${post.liked_by_me ? ' liked' : ''}`}
          onClick={onLike}
        >
          <Heart
            size={18}
            fill={post.liked_by_me ? 'currentColor' : 'none'}
          />
          {post.like_count > 0 ? post.like_count : 'Suka'}
        </button>
        <button type="button" className="react" onClick={onOpen}>
          <MessageCircle size={18} />
          {post.comment_count > 0 ? post.comment_count : 'Komentar'}
        </button>
      </footer>
    </article>
  );
}

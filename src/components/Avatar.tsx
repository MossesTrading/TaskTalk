import './Avatar.css';

function initials(name: string | null | undefined) {
  if (!name) {
    return '?';
  }
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(part => part.charAt(0).toUpperCase()).join('');
}

type Props = {
  url?: string | null;
  name?: string | null;
  size?: number;
  // Titik hijau status online; undefined = tidak ditampilkan.
  online?: boolean;
};

export function Avatar({ url, name, size = 40, online }: Props) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name ?? 'Foto profil'} draggable={false} />
      ) : (
        <span className="initials" style={{ fontSize: size * 0.38 }}>
          {initials(name)}
        </span>
      )}
      {online === undefined ? null : (
        <span
          className={`dot${online ? ' on' : ''}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
          aria-label={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}

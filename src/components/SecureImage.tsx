import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatTime } from '../lib/format';
import './SecureImage.css';

// Watermark dibuat sebagai gambar SVG berulang di atas foto: nama pembuka + jam buka.
// Catatan jujur: ini penanda asal, bukan pengaman. Di browser, foto yang tampil
// tetap bisa di-screenshot; watermark membuat kebocoran bisa dilacak sumbernya.
function watermarkStyle(label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150">
    <text x="0" y="80" transform="rotate(-24 0 80)" font-family="Segoe UI, sans-serif"
      font-size="15" fill="rgba(255,255,255,0.42)">${label}</text>
  </svg>`;
  return {
    backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
  };
}

function useWatermarkLabel() {
  const { profile, session } = useAuth();
  const name = profile?.full_name ?? session?.user.email ?? 'TalkTask';
  const [time, setTime] = useState(() => formatTime(new Date()));
  // Jam ikut berganti supaya watermark menunjukkan kapan foto dibuka.
  useEffect(() => {
    const timer = setInterval(() => setTime(formatTime(new Date())), 30000);
    return () => clearInterval(timer);
  }, []);
  return `${name} · ${time}`;
}

type Props = {
  url: string | null;
  alt: string;
  // Lebar maksimal versi kecil di dalam daftar / gelembung chat.
  maxWidth?: number;
  maxHeight?: number;
  // Versi besar yang dibuka saat foto diklik (kalau ada; default: sama dengan url).
  fullUrl?: string | null;
};

// Foto selalu tampil kecil & berwatermark; klik untuk melihat versi besar (tetap berwatermark).
export function SecureImage({
  url,
  alt,
  maxWidth = 260,
  maxHeight = 260,
  fullUrl,
}: Props) {
  const label = useWatermarkLabel();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!url) {
    return <div className="secure-image loading" style={{ maxWidth }} />;
  }

  return (
    <>
      <button
        type="button"
        className="secure-image"
        style={{ maxWidth, maxHeight }}
        onClick={() => setOpen(true)}
        onContextMenu={event => event.preventDefault()}
        title="Klik untuk memperbesar"
      >
        <img src={url} alt={alt} draggable={false} />
        <span className="watermark" style={watermarkStyle(label)} />
      </button>

      {open ? (
        <div
          className="secure-viewer"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="close"
            aria-label="Tutup"
            onClick={() => setOpen(false)}
          >
            <X size={22} />
          </button>
          <div
            className="frame"
            onClick={event => event.stopPropagation()}
            onContextMenu={event => event.preventDefault()}
          >
            <img src={fullUrl ?? url} alt={alt} draggable={false} />
            <span className="watermark" style={watermarkStyle(label)} />
          </div>
        </div>
      ) : null}
    </>
  );
}

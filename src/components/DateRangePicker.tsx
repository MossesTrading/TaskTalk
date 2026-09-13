import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  formatRange,
  keyOf,
  MONTHS_LONG,
  partsOfKey,
  sameRange,
  shortcutRange,
  SHORTCUTS,
  todayKey,
  type DateRange,
} from '../lib/tasks';
import './DateRangePicker.css';

// Pemilih rentang tanggal berbentuk kalender.
//
// Tanggalnya memakai kunci "YYYY-MM-DD" menurut WIB (bukan objek Date), supaya
// tidak ada pergeseran hari saat dibuka dari komputer berzona waktu lain.
//
// Cara pakai: klik satu tanggal untuk menandai awal, klik lagi untuk menutup
// rentang. Klik tanggal yang sama dua kali berarti satu hari saja.

type Props = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Nama kontrol untuk pembaca layar. */
  label?: string;
};

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export function DateRangePicker({ value, onChange, label = 'Rentang tanggal' }: Props) {
  const [open, setOpen] = useState(false);
  // Ujung pertama yang sudah diklik tapi rentangnya belum ditutup.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  const today = todayKey();
  const [cursor, setCursor] = useState(() => {
    const base = value.to ?? value.from ?? today;
    const p = partsOfKey(base);
    return { year: p.year, month: p.month };
  });

  // Menutup selalu lewat sini, supaya pilihan setengah jadi (baru satu ujung
  // yang diklik) tidak tertinggal saat kalender dibuka lagi.
  const close = useCallback(() => {
    setOpen(false);
    setAnchor(null);
    setHover(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Kotak tanggal satu bulan penuh, dimulai hari Senin.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
    // getUTCDay: 0 = Minggu. Digeser supaya Senin jadi kolom pertama.
    const lead = (first.getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < lead; i += 1) out.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) out.push(keyOf(cursor.year, cursor.month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const moveMonth = (delta: number) => {
    setCursor(current => {
      const moved = new Date(Date.UTC(current.year, current.month - 1 + delta, 1));
      return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1 };
    });
  };

  const pick = (key: string) => {
    if (!anchor) {
      setAnchor(key);
      setHover(key);
      return;
    }
    // Klik kedua menutup rentang; urutannya dibetulkan kalau dipilih mundur.
    const from = anchor <= key ? anchor : key;
    const to = anchor <= key ? key : anchor;
    close();
    onChange({ from, to });
  };

  // Saat sedang memilih, rentang sementara mengikuti kursor.
  const preview: DateRange = anchor
    ? { from: anchor <= (hover ?? anchor) ? anchor : hover, to: anchor <= (hover ?? anchor) ? hover : anchor }
    : value;

  const inRange = (key: string) =>
    !!preview.from && !!preview.to && key >= preview.from && key <= preview.to;

  return (
    <div className="daterange" ref={wrapper}>
      <button
        type="button"
        className="daterange-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <CalendarDays size={16} />
        <span>{formatRange(value, { today: true })}</span>
      </button>

      {open ? (
        <div className="daterange-pop" role="dialog" aria-label={label}>
          <div className="cal-head">
            <button type="button" className="btn icon" aria-label="Bulan sebelumnya" onClick={() => moveMonth(-1)}>
              <ChevronLeft size={18} />
            </button>
            <strong>
              {MONTHS_LONG[cursor.month - 1]} {cursor.year}
            </strong>
            <button type="button" className="btn icon" aria-label="Bulan berikutnya" onClick={() => moveMonth(1)}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="cal-weekdays" aria-hidden="true">
            {WEEKDAYS.map(d => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="cal-grid" onMouseLeave={() => anchor && setHover(anchor)}>
            {cells.map((key, i) => {
              if (!key) return <span key={`kosong-${i}`} className="cal-day blank" />;
              const classes = ['cal-day'];
              if (inRange(key)) classes.push('in-range');
              if (key === preview.from) classes.push('edge start');
              if (key === preview.to) classes.push('edge end');
              if (key === today) classes.push('today');
              return (
                <button
                  key={key}
                  type="button"
                  className={classes.join(' ')}
                  onClick={() => pick(key)}
                  onMouseEnter={() => anchor && setHover(key)}
                  aria-current={key === today ? 'date' : undefined}
                >
                  {partsOfKey(key).day}
                </button>
              );
            })}
          </div>

          <p className="cal-hint">
            {anchor
              ? 'Klik tanggal kedua untuk menutup rentang.'
              : 'Klik satu tanggal, lalu tanggal kedua.'}
          </p>

          <div className="cal-shortcuts">
            {SHORTCUTS.map(s => {
              const range = shortcutRange(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  className={sameRange(range, value) ? 'active' : undefined}
                  onClick={() => {
                    close();
                    onChange(range);
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

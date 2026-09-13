import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './Menu.css';

export type MenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  // Aksi berbahaya (hapus, keluar) ditampilkan merah.
  destructive?: boolean;
  onSelect: () => void;
};

type Props = {
  items: MenuItem[];
  // Tombol pemicu; menu muncul menempel di bawahnya.
  trigger: ReactNode;
  align?: 'left' | 'right';
  label?: string;
};

export function Menu({ items, trigger, align = 'right', label = 'Menu' }: Props) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={wrapper}>
      <button
        type="button"
        className="btn icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(current => !current)}
      >
        {trigger}
      </button>
      {open ? (
        <div className={`menu ${align}`} role="menu">
          {items.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={item.destructive ? 'destructive' : undefined}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {Icon ? <Icon size={18} /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

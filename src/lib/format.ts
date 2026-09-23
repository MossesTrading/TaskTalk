// Jam:menit, misalnya "08.24".
export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Label singkat umur sebuah kiriman: "baru saja", "5 mnt", "3 jam".
export function formatAge(value: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000);
  if (minutes < 1) {
    return 'baru saja';
  }
  if (minutes < 60) {
    return `${minutes} mnt`;
  }
  return `${Math.floor(minutes / 60)} jam`;
}

// Pemisah tanggal di daftar chat: "Hari ini", "Kemarin", atau tanggal lengkap.
export function formatDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) {
    return 'Hari ini';
  }
  if (sameDay(date, yesterday)) {
    return 'Kemarin';
  }
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Waktu di daftar chat: jam kalau hari ini, "Kemarin", selain itu tanggal pendek.
export function formatRoomTime(value: string) {
  const day = formatDay(value);
  if (day === 'Hari ini') {
    return formatTime(value);
  }
  if (day === 'Kemarin') {
    return 'Kemarin';
  }
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

// "Terakhir dilihat 08.24" / "Terakhir dilihat kemarin".
export function formatLastSeen(value: string | null | undefined) {
  if (!value) {
    return 'Offline';
  }
  const day = formatDay(value);
  return day === 'Hari ini'
    ? `Terakhir dilihat ${formatTime(value)}`
    : `Terakhir dilihat ${day.toLowerCase()}`;
}

export function getErrorMessage(
  error: unknown,
  fallback = 'Coba lagi beberapa saat lagi.',
) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return fallback;
}

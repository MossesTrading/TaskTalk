import { supabase } from './supabase';

// Dashboard achievement task. Sumbernya tabel `DATA` di Supabase yang sama
// dengan app HP — tidak ada tabel atau SQL tambahan untuk web ini.
//
// Satu baris `DATA` = satu kali unit (FrameNumber) diperiksa untuk satu Job.
// Job-nya dinamis: sekarang baru "Debu Vulkanik", nanti bisa bertambah, dan
// setiap Job otomatis muncul sebagai satu kartu di halaman Task.

const TABLE = 'DATA';
const TASK_TABLE = 'Task';
// Tabel terpisah khusus task PULL: status Sync (true/false) hidup di sini,
// bukan di tabel DATA. Dihubungkan ke Task master lewat kolom `task` = job.
const PULL_TABLE = 'PULL';
const PAGE_SIZE = 1000; // berapa baris diminta sekali jalan
// Pengaman: kalau suatu saat rentangnya sangat lebar, lebih baik berhenti dan
// memberi tahu daripada menghabiskan memori browser sampai tabnya mati.
const MAX_ROWS = 200_000;

// Jam kerja dilaporkan dalam WIB. Data di database disimpan UTC, dan Excel
// tidak menyimpan timezone, jadi pergeserannya dibuat eksplisit di satu tempat
// supaya angka di layar dan di file Excel selalu sama — termasuk kalau
// dashboardnya dibuka dari komputer yang zona waktunya bukan WIB.
export const TZ_HOURS = 7;
export const TZ_LABEL = 'WIB';

export type TaskRow = {
  id: number;
  frameNumber: string;
  modelName: string;
  typeName: string;
  colorName: string;
  areaProcess: string;
  job: string;
  status: string;
  /** Nilai asli dari database (UTC). */
  timestamp: string;
  /** Hasil parse timestamp, milidetik sejak epoch. */
  epochMs: number;
  createdBy: string | null;
  createdByName: string;
  /** Sync = true berarti unit sudah ditarik (untuk task PULL). */
  sync: boolean;
};

type RawRow = {
  id: number | string | null;
  FrameNumber: string | null;
  ModelName: string | null;
  TypeName: string | null;
  ColorName: string | null;
  AreaProcess: string | null;
  Job: string | null;
  Status: string | null;
  timestamp: string | null;
  created_by: string | null;
  created_by_name: string | null;
};

/** Baris tabel master `Task`: daftar task yang ada, terlepas dari ada tidaknya data. */
export type TaskDef = {
  id: number;
  job: string;
  /** Kolom `status`: true = task masih aktif. */
  active: boolean;
  /** Kolom `jenis`: PULL / PUSH. */
  jenis: string | null;
};

/**
 * Rentang tanggal yang dipilih di kalender. Nilainya "YYYY-MM-DD" menurut WIB
 * dan sifatnya INKLUSIF di kedua ujung; null berarti tanpa batas di sisi itu.
 */
export type DateRange = { from: string | null; to: string | null };

export const ALL_DATES: DateRange = { from: null, to: null };

export type ShortcutKey = 'hari-ini' | 'kemarin' | '7-hari' | '30-hari' | 'semua';

export const SHORTCUTS: { key: ShortcutKey; label: string }[] = [
  { key: 'hari-ini', label: 'Hari ini' },
  { key: 'kemarin', label: 'Kemarin' },
  { key: '7-hari', label: '7 hari terakhir' },
  { key: '30-hari', label: '30 hari terakhir' },
  { key: 'semua', label: 'Semua tanggal' },
];

// ── Waktu ────────────────────────────────────────────────────────────────── //

// Postgres mengirim "2026-09-12 00:48:19.427271+00" (spasi, offset tanpa titik dua)
// dan sebagian sumber lain mengirim "2026-09-12T00:48:19.427Z". Safari menolak
// bentuk pertama, jadi keduanya dinormalkan dulu ke ISO sebelum di-parse.
export function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const text = value.trim();

  const direct = Date.parse(text);
  if (!Number.isNaN(direct) && /T.*(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    return direct;
  }

  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{0,2})?$/.exec(
      text,
    );
  if (!m) return direct;

  const [, y, mo, d, hh, mm, ss, frac, zone] = m;
  const ms = frac ? Number(`0.${frac}`) * 1000 : 0;
  let offsetMinutes = 0;
  if (zone && zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const oh = Number(digits.slice(0, 2) || 0);
    const om = Number(digits.slice(2, 4) || 0);
    offsetMinutes = sign * (oh * 60 + om);
  }
  const utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
    Math.round(ms),
  );
  return utc - offsetMinutes * 60000;
}

/** Pecahan tanggal/jam pada zona WIB. */
export function zoneParts(epochMs: number) {
  const shifted = new Date(epochMs + TZ_HOURS * 3600000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function formatZoneTime(epochMs: number) {
  const p = zoneParts(epochMs);
  return `${String(p.hour).padStart(2, '0')}.${String(p.minute).padStart(2, '0')}`;
}

export function formatZoneDate(epochMs: number) {
  return formatKey(dateKey(epochMs));
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" menurut WIB. Kunci ini yang dipakai kalender dan pengelompokan hari. */
export function dateKey(epochMs: number) {
  const p = zoneParts(epochMs);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayKey() {
  return dateKey(Date.now());
}

export function keyOf(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function partsOfKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/** Geser sebuah kunci tanggal sekian hari (boleh negatif). */
export function shiftKey(key: string, days: number) {
  const { year, month, day } = partsOfKey(key);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return keyOf(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

export function formatKey(key: string) {
  const { year, month, day } = partsOfKey(key);
  return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
}

/**
 * Label ringkas rentang tanggal.
 * `today: true` menambahkan awalan "Hari ini ·" — dipakai di tombol kalender saja,
 * tidak di dalam kalimat (supaya tidak jadi "... pada hari ini · 12 sep 2026").
 */
export function formatRange(range: DateRange, opts?: { today?: boolean }) {
  if (!range.from && !range.to) return 'Semua tanggal';
  if (range.from && !range.to) return `Sejak ${formatKey(range.from)}`;
  if (!range.from && range.to) return `Sampai ${formatKey(range.to)}`;
  if (range.from === range.to) {
    return opts?.today && range.from === todayKey()
      ? `Hari ini · ${formatKey(range.from)}`
      : formatKey(range.from!);
  }
  const a = partsOfKey(range.from!);
  const b = partsOfKey(range.to!);
  // Bulan & tahun yang sama tidak perlu ditulis dua kali.
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}–${b.day} ${MONTHS_SHORT[b.month - 1]} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day} ${MONTHS_SHORT[a.month - 1]} – ${b.day} ${MONTHS_SHORT[b.month - 1]} ${b.year}`;
  }
  return `${formatKey(range.from!)} – ${formatKey(range.to!)}`;
}

export function shortcutRange(key: ShortcutKey): DateRange {
  const today = todayKey();
  switch (key) {
    case 'hari-ini':
      return { from: today, to: today };
    case 'kemarin': {
      const y = shiftKey(today, -1);
      return { from: y, to: y };
    }
    case '7-hari':
      return { from: shiftKey(today, -6), to: today };
    case '30-hari':
      return { from: shiftKey(today, -29), to: today };
    case 'semua':
      return ALL_DATES;
  }
}

export function sameRange(a: DateRange, b: DateRange) {
  return a.from === b.from && a.to === b.to;
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} mnt`;
  return m === 0 ? `${h} jam` : `${h} jam ${m} mnt`;
}

// ── Ambil data ───────────────────────────────────────────────────────────── //

/**
 * Ubah rentang tanggal WIB jadi batas waktu UTC untuk query.
 * Batas awal inklusif, batas akhir eksklusif (hari terakhir ikut penuh sampai 23.59).
 * Pergeseran WIB dipakai di sini supaya "hari ini" berarti hari kerja di lapangan,
 * bukan hari menurut zona komputer yang membuka dashboard.
 */
function rangeToUtc(range: DateRange) {
  const startOfDayUtc = (key: string, plusDays = 0) => {
    const { year, month, day } = partsOfKey(key);
    return new Date(Date.UTC(year, month - 1, day + plusDays) - TZ_HOURS * 3600000);
  };
  return {
    gte: range.from ? startOfDayUtc(range.from) : null,
    lt: range.to ? startOfDayUtc(range.to, 1) : null,
  };
}

/**
 * Daftar task dari tabel master. Dipakai supaya task yang baru dibuat tetap
 * muncul sebagai kartu walaupun belum ada satu pun unit yang diperiksa.
 */
export async function fetchTaskDefs(): Promise<TaskDef[]> {
  const { data, error } = await supabase
    .from(TASK_TABLE)
    .select('id,job,status,jenis')
    .order('id', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as { id: number | string | null; job: string | null; status: boolean | null; jenis: string | null }[])
    .map(row => ({
      id: Number(row.id ?? 0),
      job: (row.job ?? '').trim(),
      active: row.status !== false,
      jenis: (row.jenis ?? '').trim() || null,
    }))
    .filter(def => def.job.length > 0);
}

export async function fetchTaskRows(range: DateRange): Promise<TaskRow[]> {
  const { gte, lt } = rangeToUtc(range);
  const out: TaskRow[] = [];

  // Penting: posisi baca maju sebanyak baris yang BENAR-BENAR diterima, bukan
  // sebanyak PAGE_SIZE. Kalau server dibatasi (`db-max-rows`) di bawah PAGE_SIZE,
  // menganggap "hasil < PAGE_SIZE berarti habis" akan memotong data diam-diam.
  let from = 0;
  for (;;) {
    let query = supabase
      .from(TABLE)
      .select(
        'id,FrameNumber,ModelName,TypeName,ColorName,AreaProcess,Job,Status,timestamp,created_by,created_by_name',
      )
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (gte) {
      query = query.gte('timestamp', gte.toISOString());
    }
    if (lt) {
      query = query.lt('timestamp', lt.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    const batch = (data ?? []) as RawRow[];
    for (const row of batch) {
      out.push({
        id: Number(row.id ?? 0),
        frameNumber: (row.FrameNumber ?? '').trim(),
        modelName: (row.ModelName ?? '').trim() || '(tanpa model)',
        typeName: (row.TypeName ?? '').trim(),
        colorName: (row.ColorName ?? '').trim(),
        areaProcess: (row.AreaProcess ?? '').trim() || '(tanpa area)',
        job: (row.Job ?? '').trim() || '(tanpa job)',
        status: (row.Status ?? '').trim() || '(tanpa status)',
        timestamp: row.timestamp ?? '',
        epochMs: parseTimestamp(row.timestamp),
        createdBy: row.created_by,
        createdByName: (row.created_by_name ?? '').trim() || '(tanpa nama)',
        // Tabel DATA tidak punya kolom Sync — status tarik PULL dihitung
        // terpisah dari tabel PULL lewat fetchGlobalPullStats().
        sync: false,
      });
    }

    if (batch.length === 0) break;
    from += batch.length;
    if (out.length >= MAX_ROWS) {
      throw new Error(
        `Rentang tanggalnya terlalu lebar (lebih dari ${MAX_ROWS.toLocaleString('id-ID')} entri). ` +
          'Persempit rentangnya, lalu coba lagi.',
      );
    }
  }

  return out;
}

/**
 * Ambil semua data repair untuk satu job tanpa batas tanggal.
 * Dipakai untuk menghitung total global repair dan yang belum selesai.
 */
export async function fetchGlobalRepairRows(job: string): Promise<TaskRow[]> {
  const out: TaskRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(
        'id,FrameNumber,ModelName,TypeName,ColorName,AreaProcess,Job,Status,timestamp,created_by,created_by_name',
      )
      .eq('Job', job)
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as RawRow[];
    for (const row of batch) {
      out.push({
        id: Number(row.id ?? 0),
        frameNumber: (row.FrameNumber ?? '').trim(),
        modelName: (row.ModelName ?? '').trim() || '(tanpa model)',
        typeName: (row.TypeName ?? '').trim(),
        colorName: (row.ColorName ?? '').trim(),
        areaProcess: (row.AreaProcess ?? '').trim() || '(tanpa area)',
        job: (row.Job ?? '').trim() || '(tanpa job)',
        status: (row.Status ?? '').trim() || '(tanpa status)',
        timestamp: row.timestamp ?? '',
        epochMs: parseTimestamp(row.timestamp),
        createdBy: row.created_by,
        createdByName: (row.created_by_name ?? '').trim() || '(tanpa nama)',
        sync: false,
      });
    }

    if (batch.length === 0) break;
    from += batch.length;
    if (out.length >= MAX_ROWS) {
      throw new Error(
        `Data repair global terlalu banyak (lebih dari ${MAX_ROWS.toLocaleString('id-ID')} entri). `
      );
    }
  }

  return out;
}

/**
 * Ambil statistik global PULL untuk satu job tanpa batas tanggal.
 * Sumbernya tabel `PULL` (bukan `DATA`) — satu baris per unit, kolom `Sync`
 * menandai sudah/belum ditarik, dihubungkan ke job lewat kolom `task`.
 * Menghitung total unit, sudah ditarik (Sync = true), dan sisa (Sync = false).
 */
export async function fetchGlobalPullStats(job: string): Promise<PullStats> {
  let total = 0;
  let pulled = 0;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(PULL_TABLE)
      .select('id,Sync')
      .eq('task', job)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data ?? []) as { id: number | string | null; Sync: boolean | null }[];
    for (const row of batch) {
      total += 1;
      if (row.Sync === true) {
        pulled += 1;
      }
    }

    if (batch.length === 0) break;
    from += batch.length;
    if (total >= MAX_ROWS) {
      throw new Error(
        `Data PULL global terlalu banyak (lebih dari ${MAX_ROWS.toLocaleString('id-ID')} entri). `
      );
    }
  }

  const remaining = total - pulled;
  const pullRate = total ? (pulled / total) * 100 : 0;

  return {
    total,
    pulled,
    remaining,
    pullRate,
  };
}


// ── Hitungan ─────────────────────────────────────────────────────────────── //

export type StatusCount = { status: string; count: number; share: number };

export type GroupStat = {
  key: string;
  total: number;
  ok: number;
  repair: number;
  other: number;
  repairRate: number;
};

export type HourBucket = {
  /** Kunci urut: "YYYY-MM-DD HH" (kronologis) atau "HH" (gabungan per jam). */
  key: string;
  label: string;
  dayLabel: string;
  hour: number;
  total: number;
  ok: number;
  repair: number;
  other: number;
};

export type OperatorStat = GroupStat & {
  firstMs: number;
  lastMs: number;
  perHour: number;
};

/**
 * Jenis entri susulan:
 * - `repair`  : bagian dari pengerjaan repair (unit ini memang berstatus repair).
 * - `koreksi` : entri OK yang dikoreksi oleh entri repair sesudahnya.
 * - `ganda`   : sisanya — entri berulang yang tidak mengubah hasil.
 */
export type FollowUpKind = 'repair' | 'koreksi' | 'ganda';

export type FollowUp = {
  row: TaskRow;
  /** Entri yang dipakai achievement pemeriksaan untuk unit yang sama. */
  base: TaskRow;
  kind: FollowUpKind;
};

/**
 * Satu unit yang selesai dikerjakan: entri repair-nya lalu ditutup oleh
 * entri OK dari akun PIC REPAIR.
 */
export type RepairFix = {
  frameNumber: string;
  /** Entri pertama — saat unit dinyatakan repair. */
  opened: TaskRow;
  /** Entri OK pertama dari akun PIC REPAIR sesudah repair-nya. */
  closed: TaskRow;
  /** Jarak repair → OK (PIC REPAIR). NaN kalau salah satu waktunya tidak terbaca. */
  durationMs: number;
};

export type RepairOperatorStat = {
  key: string;
  done: number;
  firstMs: number;
  lastMs: number;
  perHour: number;
  /** Rata-rata jarak repair → OK dari unit yang ditutup petugas ini. */
  avgMs: number;
};

export type RepairGroupStat = {
  key: string;
  /** Unit yang pemeriksaan awalnya repair. */
  opened: number;
  done: number;
  open: number;
  doneRate: number;
};

/**
 * Papan kedua: achievement PENGERJAAN REPAIR.
 * Hitungannya berdiri sendiri dan tidak digabung ke angka pemeriksaan awal —
 * satu unit bisa muncul di dua tempat (repair di papan pertama, selesai di sini).
 */
export type RepairWork = {
  /** Unit yang dihitung repair di pemeriksaan (sama dengan totals.repair). */
  opened: number;
  /** Repair yang entri terakhirnya sudah OK. */
  done: number;
  /** Repair yang belum dinyatakan OK. */
  open: number;
  /** done / opened, dalam persen. */
  doneRate: number;
  fixes: RepairFix[];
  /** Per jam, memakai waktu entri OK-nya (saat repair dinyatakan selesai). */
  byHour: HourBucket[];
  byHourOfDay: HourBucket[];
  dayCount: number;
  byOperator: RepairOperatorStat[];
  byModel: RepairGroupStat[];
  byZone: RepairGroupStat[];
  avgMs: number;
  medianMs: number;
  busiestHour: HourBucket | null;
  firstMs: number;
  lastMs: number;
  perHour: number;
};

/**
 * Statistik repair global (tanpa batas tanggal).
 * Dipakai untuk menampilkan konteks achievement daily/rentang tanggal.
 */
export type GlobalRepairStats = {
  /** Total unit repair secara global (semua waktu). */
  totalOpened: number;
  /** Total repair yang sudah selesai secara global. */
  totalDone: number;
  /** Total repair yang belum selesai secara global. */
  totalOpen: number;
  /** Persentase penyelesaian global. */
  globalDoneRate: number;
};

/**
 * Statistik global untuk task PULL (pengambilan unit).
 */
export type PullStats = {
  /** Total unit secara global (semua waktu). */
  total: number;
  /** Unit yang sudah ditarik (sync = true). */
  pulled: number;
  /** Unit yang belum ditarik (sync = false). */
  remaining: number;
  /** Persentase yang sudah ditarik. */
  pullRate: number;
};

export type TaskBoard = {
  job: string;
  /** Baris tabel master yang cocok, kalau ada. */
  def: TaskDef | null;
  jenis: string | null;
  active: boolean;
  /** Semua baris apa adanya, termasuk entri susulan. */
  all: TaskRow[];
  /** Satu baris per FrameNumber: entri yang dipakai achievement pemeriksaan. */
  unique: TaskRow[];
  /** Statistik global PULL (untuk task jenis PULL), jika tersedia. */
  pullStats: PullStats | null;
  /** Statistik repair global (untuk task jenis PUSH), jika tersedia. */
  globalRepairStats: GlobalRepairStats | null;
  /** Entri susulan, sudah dipilah jenisnya. */
  followUps: FollowUp[];
  /** Achievement pengerjaan repair, dihitung terpisah dari angka di bawah. */
  repairWork: RepairWork;
  totals: {
    records: number;
    units: number;
    ok: number;
    repair: number;
    other: number;
    repairRate: number;
  };
  byHour: HourBucket[];
  byHourOfDay: HourBucket[];
  dayCount: number;
  byStatus: StatusCount[];
  byModel: GroupStat[];
  byArea: GroupStat[];
  byZone: GroupStat[];
  byOperator: OperatorStat[];
  busiestHour: HourBucket | null;
  firstMs: number;
  lastMs: number;
  spanMs: number;
  perHour: number;
  quality: {
    followUps: number;
    repairEntries: number;
    corrections: number;
    duplicates: number;
    brokenText: number;
    missingTimestamp: number;
  };
};

const OK = 'ok';
const REPAIR = 'repair';

function classify(status: string) {
  const s = status.toLowerCase();
  if (s === OK) return 'ok' as const;
  if (s === REPAIR) return 'repair' as const;
  return 'other' as const;
}

// Akun yang berhak menyatakan repair selesai: "PIC REPAIR", "PIC REPAIR 2",
// dst. Entri OK dari akun lain (device biasa yang re-scan, misalnya) tidak
// dianggap menutup repair — unitnya tetap dihitung pending sampai memang ada
// entri OK dari salah satu akun PIC REPAIR.
const PIC_REPAIR_PREFIX = 'PIC REPAIR';

function isPicRepairName(name: string) {
  return name.trim().toUpperCase().startsWith(PIC_REPAIR_PREFIX);
}

// Math.min(...array) melempar "Maximum call stack size exceeded" begitu
// isinya lebih dari ~130 ribu elemen, dan jumlah unit bisa sampai ke sana
// kalau rentangnya setahun. Jadi dihitung dengan perulangan biasa.
function minMax(values: number[]) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}


function emptyStat(key: string): GroupStat {
  return { key, total: 0, ok: 0, repair: 0, other: 0, repairRate: 0 };
}

function addTo(stat: GroupStat, row: TaskRow) {
  stat.total += 1;
  stat[classify(row.status)] += 1;
}

function finishStats(map: Map<string, GroupStat>) {
  const out = [...map.values()];
  for (const stat of out) {
    stat.repairRate = stat.total ? (stat.repair / stat.total) * 100 : 0;
  }
  return out.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

function groupBy(rows: TaskRow[], pick: (row: TaskRow) => string) {
  const map = new Map<string, GroupStat>();
  for (const row of rows) {
    const key = pick(row);
    let stat = map.get(key);
    if (!stat) {
      stat = emptyStat(key);
      map.set(key, stat);
    }
    addTo(stat, row);
  }
  return finishStats(map);
}

/** "SY AP07" -> "SY AP". Dipakai untuk melihat sebaran per blok parkir. */
export function zoneOf(areaProcess: string) {
  const m = /^([A-Za-z]+\s+[A-Za-z]+)/.exec(areaProcess.trim());
  return m ? m[1].toUpperCase() : areaProcess.trim().toUpperCase() || '(lainnya)';
}

function hourKey(epochMs: number) {
  const p = zoneParts(epochMs);
  const day = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return { key: `${day} ${String(p.hour).padStart(2, '0')}`, hour: p.hour };
}

// Karakter U+FFFD ikut tersimpan di sebagian TypeName (rusak sejak dari sumbernya,
// bukan salah baca di sini). Dihitung supaya ketahuan, tidak diam-diam ditampilkan.
const BROKEN_CHAR = '�';

export function hasBrokenText(row: TaskRow) {
  return (
    row.typeName.includes(BROKEN_CHAR) ||
    row.modelName.includes(BROKEN_CHAR) ||
    row.colorName.includes(BROKEN_CHAR)
  );
}

export function cleanText(value: string) {
  return value.replace(/�/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Kelompokkan baris jadi papan per Job, sekaligus menerapkan aturan:
 * kalau satu FrameNumber punya lebih dari satu entri, yang dipakai untuk
 * achievement pemeriksaan adalah entri PERTAMA (timestamp terkecil; kalau sama,
 * id terkecil). Entri berikutnya tidak menimpa angka itu — dipakai untuk
 * achievement pengerjaan repair yang dihitung terpisah.
 */
export function buildBoards(rows: TaskRow[], defs: TaskDef[] = []): TaskBoard[] {
  const perJob = new Map<string, TaskRow[]>();
  // Task dari tabel master didaftarkan lebih dulu, supaya task yang belum punya
  // data tetap keluar sebagai kartu kosong (bukan hilang dari halaman).
  for (const def of defs) perJob.set(def.job, []);
  for (const row of rows) {
    const list = perJob.get(row.job);
    if (list) list.push(row);
    else perJob.set(row.job, [row]);
  }

  const byJob = new Map(defs.map(def => [def.job, def]));
  const boards = [...perJob.entries()].map(([job, list]) =>
    buildBoard(job, list, byJob.get(job) ?? null),
  );

  // Task aktif dulu, lalu yang datanya paling banyak.
  return boards.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      b.totals.units - a.totals.units ||
      a.job.localeCompare(b.job),
  );
}

/**
 * Build boards dengan statistik global untuk konteks achievement.
 * Untuk PULL: ambil pullStats (total, sudah ditarik, sisa).
 * Untuk PUSH: ambil globalRepairStats (total repair, selesai, belum selesai).
 */
export async function buildBoardsWithRepairFetch(
  rows: TaskRow[],
  defs: TaskDef[] = [],
): Promise<TaskBoard[]> {
  // Build boards biasa dulu
  const perJob = new Map<string, TaskRow[]>();
  for (const def of defs) perJob.set(def.job, []);
  for (const row of rows) {
    const list = perJob.get(row.job);
    if (list) list.push(row);
    else perJob.set(row.job, [row]);
  }

  const byJob = new Map(defs.map(def => [def.job, def]));

  // Ambil statistik global berdasarkan jenis task
  const pullStatsMap = new Map<string, PullStats>();
  const globalStatsMap = new Map<string, GlobalRepairStats>();

  for (const [job, list] of perJob.entries()) {
    if (list.length === 0) continue;
    const def = byJob.get(job);

    if (def?.jenis === 'PULL') {
      // Task PULL: ambil pullStats
      try {
        const pullStats = await fetchGlobalPullStats(job);
        pullStatsMap.set(job, pullStats);
      } catch (error) {
        console.warn(`Gagal mengambil statistik PULL global untuk job ${job}`, error);
      }
    } else {
      // Task PUSH: ambil globalRepairStats
      try {
        const globalRows = await fetchGlobalRepairRows(job);
        const globalHistories = buildHistories(globalRows);
        globalStatsMap.set(job, calculateGlobalRepairStats(globalHistories));
      } catch (error) {
        console.warn(`Gagal mengambil statistik repair global untuk job ${job}`, error);
      }
    }
  }

  // Build boards dengan stats yang sesuai
  const boards = [...perJob.entries()].map(([job, list]) =>
    buildBoard(
      job,
      list,
      byJob.get(job) ?? null,
      globalStatsMap.get(job) ?? null,
      pullStatsMap.get(job) ?? null,
    ),
  );

  return boards.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      b.totals.units - a.totals.units ||
      a.job.localeCompare(b.job),
  );
}

const timeOf = (row: TaskRow) => (Number.isNaN(row.epochMs) ? Infinity : row.epochMs);

/** Urut dari entri paling awal; entri tanpa waktu terbaca ditaruh paling belakang. */
function byTime(a: TaskRow, b: TaskRow) {
  const ta = timeOf(a);
  const tb = timeOf(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id - b.id;
}

/** Satu batang per jam kalender. Entri tanpa waktu terbaca dilewati. */
function bucketByHour(rows: TaskRow[]): HourBucket[] {
  const map = new Map<string, HourBucket>();
  for (const row of rows) {
    if (Number.isNaN(row.epochMs)) continue;
    const { key, hour } = hourKey(row.epochMs);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: `${String(hour).padStart(2, '0')}.00`,
        dayLabel: formatZoneDate(row.epochMs),
        hour,
        total: 0,
        ok: 0,
        repair: 0,
        other: 0,
      };
      map.set(key, bucket);
    }
    bucket.total += 1;
    bucket[classify(row.status)] += 1;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Versi gabungan: semua tanggal ditumpuk ke jam 00–23. Dipakai saat rentangnya
 * lebih dari beberapa hari, supaya grafiknya tetap terbaca (dan tidak
 * menggambar ribuan batang) sekaligus menjawab "jam berapa paling produktif".
 */
function mergeHourOfDay(buckets: HourBucket[]): HourBucket[] {
  const map = new Map<string, HourBucket>();
  for (const bucket of buckets) {
    const hh = String(bucket.hour).padStart(2, '0');
    let merged = map.get(hh);
    if (!merged) {
      merged = {
        key: hh,
        label: `${hh}.00`,
        dayLabel: '',
        hour: bucket.hour,
        total: 0,
        ok: 0,
        repair: 0,
        other: 0,
      };
      map.set(hh, merged);
    }
    merged.total += bucket.total;
    merged.ok += bucket.ok;
    merged.repair += bucket.repair;
    merged.other += bucket.other;
  }
  return [...map.values()].sort((a, b) => a.hour - b.hour);
}

function busiestOf(buckets: HourBucket[]) {
  return buckets.reduce<HourBucket | null>(
    (best, bucket) => (!best || bucket.total > best.total ? bucket : best),
    null,
  );
}

function countDays(buckets: HourBucket[]) {
  return new Set(buckets.map(b => b.key.slice(0, 10))).size;
}

function average(values: number[]) {
  if (values.length === 0) return Number.NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

// Median lebih jujur daripada rata-rata untuk lama perbaikan: satu unit yang
// baru ditutup besok paginya bisa menarik rata-ratanya jauh ke atas.
function median(values: number[]) {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function emptyRepairGroup(key: string): RepairGroupStat {
  return { key, opened: 0, done: 0, open: 0, doneRate: 0 };
}

function bumpRepairGroup(map: Map<string, RepairGroupStat>, key: string, done: boolean) {
  let stat = map.get(key);
  if (!stat) {
    stat = emptyRepairGroup(key);
    map.set(key, stat);
  }
  stat.opened += 1;
  if (done) stat.done += 1;
  else stat.open += 1;
}

function finishRepairGroups(map: Map<string, RepairGroupStat>) {
  const out = [...map.values()];
  for (const stat of out) {
    stat.doneRate = stat.opened ? (stat.done / stat.opened) * 100 : 0;
  }
  return out.sort((a, b) => b.opened - a.opened || a.key.localeCompare(b.key));
}

/**
 * Hitung statistik repair global dari data yang ada.
 * Menggunakan logika yang sama dengan buildRepairWork tapi untuk semua data.
 */
function calculateGlobalRepairStats(histories: UnitHistory[]): GlobalRepairStats {
  let totalOpened = 0;
  let totalDone = 0;

  for (const unit of histories) {
    if (classify(unit.base.status) !== 'repair') continue;

    totalOpened += 1;
    const baseIndex = unit.entries.indexOf(unit.base);
    const closedByPicRepair = unit.entries
      .slice(baseIndex + 1)
      .find(row => classify(row.status) === 'ok' && isPicRepairName(row.createdByName));
    if (closedByPicRepair) {
      totalDone += 1;
    }
  }

  const totalOpen = totalOpened - totalDone;
  const globalDoneRate = totalOpened ? (totalDone / totalOpened) * 100 : 0;

  return {
    totalOpened,
    totalDone,
    totalOpen,
    globalDoneRate,
  };
}

/** Riwayat satu unit (satu FrameNumber) di dalam satu Job. */
type UnitHistory = {
  frameNumber: string;
  /** Semua entri unit ini, urut dari yang paling awal. */
  entries: TaskRow[];
  /**
   * Entri yang mewakili unit ini di achievement pemeriksaan.
   * Aturannya: kalau unit ini pernah dinyatakan repair, yang dipakai entri
   * repair pertamanya — sekali ketemu repair, unitnya memang perlu dikerjakan,
   * jadi entri OK sebelumnya dianggap koreksi. Selain itu: entri pertama.
   */
  base: TaskRow;
  last: TaskRow;
};

function buildHistories(all: TaskRow[]): UnitHistory[] {
  const map = new Map<string, TaskRow[]>();
  for (const row of all) {
    const key = row.frameNumber || `#${row.id}`;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }

  return [...map.values()].map(entries => {
    entries.sort(byTime);
    const repairEntry = entries.find(row => classify(row.status) === 'repair');
    return {
      frameNumber: entries[0].frameNumber,
      entries,
      base: repairEntry ?? entries[0],
      last: entries[entries.length - 1],
    };
  });
}

/** Pilah entri susulan: mana pengerjaan repair, mana koreksi, mana entri ganda. */
function collectFollowUps(histories: UnitHistory[]): FollowUp[] {
  const out: FollowUp[] = [];
  for (const unit of histories) {
    if (unit.entries.length === 1) continue;
    const baseIndex = unit.entries.indexOf(unit.base);
    const baseIsRepair = classify(unit.base.status) === 'repair';
    unit.entries.forEach((row, index) => {
      if (index === baseIndex) return;
      const kind: FollowUpKind =
        index < baseIndex ? 'koreksi' : baseIsRepair ? 'repair' : 'ganda';
      out.push({ row, base: unit.base, kind });
    });
  }
  return out.sort((a, b) => byTime(a.row, b.row));
}

/**
 * Achievement pengerjaan repair.
 *
 * Pendekatan baru:
 * - Achievement repair = SEMUA OK dari PIC REPAIR dalam rentang tanggal
 * - Leadtime hanya dihitung untuk unit yang punya entri repair sebelum OK dari PIC REPAIR
 */
function buildRepairWork(histories: UnitHistory[]): RepairWork {
  const fixes: RepairFix[] = [];
  const modelMap = new Map<string, RepairGroupStat>();
  const zoneMap = new Map<string, RepairGroupStat>();
  let done = 0;

  for (const unit of histories) {
    // Cari semua OK dari PIC REPAIR dalam riwayat unit ini
    const picRepairOkEntries = unit.entries.filter(row => 
      classify(row.status) === 'ok' && isPicRepairName(row.createdByName)
    );

    for (const picRepairOk of picRepairOkEntries) {
      done += 1;

      // Cari entri repair terakhir sebelum OK ini untuk hitung leadtime
      const entriesBefore = unit.entries.filter(row => 
        byTime(row, picRepairOk) < 0
      );
      const lastRepair = entriesBefore
        .filter(row => classify(row.status) === 'repair')
        .sort((a, b) => byTime(b, a))[0]; // Yang paling akhir

      let durationMs = Number.NaN;
      let openedEntry = picRepairOk; // Default pakai OK sendiri kalau tidak ada repair sebelumnya

      if (lastRepair) {
        openedEntry = lastRepair;
        if (!Number.isNaN(lastRepair.epochMs) && !Number.isNaN(picRepairOk.epochMs)) {
          durationMs = picRepairOk.epochMs - lastRepair.epochMs;
        }
      }

      fixes.push({
        frameNumber: unit.frameNumber,
        opened: openedEntry,
        closed: picRepairOk,
        durationMs,
      });

      // Untuk statistik per model/zone, hanya hitung yang benar-benar punya repair sebelumnya
      const hasRepairBefore = lastRepair !== undefined;
      bumpRepairGroup(modelMap, unit.base.modelName, hasRepairBefore);
      bumpRepairGroup(zoneMap, zoneOf(unit.base.areaProcess), hasRepairBefore);
    }
  }

  fixes.sort((a, b) => byTime(a.closed, b.closed));

  // Waktunya memakai entri OK-nya: itu saat pekerjaannya benar-benar selesai.
  const closedRows = fixes.map(fix => fix.closed);
  const byHour = bucketByHour(closedRows);
  const byHourOfDay = mergeHourOfDay(byHour);

  const operatorMap = new Map<
    string,
    { stat: RepairOperatorStat; sum: number; counted: number }
  >();
  for (const fix of fixes) {
    const name = fix.closed.createdByName;
    let entry = operatorMap.get(name);
    if (!entry) {
      entry = {
        stat: { key: name, done: 0, firstMs: Infinity, lastMs: -Infinity, perHour: 0, avgMs: Number.NaN },
        sum: 0,
        counted: 0,
      };
      operatorMap.set(name, entry);
    }
    entry.stat.done += 1;
    if (!Number.isNaN(fix.closed.epochMs)) {
      entry.stat.firstMs = Math.min(entry.stat.firstMs, fix.closed.epochMs);
      entry.stat.lastMs = Math.max(entry.stat.lastMs, fix.closed.epochMs);
    }
    // Hanya hitung leadtime yang valid (punya repair sebelumnya)
    if (Number.isFinite(fix.durationMs) && fix.durationMs >= 0) {
      entry.sum += fix.durationMs;
      entry.counted += 1;
    }
  }
  const byOperator = [...operatorMap.values()]
    .map(({ stat, sum, counted }) => {
      const span = stat.lastMs - stat.firstMs;
      stat.perHour = span > 0 ? stat.done / (span / 3600000) : stat.done;
      stat.avgMs = counted ? sum / counted : Number.NaN;
      return stat;
    })
    .sort((a, b) => b.done - a.done || a.key.localeCompare(b.key));

  // Leadtime hanya untuk yang punya repair sebelumnya
  const durations = fixes
    .map(fix => fix.durationMs)
    .filter(ms => Number.isFinite(ms) && ms >= 0);
  const times = closedRows.map(row => row.epochMs).filter(ms => !Number.isNaN(ms));
  const { min: firstMs, max: lastMs } = times.length
    ? minMax(times)
    : { min: Number.NaN, max: Number.NaN };

  // Untuk statistik model/zone, opened = jumlah yang punya repair sebelumnya
  const openedWithRepair = [...modelMap.values()].reduce((sum: number, stat: RepairGroupStat) => sum + stat.opened, 0);

  return {
    opened: openedWithRepair, // Hanya yang punya repair sebelumnya
    done: fixes.length, // Semua OK dari PIC REPAIR
    open: 0, // Tidak relevan dengan pendekatan baru
    doneRate: openedWithRepair ? (fixes.length / openedWithRepair) * 100 : 0,
    fixes,
    byHour,
    byHourOfDay,
    dayCount: countDays(byHour),
    byOperator,
    byModel: finishRepairGroups(modelMap),
    byZone: finishRepairGroups(zoneMap),
    avgMs: average(durations),
    medianMs: median(durations),
    busiestHour: busiestOf(byHour),
    firstMs,
    lastMs,
    perHour: byHour.length ? fixes.length / byHour.length : 0,
  };
}

function buildBoard(job: string, all: TaskRow[], def: TaskDef | null, globalRepairStats: GlobalRepairStats | null = null, pullStats: PullStats | null = null): TaskBoard {
  // 1 unit = 1 FrameNumber. Entri susulan tidak menimpa hasil pemeriksaan:
  // kalau repair lalu jadi OK, itu masuk papan pengerjaan repair.
  const histories = buildHistories(all);
  const unique = histories.map(unit => unit.base).sort(byTime);
  const followUps = collectFollowUps(histories);
  const repairWork = buildRepairWork(histories);

  const counts = { ok: 0, repair: 0, other: 0 };
  for (const row of unique) counts[classify(row.status)] += 1;

  const statusMap = new Map<string, number>();
  for (const row of unique) {
    statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1);
  }
  const byStatus: StatusCount[] = [...statusMap.entries()]
    .map(([status, count]) => ({
      status,
      count,
      share: unique.length ? (count / unique.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Jam kerja: tiap unit dihitung sekali, pada jam pemeriksaan pertamanya.
  const byHour = bucketByHour(unique);
  const byHourOfDay = mergeHourOfDay(byHour);
  const dayCount = countDays(byHour);

  const times = unique.map(row => row.epochMs).filter(ms => !Number.isNaN(ms));
  const { min: firstMs, max: lastMs } = times.length
    ? minMax(times)
    : { min: Number.NaN, max: Number.NaN };
  const spanMs = times.length ? lastMs - firstMs : 0;
  // Dihitung dari jam yang benar-benar ada isinya, bukan dari rentang awal-akhir,
  // supaya jeda panjang (istirahat, ganti shift) tidak menekan angkanya.
  const perHour = byHour.length ? unique.length / byHour.length : 0;

  const operatorMap = new Map<string, OperatorStat>();
  for (const row of unique) {
    let stat = operatorMap.get(row.createdByName);
    if (!stat) {
      stat = { ...emptyStat(row.createdByName), firstMs: Infinity, lastMs: -Infinity, perHour: 0 };
      operatorMap.set(row.createdByName, stat);
    }
    addTo(stat, row);
    if (!Number.isNaN(row.epochMs)) {
      stat.firstMs = Math.min(stat.firstMs, row.epochMs);
      stat.lastMs = Math.max(stat.lastMs, row.epochMs);
    }
  }
  const byOperator = [...operatorMap.values()]
    .map(stat => {
      stat.repairRate = stat.total ? (stat.repair / stat.total) * 100 : 0;
      const span = stat.lastMs - stat.firstMs;
      stat.perHour = span > 0 ? stat.total / (span / 3600000) : stat.total;
      return stat;
    })
    .sort((a, b) => b.total - a.total);

  return {
    job,
    def,
    jenis: def?.jenis ?? null,
    active: def ? def.active : true,
    all,
    unique,
    pullStats,
    globalRepairStats,
    followUps,
    repairWork,
    totals: {
      records: all.length,
      units: unique.length,
      ok: counts.ok,
      repair: counts.repair,
      other: counts.other,
      repairRate: unique.length ? (counts.repair / unique.length) * 100 : 0,
    },
    byHour,
    byHourOfDay,
    dayCount,
    byStatus,
    byModel: groupBy(unique, row => row.modelName),
    byArea: groupBy(unique, row => row.areaProcess),
    byZone: groupBy(unique, row => zoneOf(row.areaProcess)),
    byOperator,
    busiestHour: busiestOf(byHour),
    firstMs,
    lastMs,
    spanMs,
    perHour,
    quality: {
      followUps: followUps.length,
      repairEntries: followUps.filter(f => f.kind === 'repair').length,
      corrections: histories.filter(unit => unit.base !== unit.entries[0]).length,
      duplicates: followUps.filter(f => f.kind === 'ganda').length,
      brokenText: unique.filter(hasBrokenText).length,
      missingTimestamp: all.filter(row => Number.isNaN(row.epochMs)).length,
    },
  };
}
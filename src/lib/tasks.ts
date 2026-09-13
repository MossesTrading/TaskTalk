import { supabase } from './supabase';

// Dashboard achievement task. Sumbernya tabel `DATA` di Supabase yang sama
// dengan app HP — tidak ada tabel atau SQL tambahan untuk web ini.
//
// Satu baris `DATA` = satu kali unit (FrameNumber) diperiksa untuk satu Job.
// Job-nya dinamis: sekarang baru "Debu Vulkanik", nanti bisa bertambah, dan
// setiap Job otomatis muncul sebagai satu kartu di halaman Task.

const TABLE = 'DATA';
const TASK_TABLE = 'Task';
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

export type TaskBoard = {
  job: string;
  /** Baris tabel master yang cocok, kalau ada. */
  def: TaskDef | null;
  jenis: string | null;
  active: boolean;
  /** Semua baris apa adanya, termasuk yang nanti ditimpa. */
  all: TaskRow[];
  /** Satu baris per FrameNumber: entri paling akhir yang dipakai. */
  unique: TaskRow[];
  /** Entri lama yang ditimpa entri lebih baru pada FrameNumber yang sama. */
  superseded: TaskRow[];
  totals: {
    records: number;
    units: number;
    ok: number;
    repair: number;
    other: number;
    repairRate: number;
  };
  /** Satu batang per jam kalender. Panjangnya ikut lebar rentang tanggal. */
  byHour: HourBucket[];
  /** Gabungan menurut jam 00–23, berapa pun panjang rentangnya (maksimal 24 batang). */
  byHourOfDay: HourBucket[];
  /** Berapa hari kalender yang benar-benar ada isinya. */
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
    superseded: number;
    changedStatus: number;
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
 * kalau satu FrameNumber punya lebih dari satu entri, yang dipakai adalah
 * entri PALING AKHIR (timestamp terbesar; kalau sama, id terbesar).
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

function isNewer(candidate: TaskRow, current: TaskRow) {
  const a = Number.isNaN(candidate.epochMs) ? -Infinity : candidate.epochMs;
  const b = Number.isNaN(current.epochMs) ? -Infinity : current.epochMs;
  if (a !== b) return a > b;
  return candidate.id > current.id;
}

function buildBoard(job: string, all: TaskRow[], def: TaskDef | null): TaskBoard {
  // 1 unit = 1 FrameNumber. Entri terakhir menang.
  const latest = new Map<string, TaskRow>();
  for (const row of all) {
    const key = row.frameNumber || `#${row.id}`;
    const current = latest.get(key);
    if (!current || isNewer(row, current)) latest.set(key, row);
  }
  const unique = [...latest.values()].sort((a, b) => a.epochMs - b.epochMs || a.id - b.id);
  const kept = new Set(unique.map(row => row.id));
  const superseded = all.filter(row => !kept.has(row.id));

  // Berapa unit yang status akhirnya berbeda dari entri pertamanya —
  // penanda entri yang dikoreksi, bukan dua pemeriksaan berbeda.
  let changedStatus = 0;
  for (const old of superseded) {
    const final = latest.get(old.frameNumber || `#${old.id}`);
    if (final && final.status !== old.status) changedStatus += 1;
  }

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

  // Jam kerja: tiap unit dihitung sekali, pada jam entri terakhirnya.
  const hourMap = new Map<string, HourBucket>();
  for (const row of unique) {
    if (Number.isNaN(row.epochMs)) continue;
    const { key, hour } = hourKey(row.epochMs);
    let bucket = hourMap.get(key);
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
      hourMap.set(key, bucket);
    }
    bucket.total += 1;
    bucket[classify(row.status)] += 1;
  }
  const byHour = [...hourMap.values()].sort((a, b) => a.key.localeCompare(b.key));

  // Versi gabungan: semua tanggal ditumpuk ke jam 00–23. Dipakai saat rentangnya
  // lebih dari beberapa hari, supaya grafiknya tetap terbaca (dan tidak
  // menggambar ribuan batang) sekaligus menjawab "jam berapa paling produktif".
  const dayCount = new Set(byHour.map(b => b.key.slice(0, 10))).size;
  const hourOfDayMap = new Map<string, HourBucket>();
  for (const bucket of byHour) {
    const hh = String(bucket.hour).padStart(2, '0');
    let merged = hourOfDayMap.get(hh);
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
      hourOfDayMap.set(hh, merged);
    }
    merged.total += bucket.total;
    merged.ok += bucket.ok;
    merged.repair += bucket.repair;
    merged.other += bucket.other;
  }
  const byHourOfDay = [...hourOfDayMap.values()].sort((a, b) => a.hour - b.hour);

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

  const busiestHour = byHour.reduce<HourBucket | null>(
    (best, bucket) => (!best || bucket.total > best.total ? bucket : best),
    null,
  );

  return {
    job,
    def,
    jenis: def?.jenis ?? null,
    active: def ? def.active : true,
    all,
    unique,
    superseded,
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
    busiestHour,
    firstMs,
    lastMs,
    spanMs,
    perHour,
    quality: {
      superseded: superseded.length,
      changedStatus,
      brokenText: unique.filter(hasBrokenText).length,
      missingTimestamp: all.filter(row => Number.isNaN(row.epochMs)).length,
    },
  };
}

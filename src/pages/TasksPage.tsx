import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  RefreshCw,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { useErrorDialog } from '../components/Dialog';
import { downloadTaskExcel } from '../lib/taskExport';
import {
  buildBoards,
  cleanText,
  fetchTaskDefs,
  fetchTaskRows,
  formatDuration,
  formatZoneDate,
  formatZoneTime,
  hasBrokenText,
  formatRange,
  shortcutRange,
  TZ_LABEL,
  type GroupStat,
  type HourBucket,
  type DateRange,
  type OperatorStat,
  type RepairFix,
  type RepairGroupStat,
  type RepairOperatorStat,
  type TaskBoard,
} from '../lib/tasks';
import './TasksPage.css';

// Dashboard achievement per task.
//
// Satu Job = satu kartu. Kartunya tertutup dulu (ringkasan sebaris), diklik
// baru melar jadi dashboard penuh. Job-nya tidak di-hardcode: apa pun yang ada
// di kolom Job otomatis jadi kartu, jadi task baru tinggal muncul sendiri.

export function TasksPage() {
  const showError = useErrorDialog();
  const [range, setRange] = useState<DateRange>(() => shortcutRange('hari-ini'));
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Nomor urut permintaan. Kalau rentang tanggal diganti cepat, jawaban yang
  // datang terlambat dari permintaan lama harus dibuang — kalau tidak, angkanya
  // bisa milik rentang lain daripada yang tertulis di tombol kalender.
  const requestId = useRef(0);

  const rangeLabel = formatRange(range);

  const load = useCallback(
    async (mode: 'first' | 'refresh') => {
      const myRequest = requestId.current + 1;
      requestId.current = myRequest;
      if (mode === 'refresh') setRefreshing(true);
      try {
        // Daftar task dan datanya diambil bersamaan: task yang belum punya data
        // tetap harus muncul sebagai kartu.
        const [defs, rows] = await Promise.all([fetchTaskDefs(), fetchTaskRows(range)]);
        if (requestId.current !== myRequest) return; // sudah ada permintaan lebih baru
        const next = buildBoards(rows, defs);
        setBoards(next);
        // Kalau cuma ada satu task, langsung dibuka — tidak ada gunanya
        // memaksa satu klik tambahan.
        setOpenJob(current => {
          if (current && next.some(b => b.job === current)) return current;
          return next.length === 1 ? next[0].job : null;
        });
        setState('ready');
      } catch (error) {
        if (requestId.current !== myRequest) return;
        console.warn('Gagal memuat data task', error);
        setState(current => (current === 'ready' ? current : 'error'));
        if (mode === 'refresh') showError('Gagal memuat data task', error);
      } finally {
        if (requestId.current === myRequest) setRefreshing(false);
      }
    },
    [range, showError],
  );

  useEffect(() => {
    setState('loading');
    load('first');
  }, [load]);

  const totalUnits = useMemo(
    () => boards.reduce((sum, board) => sum + board.totals.units, 0),
    [boards],
  );

  return (
    // Susunan .page / .page-head / .page-body sama dengan halaman lain:
    // judul tetap di atas, isinya yang menggulung.
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Task</h1>
          <p className="sub">
            {state === 'ready'
              ? `${boards.length} task · ${totalUnits} unit · jam ${TZ_LABEL}`
              : 'Achievement per task'}
          </p>
        </div>

        <div className="spacer" />

        <div className="tasks-actions">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className="btn neutral small"
            onClick={() => load('refresh')}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'spinning' : undefined} />
            Muat ulang
          </button>
        </div>
      </header>

      <div className="page-body">
        <div className="tasks">
          {state === 'loading' ? (
            <div className="center-page">
              <span className="spinner" />
            </div>
          ) : state === 'error' ? (
            <div className="empty">
              <WifiOff size={30} />
              <h3>Gagal memuat data</h3>
              <p>Periksa koneksi, lalu coba muat ulang.</p>
              <button
                type="button"
                className="btn secondary small"
                onClick={() => load('refresh')}
              >
                Coba lagi
              </button>
            </div>
          ) : boards.length === 0 ? (
            <div className="empty">
              <ClipboardList size={30} />
              <h3>Belum ada data</h3>
              <p>Tidak ada pemeriksaan yang tercatat pada {rangeLabel}.</p>
            </div>
          ) : (
            <div className="task-cards">
              {boards.map(board => (
                <TaskCard
                  key={board.job}
                  board={board}
                  periodLabel={rangeLabel}
                  open={openJob === board.job}
                  onToggle={() =>
                    setOpenJob(current => (current === board.job ? null : board.job))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kartu ────────────────────────────────────────────────────────────────── //

type CardProps = {
  board: TaskBoard;
  periodLabel: string;
  open: boolean;
  onToggle: () => void;
};

function TaskCard({ board, periodLabel, open, onToggle }: CardProps) {
  const t = board.totals;
  const panelId = `task-panel-${board.job.replace(/\W+/g, '-')}`;

  return (
    <section className={`task-card${open ? ' open' : ''}`}>
      <button
        type="button"
        className="task-card-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="task-card-title">
          <strong>
            {board.job}
            {board.jenis ? <em className="jenis">{board.jenis}</em> : null}
            {board.active ? null : <em className="jenis off">nonaktif</em>}
          </strong>
          <small>{cardSubtitle(board, periodLabel)}</small>
        </span>

        <span className="task-card-quick">
          <Pill label="Unit" value={t.units} />
          <Pill label="OK" value={t.ok} tone="ok" />
          <Pill label="Repair" value={t.repair} tone="repair" />
          {board.repairWork.opened ? (
            <Pill label="Selesai" value={board.repairWork.done} tone="fixed" />
          ) : null}
          <span className="quick-rate">
            <span className="rate-bar" aria-hidden="true">
              <i style={{ width: `${t.repairRate}%` }} />
            </span>
            <small>{t.repairRate.toFixed(0)}% repair</small>
          </span>
        </span>

        <ChevronDown size={20} className="task-chevron" />
      </button>

      {open ? <TaskPanel id={panelId} board={board} periodLabel={periodLabel} /> : null}
    </section>
  );
}

// Baris kecil di bawah judul kartu.
function cardSubtitle(board: TaskBoard, periodLabel: string) {
  if (board.totals.units === 0) return `Belum ada data · ${periodLabel}`;
  if (Number.isNaN(board.firstMs)) return periodLabel;
  if (board.dayCount > 1) {
    return `${formatZoneDate(board.firstMs)} – ${formatZoneDate(board.lastMs)} · ${board.dayCount} hari`;
  }
  return `${formatZoneDate(board.firstMs)} · ${formatZoneTime(board.firstMs)}–${formatZoneTime(board.lastMs)}`;
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'ok' | 'repair' | 'fixed';
}) {
  return (
    <span className={`pill${tone ? ` ${tone}` : ''}`}>
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}

// ── Isi dashboard ────────────────────────────────────────────────────────── //

function TaskPanel({
  id,
  board,
  periodLabel,
}: {
  id: string;
  board: TaskBoard;
  periodLabel: string;
}) {
  const [areaMode, setAreaMode] = useState<'blok' | 'area'>('blok');
  const t = board.totals;
  const areaList = areaMode === 'blok' ? board.byZone : board.byArea;
  // Lebih dari dua hari: satu batang per jam kalender jadi ratusan sampai ribuan
  // batang dan tidak terbaca lagi, jadi ditumpuk ke jam 00–23.
  const gabungJam = board.dayCount > 2;

  if (t.units === 0) {
    return (
      <div className="task-panel" id={id}>
        <div className="empty">
          <ClipboardList size={28} />
          <h3>Belum ada pemeriksaan</h3>
          <p>
            Task ini sudah terdaftar, tapi belum ada unit yang tercatat pada{' '}
            {periodLabel}. Coba pilih rentang tanggal yang lebih panjang.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="task-panel" id={id}>
      <div className="tiles">
        <Tile label="Unit unik" value={t.units} hint={`${t.records} entri tersimpan`} />
        <Tile label="OK" value={t.ok} tone="ok" hint={`${(100 - t.repairRate).toFixed(1)}%`} />
        <Tile
          label="Repair"
          value={t.repair}
          tone="repair"
          hint={
            board.repairWork.opened
              ? `${t.repairRate.toFixed(1)}% · ${board.repairWork.done} selesai`
              : `${t.repairRate.toFixed(1)}%`
          }
        />
        <Tile
          label="Rata-rata / jam"
          value={board.perHour.toFixed(1)}
          hint={`${board.byHour.length} jam aktif`}
        />
        <Tile
          label="Jam tersibuk"
          value={board.busiestHour ? board.busiestHour.label : '-'}
          hint={board.busiestHour ? `${board.busiestHour.total} unit` : '-'}
        />
        <Tile label="Rentang kerja" value={formatDuration(board.spanMs)} hint={periodLabel} />
      </div>

      <Section
        title="Achievement per jam"
        note={
          gabungJam
            ? `Semua ${board.dayCount} hari digabung menurut jam ${TZ_LABEL}, jadi terlihat jam berapa paling produktif.`
            : `Tiap unit dihitung sekali, pada jam entri yang dipakai (${TZ_LABEL}).`
        }
      >
        <HourChart buckets={gabungJam ? board.byHourOfDay : board.byHour} />
      </Section>

      <RepairSection board={board} periodLabel={periodLabel} />

      <div className="panel-split">
        <Section
          title="Status"
          note="Satu unit satu status: entri pertama — kecuali unitnya pernah repair, itu yang dipakai."
        >
          <StatusBreakdown board={board} />
        </Section>

        <Section title="Per model" note="Diurutkan dari jumlah unit terbanyak.">
          <StatTable rows={board.byModel} label="Model" />
        </Section>
      </div>

      <Section
        title="Per lokasi"
        note={
          areaMode === 'blok'
            ? 'Digabung per blok parkir (SY AP, SY BP, ...).'
            : 'Rincian tiap titik area.'
        }
        action={
          <div className="seg" role="group" aria-label="Tingkat rincian lokasi">
            <button
              type="button"
              className={areaMode === 'blok' ? 'active' : ''}
              onClick={() => setAreaMode('blok')}
            >
              Blok
            </button>
            <button
              type="button"
              className={areaMode === 'area' ? 'active' : ''}
              onClick={() => setAreaMode('area')}
            >
              Area
            </button>
          </div>
        }
      >
        <StatTable rows={areaList} label={areaMode === 'blok' ? 'Blok' : 'Area'} max={12} />
      </Section>

      <Section title="Per petugas" note="Unit per jam dihitung dari jam pertama sampai terakhir.">
        <OperatorTable rows={board.byOperator} />
      </Section>

      <DataNotes board={board} />

      <div className="panel-foot">
        <button
          type="button"
          className="btn"
          onClick={() => downloadTaskExcel(board, periodLabel)}
        >
          <Download size={16} />
          Unduh Excel
        </button>
        <small className="muted">
          Ringkasan, per jam, status, model, area, blok, petugas, data, pengerjaan repair, dan
          entri susulan.
        </small>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-section">
      <header>
        <div>
          <h3>{title}</h3>
          {note ? <small className="muted">{note}</small> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'ok' | 'repair' | 'fixed';
}) {
  return (
    <div className={`tile${tone ? ` ${tone}` : ''}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

// Grafik batang sederhana — digambar dengan CSS, tanpa library chart.
// variant "fixed": satu warna saja, dipakai grafik penyelesaian repair.
function HourChart({
  buckets,
  variant = 'status',
}: {
  buckets: HourBucket[];
  variant?: 'status' | 'fixed';
}) {
  if (buckets.length === 0) {
    return <p className="muted small-note">Belum ada entri dengan waktu yang terbaca.</p>;
  }
  const max = Math.max(...buckets.map(b => b.total));
  const multiDay = new Set(buckets.map(b => b.dayLabel)).size > 1;

  return (
    <div className="hours">
      <div className="hours-plot" style={{ ['--rows' as string]: String(max) }}>
        {buckets.map(bucket => (
          <div
            key={bucket.key}
            className="hour-col"
            title={
              variant === 'fixed'
                ? `${bucket.dayLabel} ${bucket.label} — ${bucket.total} repair selesai`
                : `${bucket.dayLabel} ${bucket.label} — ${bucket.total} unit (OK ${bucket.ok}, Repair ${bucket.repair})`
            }
          >
            <span className="hour-total">{bucket.total}</span>
            <span className="hour-stack" style={{ height: `${(bucket.total / max) * 100}%` }}>
              {variant === 'fixed' ? (
                <i className="seg-fixed" style={{ height: '100%' }} />
              ) : (
                <>
                  <i
                    className="seg-repair"
                    style={{ height: `${(bucket.repair / bucket.total) * 100}%` }}
                  />
                  <i
                    className="seg-other"
                    style={{ height: `${(bucket.other / bucket.total) * 100}%` }}
                  />
                  <i className="seg-ok" style={{ height: `${(bucket.ok / bucket.total) * 100}%` }} />
                </>
              )}
            </span>
            <span className="hour-label">
              {bucket.label}
              {multiDay ? <em>{bucket.dayLabel}</em> : null}
            </span>
          </div>
        ))}
      </div>
      {variant === 'fixed' ? (
        <div className="legend">
          <span>
            <i className="dot fixed" /> Repair selesai
          </span>
        </div>
      ) : (
        <Legend />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span>
        <i className="dot ok" /> OK
      </span>
      <span>
        <i className="dot repair" /> Repair
      </span>
      <span>
        <i className="dot other" /> Lainnya
      </span>
    </div>
  );
}

// ── Achievement pengerjaan repair ────────────────────────────────────────── //
//
// Papan kedua, sengaja dipisah dari angka pemeriksaan di atas. Isinya unit yang
// entri pertamanya repair lalu dicatat ulang jadi OK: itu hasil pengerjaan
// repair, bukan unit baru, jadi tidak boleh menambah kolom OK pemeriksaan.

function RepairSection({ board, periodLabel }: { board: TaskBoard; periodLabel: string }) {
  const r = board.repairWork;
  // Sama seperti grafik utama: lebih dari dua hari ditumpuk ke jam 00–23.
  const gabungJam = r.dayCount > 2;
  const multiDay = r.dayCount > 1;

  return (
    <section className="panel-section repair-block">
      <header>
        <div>
          <h3>
            <Wrench size={16} /> Achievement pengerjaan repair
          </h3>
          <small className="muted">
            Unit repair yang dicatat ulang jadi OK. Hitungannya berdiri sendiri — tidak
            dijumlahkan ke OK pemeriksaan di atas, dan entrinya tidak dianggap entri ganda.
          </small>
        </div>
      </header>

      {r.opened === 0 ? (
        <p className="muted small-note">
          Tidak ada unit berstatus repair pada {periodLabel}, jadi belum ada yang bisa dikerjakan.
        </p>
      ) : (
        <>
          <div className="tiles">
            <Tile
              label="Unit repair"
              value={r.opened}
              tone="repair"
              hint="hasil pemeriksaan"
            />
            <Tile
              label="Selesai (jadi OK)"
              value={r.done}
              tone="fixed"
              hint={`${r.doneRate.toFixed(1)}% dari repair`}
            />
            <Tile
              label="Belum selesai"
              value={r.open}
              hint={`${(100 - r.doneRate).toFixed(1)}% dari repair`}
            />
            <Tile
              label="Lama perbaikan"
              value={formatDuration(r.medianMs)}
              hint={`median · rata-rata ${formatDuration(r.avgMs)}`}
            />
            <Tile
              label="Jam tersibuk"
              value={r.busiestHour ? r.busiestHour.label : '-'}
              hint={r.busiestHour ? `${r.busiestHour.total} selesai` : '-'}
            />
            <Tile
              label="Rata-rata / jam"
              value={r.perHour.toFixed(1)}
              hint={`${r.byHour.length} jam aktif`}
            />
          </div>

          {r.done === 0 ? (
            <p className="muted small-note">
              Belum ada unit repair yang dicatat ulang jadi OK pada {periodLabel}.
            </p>
          ) : (
            <>
              <div className="sub-block">
                <h4>
                  Selesai per jam
                  <small className="muted">
                    {gabungJam
                      ? `${r.dayCount} hari digabung menurut jam ${TZ_LABEL}.`
                      : `Dihitung pada jam entri OK-nya (${TZ_LABEL}).`}
                  </small>
                </h4>
                <HourChart buckets={gabungJam ? r.byHourOfDay : r.byHour} variant="fixed" />
              </div>

              <div className="panel-split">
                <div className="sub-block">
                  <h4>
                    Per petugas
                    <small className="muted">Petugas yang mencatat unitnya jadi OK.</small>
                  </h4>
                  <RepairOperatorTable rows={r.byOperator} />
                </div>

                <div className="sub-block">
                  <h4>
                    Per model
                    <small className="muted">Berapa repair yang sudah tuntas di tiap model.</small>
                  </h4>
                  <RepairGroupTable rows={r.byModel} label="Model" max={8} />
                </div>
              </div>

              <div className="sub-block">
                <h4>
                  Daftar unit selesai
                  <small className="muted">Dari repair sampai dinyatakan OK.</small>
                </h4>
                <RepairFixTable fixes={r.fixes} multiDay={multiDay} />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function RepairOperatorTable({ rows }: { rows: RepairOperatorStat[] }) {
  if (rows.length === 0) {
    return <p className="muted small-note">Belum ada data.</p>;
  }
  return (
    <table className="stat-table">
      <thead>
        <tr>
          <th>Petugas</th>
          <th>Selesai</th>
          <th>Jam kerja</th>
          <th>Unit/jam</th>
          <th>Rata-rata</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key}>
            <td className="col-name">{row.key}</td>
            <td>{row.done}</td>
            <td className="nowrap">
              <Clock size={13} /> {formatZoneTime(row.firstMs)}–{formatZoneTime(row.lastMs)}
            </td>
            <td>{row.perHour.toFixed(1)}</td>
            <td className="nowrap">{formatDuration(row.avgMs)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RepairGroupTable({
  rows,
  label,
  max,
}: {
  rows: RepairGroupStat[];
  label: string;
  max?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) {
    return <p className="muted small-note">Belum ada data.</p>;
  }
  const limit = max ?? rows.length;
  const visible = showAll ? rows : rows.slice(0, limit);
  const top = rows[0].opened;

  return (
    <>
      <table className="stat-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th>Repair</th>
            <th>Selesai</th>
            <th className="col-rate">Selesai</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(row => (
            <tr key={row.key}>
              <td className="col-name">
                <span className="mini-bar" aria-hidden="true">
                  <i style={{ width: `${(row.opened / top) * 100}%` }} />
                </span>
                {row.key}
              </td>
              <td>{row.opened}</td>
              <td>{row.done}</td>
              <td className="col-rate">
                <span className="rate-bar small fixed" aria-hidden="true">
                  <i style={{ width: `${row.doneRate}%` }} />
                </span>
                {row.doneRate.toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit ? (
        <button type="button" className="btn ghost small" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${rows.length})`}
        </button>
      ) : null}
    </>
  );
}

function RepairFixTable({ fixes, multiDay }: { fixes: RepairFix[]; multiDay: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 8;
  const visible = showAll ? fixes : fixes.slice(0, LIMIT);

  return (
    <>
      <table className="stat-table fix-table">
        <thead>
          <tr>
            <th>FrameNumber</th>
            <th>Model</th>
            <th>Repair</th>
            <th>Selesai</th>
            <th>Lama</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(fix => (
            <tr key={fix.closed.id}>
              <td className="col-name">
                <code>{fix.frameNumber || '-'}</code>
              </td>
              <td className="col-left">{cleanText(fix.opened.modelName)}</td>
              <td className="nowrap">
                {formatZoneTime(fix.opened.epochMs)}
                {multiDay ? <em>{formatZoneDate(fix.opened.epochMs)}</em> : null}
              </td>
              <td className="nowrap">
                {formatZoneTime(fix.closed.epochMs)}
                {multiDay ? <em>{formatZoneDate(fix.closed.epochMs)}</em> : null}
              </td>
              <td className="nowrap">{formatDuration(fix.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fixes.length > LIMIT ? (
        <button type="button" className="btn ghost small" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${fixes.length})`}
        </button>
      ) : null}
    </>
  );
}

function StatusBreakdown({ board }: { board: TaskBoard }) {
  const t = board.totals;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  // Tiap potongan donat butuh panjang busurnya sendiri + jarak dari potongan
  // sebelumnya, jadi panjang potongan sebelumnya dijumlahkan berjalan.
  const slices = board.byStatus.reduce<
    { status: string; count: number; share: number; length: number; offset: number }[]
  >((acc, s) => {
    const previous = acc[acc.length - 1];
    const length = (s.count / Math.max(t.units, 1)) * circumference;
    acc.push({ ...s, length, offset: previous ? previous.offset + previous.length : 0 });
    return acc;
  }, []);

  const toneOf = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'ok') return 'ok';
    if (s === 'repair') return 'repair';
    return 'other';
  };

  return (
    <div className="status-split">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Sebaran status">
        <circle cx="70" cy="70" r={radius} className="donut-track" />
        {slices.map(slice => (
          <circle
            key={slice.status}
            cx="70"
            cy="70"
            r={radius}
            className={`donut-slice ${toneOf(slice.status)}`}
            strokeDasharray={`${slice.length} ${circumference - slice.length}`}
            strokeDashoffset={-slice.offset}
          />
        ))}
        <text x="70" y="64" className="donut-value">
          {t.units}
        </text>
        <text x="70" y="84" className="donut-label">
          unit
        </text>
      </svg>

      <ul className="status-list">
        {board.byStatus.map(s => (
          <li key={s.status}>
            <i className={`dot ${toneOf(s.status)}`} />
            <span>{s.status}</span>
            <b>{s.count}</b>
            <small>{s.share.toFixed(1)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatTable({
  rows,
  label,
  max,
}: {
  rows: GroupStat[];
  label: string;
  max?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) {
    return <p className="muted small-note">Belum ada data.</p>;
  }
  const limit = max ?? rows.length;
  const visible = showAll ? rows : rows.slice(0, limit);
  const top = rows[0].total;

  return (
    <>
      <table className="stat-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th>Unit</th>
            <th>OK</th>
            <th>Repair</th>
            <th className="col-rate">Repair</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(row => (
            <tr key={row.key}>
              <td className="col-name">
                <span className="mini-bar" aria-hidden="true">
                  <i style={{ width: `${(row.total / top) * 100}%` }} />
                </span>
                {row.key}
              </td>
              <td>{row.total}</td>
              <td>{row.ok}</td>
              <td>{row.repair}</td>
              <td className="col-rate">
                <span className="rate-bar small" aria-hidden="true">
                  <i style={{ width: `${row.repairRate}%` }} />
                </span>
                {row.repairRate.toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit ? (
        <button type="button" className="btn ghost small" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${rows.length})`}
        </button>
      ) : null}
    </>
  );
}

function OperatorTable({ rows }: { rows: OperatorStat[] }) {
  if (rows.length === 0) {
    return <p className="muted small-note">Belum ada data.</p>;
  }
  return (
    <table className="stat-table">
      <thead>
        <tr>
          <th>Petugas</th>
          <th>Unit</th>
          <th>Repair</th>
          <th>Jam kerja</th>
          <th>Unit/jam</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key}>
            <td className="col-name">{row.key}</td>
            <td>{row.total}</td>
            <td>
              {row.repair} <small className="muted">({row.repairRate.toFixed(0)}%)</small>
            </td>
            <td className="nowrap">
              <Clock size={13} /> {formatZoneTime(row.firstMs)}–{formatZoneTime(row.lastMs)}
            </td>
            <td>{row.perHour.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Catatan mutu data: hal-hal yang mengubah angka kalau diabaikan.
function DataNotes({ board }: { board: TaskBoard }) {
  const q = board.quality;
  const broken = board.unique.filter(hasBrokenText);
  // Pengerjaan repair & koreksi bukan masalah data, jadi tidak memunculkan
  // kotak ini — yang dianggap perlu dilihat hanya entri yang benar-benar ganda.
  if (!q.duplicates && !q.brokenText && !q.missingTimestamp) return null;

  return (
    <section className="panel-section notes">
      <header>
        <div>
          <h3>
            <AlertTriangle size={16} /> Catatan data
          </h3>
          <small className="muted">Tidak mengubah angka di atas, tapi perlu diketahui.</small>
        </div>
      </header>

      <ul>
        {q.duplicates ? (
          <li>
            <Wrench size={14} />
            <div>
              <b>{q.duplicates} entri ganda.</b> FrameNumber yang sama tercatat lagi tanpa
              mengubah hasil pemeriksaannya, jadi yang dipakai entri pertama. Entri susulan
              lain — {q.repairEntries} pengerjaan repair
              {q.corrections ? ` dan ${q.corrections} koreksi jadi repair` : ''} — tidak ikut
              dihitung di sini karena bukan entri berulang. Rinciannya ada di sheet{' '}
              <i>Entri Susulan</i> pada file Excel.
              <ul className="dup-list">
                {board.followUps
                  .filter(follow => follow.kind === 'ganda')
                  .slice(0, 4)
                  .map(follow => (
                    <li key={follow.row.id}>
                      <code>{follow.row.frameNumber}</code> {follow.base.status}{' '}
                      {formatZoneTime(follow.base.epochMs)}
                      {' → '}
                      <b>{follow.row.status}</b> {formatZoneTime(follow.row.epochMs)}
                    </li>
                  ))}
                {q.duplicates > 4 ? (
                  <li className="muted">dan {q.duplicates - 4} lainnya…</li>
                ) : null}
              </ul>
            </div>
          </li>
        ) : null}

        {q.brokenText ? (
          <li>
            <AlertTriangle size={14} />
            <div>
              <b>{q.brokenText} unit punya teks tipe yang rusak.</b> Ada karakter tidak terbaca
              yang tersimpan sejak dari sumber datanya, misalnya{' '}
              <code>{cleanText(broken[0]?.typeName ?? '')}</code>. Di file Excel karakter itu
              sudah dibersihkan, tapi perbaikannya sebaiknya di aplikasi yang menulis data.
            </div>
          </li>
        ) : null}

        {q.missingTimestamp ? (
          <li>
            <AlertTriangle size={14} />
            <div>
              <b>{q.missingTimestamp} entri tanpa waktu yang terbaca.</b> Entri ini tidak masuk
              hitungan per jam.
            </div>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

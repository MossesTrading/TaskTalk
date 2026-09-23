import {
  cleanText,
  formatDuration,
  formatZoneDate,
  TZ_HOURS,
  TZ_LABEL,
  type PullStats,
  type TaskBoard,
  type TaskRow,
} from './tasks';
import { downloadXlsx, toExcelDate, type XlsxSheet } from './xlsx';

// Susunan file Excel yang diunduh dari kartu dashboard.
// Angkanya sama persis dengan yang tampil di layar: pemeriksaan berbasis
// `unique` (satu baris per FrameNumber, entri PERTAMA yang dipakai), sedangkan
// pengerjaan repair punya sheet sendiri dan tidak dijumlahkan ke sana.
// Entri susulan tidak dibuang diam-diam — ada di sheet "Entri Susulan".

function round(value: number, digits = 1) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function dateCell(epochMs: number) {
  return Number.isNaN(epochMs) ? null : toExcelDate(epochMs, TZ_HOURS);
}

function rowCells(row: TaskRow) {
  return [
    row.id,
    row.frameNumber,
    row.modelName,
    cleanText(row.typeName),
    row.colorName,
    row.areaProcess,
    row.status,
    dateCell(row.epochMs),
    row.createdByName,
    row.createdBy,
  ];
}

const DATA_COLUMNS = [
  'id',
  'FrameNumber',
  'Model',
  'Tipe',
  'Warna',
  'Area',
  'Status',
  `Waktu (${TZ_LABEL})`,
  'Petugas',
  'created_by',
];

export function buildTaskSheets(board: TaskBoard, periodLabel: string): XlsxSheet[] {
  const t = board.totals;
  const r = board.repairWork;
  const p = board.pullStats;
  const isPull = board.jenis === 'PULL';

  const ringkasan: XlsxSheet = {
    name: 'Ringkasan',
    columns: ['Keterangan', 'Nilai'],
    rows: [
      ['Job', board.job],
      ['Jenis task', board.jenis ?? '-'],
      ['Periode', periodLabel],
      ['Zona waktu', `UTC+${TZ_HOURS} (${TZ_LABEL})`],
      ['Diunduh', toExcelDate(Date.now(), TZ_HOURS)],
      [null, null],
      ['Unit unik diperiksa', t.units],
      ['Total entri tersimpan', t.records],
      ['Entri susulan', board.quality.followUps],
      ['— di antaranya pengerjaan repair', board.quality.repairEntries],
      ['— di antaranya koreksi jadi repair', board.quality.corrections],
      ['— entri ganda', board.quality.duplicates],
      [null, null],
      ['— Pemeriksaan awal (entri pertama) —', null],
      ['OK', t.ok],
      ['Repair', t.repair],
      ['Status lain', t.other],
      ['Repair (%)', round(t.repairRate, 2)],
      [null, null],
      ...(isPull
        ? [
            ['— Statistik PULL (pengambilan unit) —', null],
            ['Total unit (global)', p?.total ?? 0],
            ['Sudah ditarik (sync = true)', p?.pulled ?? 0],
            ['Sisa (sync = false)', p?.remaining ?? 0],
            ['Tarik (%)', p ? round(p.pullRate, 2) : 0],
          ]
        : [
            ['— Pengerjaan repair (dihitung terpisah) —', null],
            ['OK dari PIC REPAIR', r.done],
            ['Dengan repair sebelumnya', r.opened],
            ['Selesai (%)', round(r.doneRate, 2)],
            ['Rata-rata lama perbaikan', formatDuration(r.avgMs)],
            ['Median lama perbaikan', formatDuration(r.medianMs)],
            ['Unit dikoreksi jadi repair', board.quality.corrections],
          ]),
      [null, null],
      ['Mulai', dateCell(board.firstMs)],
      ['Selesai', dateCell(board.lastMs)],
      ['Rentang', formatDuration(board.spanMs)],
      ['Jam aktif', board.byHour.length],
      ['Rata-rata unit / jam aktif', round(board.perHour, 2)],
      [
        'Jam tersibuk',
        board.busiestHour
          ? `${board.busiestHour.dayLabel} ${board.busiestHour.label} (${board.busiestHour.total} unit)`
          : '-',
      ],
      [null, null],
      ['Petugas terlibat', board.byOperator.length],
      ['Model berbeda', board.byModel.length],
      ['Area terpakai', board.byArea.length],
      ['Teks rusak (karakter U+FFFD)', board.quality.brokenText],
      ['Entri tanpa waktu terbaca', board.quality.missingTimestamp],
    ],
    widths: [34, 30],
  };

  const perJam: XlsxSheet = {
    name: 'Per Jam',
    columns: ['Tanggal', `Jam (${TZ_LABEL})`, 'Unit', 'OK', 'Repair', 'Lainnya', 'Repair (%)'],
    rows: board.byHour.map(b => [
      b.dayLabel,
      b.label,
      b.total,
      b.ok,
      b.repair,
      b.other,
      round(b.total ? (b.repair / b.total) * 100 : 0, 1),
    ]),
  };

  const perStatus: XlsxSheet = {
    name: 'Per Status',
    columns: ['Status', 'Unit', 'Porsi (%)'],
    rows: board.byStatus.map(s => [s.status, s.count, round(s.share, 1)]),
  };

  const groupSheet = (name: string, label: string, list: TaskBoard['byModel']): XlsxSheet => ({
    name,
    columns: [label, 'Unit', 'OK', 'Repair', 'Lainnya', 'Repair (%)'],
    rows: list.map(g => [g.key, g.total, g.ok, g.repair, g.other, round(g.repairRate, 1)]),
  });

  const perPetugas: XlsxSheet = {
    name: 'Per Petugas',
    columns: [
      'Petugas',
      'Unit',
      'OK',
      'Repair',
      'Repair (%)',
      'Mulai',
      'Selesai',
      'Unit / jam',
    ],
    rows: board.byOperator.map(o => [
      o.key,
      o.total,
      o.ok,
      o.repair,
      round(o.repairRate, 1),
      dateCell(o.firstMs),
      dateCell(o.lastMs),
      round(o.perHour, 2),
    ]),
  };

  const data: XlsxSheet = {
    name: 'Data',
    columns: DATA_COLUMNS,
    rows: board.unique.map(rowCells),
  };

  const sheets: XlsxSheet[] = [
    ringkasan,
    perJam,
    perStatus,
    groupSheet('Per Model', 'Model', board.byModel),
    groupSheet('Per Area', 'Area', board.byArea),
    groupSheet('Per Blok', 'Blok', board.byZone),
    perPetugas,
    data,
  ];

  // Sheet repair hanya untuk task PUSH
  if (!isPull && r.done > 0) {
    sheets.push(
      {
        name: 'Repair Selesai',
        columns: [
          'FrameNumber',
          'Model',
          'Tipe',
          'Area',
          `Repair (${TZ_LABEL})`,
          'Petugas repair',
          `Selesai (${TZ_LABEL})`,
          'Petugas selesai',
          'Lama',
          'Lama (jam)',
        ],
        rows: r.fixes.map(fix => [
          fix.frameNumber,
          fix.opened.modelName,
          cleanText(fix.opened.typeName),
          fix.closed.areaProcess,
          dateCell(fix.opened.epochMs),
          fix.opened.createdByName,
          dateCell(fix.closed.epochMs),
          fix.closed.createdByName,
          formatDuration(fix.durationMs),
          Number.isFinite(fix.durationMs) ? round(fix.durationMs / 3600000, 2) : null,
        ]),
        widths: [20, 18, 22, 14, 18, 20, 18, 20, 12, 11],
      },
      {
        name: 'Repair Per Jam',
        columns: ['Tanggal', `Jam (${TZ_LABEL})`, 'Repair selesai'],
        rows: r.byHour.map(b => [b.dayLabel, b.label, b.total]),
      },
      {
        name: 'Repair Per Petugas',
        columns: ['Petugas', 'Repair selesai', 'Mulai', 'Selesai', 'Unit / jam', 'Rata-rata lama'],
        rows: r.byOperator.map(o => [
          o.key,
          o.done,
          dateCell(o.firstMs),
          dateCell(o.lastMs),
          round(o.perHour, 2),
          formatDuration(o.avgMs),
        ]),
      },
    );
  }

  if (board.followUps.length) {
    const kindLabel: Record<string, string> = {
      repair: 'pengerjaan repair',
      koreksi: 'koreksi jadi repair',
      ganda: 'entri ganda',
    };
    sheets.push({
      name: 'Entri Susulan',
      columns: [...DATA_COLUMNS, 'Jenis', 'Status dipakai'],
      rows: board.followUps.map(follow => [
        ...rowCells(follow.row),
        kindLabel[follow.kind],
        follow.base.status,
      ]),
    });
  }

  return sheets;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'task'
  );
}

export function downloadTaskExcel(board: TaskBoard, periodLabel: string) {
  const stamp = Number.isNaN(board.lastMs)
    ? formatZoneDate(Date.now())
    : formatZoneDate(board.lastMs);
  const name = `achievement-${slug(board.job)}-${slug(stamp)}.xlsx`;
  downloadXlsx(name, buildTaskSheets(board, periodLabel));
}

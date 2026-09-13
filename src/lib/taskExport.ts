import {
  cleanText,
  formatDuration,
  formatZoneDate,
  TZ_HOURS,
  TZ_LABEL,
  type TaskBoard,
  type TaskRow,
} from './tasks';
import { downloadXlsx, toExcelDate, type XlsxSheet } from './xlsx';

// Susunan file Excel yang diunduh dari kartu dashboard.
// Angkanya sama persis dengan yang tampil di layar: semua berbasis `unique`
// (satu baris per FrameNumber, entri terakhir yang dipakai). Entri lama tidak
// dibuang diam-diam — ditaruh di sheet "Entri Ditimpa" supaya bisa ditelusuri.

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

  const ringkasan: XlsxSheet = {
    name: 'Ringkasan',
    columns: ['Keterangan', 'Nilai'],
    rows: [
      ['Job', board.job],
      ['Periode', periodLabel],
      ['Zona waktu', `UTC+${TZ_HOURS} (${TZ_LABEL})`],
      ['Diunduh', toExcelDate(Date.now(), TZ_HOURS)],
      [null, null],
      ['Unit unik diperiksa', t.units],
      ['Total entri tersimpan', t.records],
      ['Entri ditimpa (revisi)', board.quality.superseded],
      [null, null],
      ['OK', t.ok],
      ['Repair', t.repair],
      ['Status lain', t.other],
      ['Repair (%)', round(t.repairRate, 2)],
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

  if (board.superseded.length) {
    sheets.push({
      name: 'Entri Ditimpa',
      columns: [...DATA_COLUMNS, 'Status akhir dipakai'],
      rows: board.superseded.map(row => {
        const final = board.unique.find(u => u.frameNumber === row.frameNumber);
        return [...rowCells(row), final ? final.status : '-'];
      }),
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

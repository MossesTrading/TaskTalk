// Penulis file .xlsx sederhana, tanpa library tambahan.
//
// Kenapa ditulis sendiri: paket `xlsx` di npm sudah tidak dirawat (versi terakhir
// di registry punya advisory prototype-pollution), sementara yang kita butuhkan
// cuma "tulis beberapa sheet berisi teks/angka/tanggal". Itu cukup ~200 baris.
//
// Isi .xlsx sebenarnya cuma ZIP berisi beberapa file XML. ZIP-nya ditulis dengan
// metode "store" (tanpa kompresi) supaya tidak perlu implementasi DEFLATE —
// filenya jadi sedikit lebih besar, tapi untuk ribuan baris masih kecil dan
// Excel membukanya sama saja.

export type XlsxDate = { kind: 'date'; serial: number };
export type XlsxCell = string | number | boolean | XlsxDate | null | undefined;

export type XlsxSheet = {
  name: string;
  columns: string[];
  rows: XlsxCell[][];
  /** Lebar kolom (karakter). Kalau kosong, dihitung otomatis dari isinya. */
  widths?: number[];
};

// Excel menghitung tanggal sebagai jumlah hari sejak 1899-12-30.
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86400000;

/**
 * Ubah waktu UTC jadi angka tanggal Excel pada zona waktu tertentu.
 * Excel tidak menyimpan timezone, jadi jamnya digeser dulu (tzHours = 7 -> WIB).
 */
export function toExcelDate(epochMs: number, tzHours = 0): XlsxDate {
  return {
    kind: 'date',
    serial: (epochMs + tzHours * 3600000) / MS_PER_DAY + EXCEL_EPOCH_OFFSET_DAYS,
  };
}

function isXlsxDate(value: XlsxCell): value is XlsxDate {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

// ── XML ──────────────────────────────────────────────────────────────────── //

function esc(value: string) {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    // Karakter kontrol tidak sah di XML 1.0 -> buang, kalau tidak Excel menolak file.
    if (code < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r') continue;
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else out += ch;
  }
  return out;
}

function columnLetter(index: number) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// Gaya sel: 0 = biasa, 1 = judul kolom, 2 = tanggal, 3 = angka 2 desimal.
const STYLE_PLAIN = 0;
const STYLE_HEADER = 1;
const STYLE_DATE = 2;
const STYLE_DECIMAL = 3;

function cellXml(ref: string, value: XlsxCell, style: number) {
  if (value === null || value === undefined || value === '') {
    return style === STYLE_PLAIN ? '' : `<c r="${ref}" s="${style}"/>`;
  }
  if (isXlsxDate(value)) {
    return `<c r="${ref}" s="${STYLE_DATE}"><v>${value.serial}</v></c>`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    const s = Number.isInteger(value) ? STYLE_PLAIN : STYLE_DECIMAL;
    return `<c r="${ref}" s="${s}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  // Teks ditulis langsung di selnya (inlineStr), jadi tidak perlu sharedStrings.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(
    value,
  )}</t></is></c>`;
}

function autoWidths(sheet: XlsxSheet) {
  if (sheet.widths) return sheet.widths;
  return sheet.columns.map((name, col) => {
    let max = name.length;
    // Cukup lihat 200 baris pertama; lebar kolom tidak perlu presisi.
    for (let r = 0; r < Math.min(sheet.rows.length, 200); r += 1) {
      const v = sheet.rows[r]?.[col];
      if (v === null || v === undefined) continue;
      const len = isXlsxDate(v) ? 21 : String(v).length;
      if (len > max) max = len;
    }
    return Math.min(Math.max(max + 2, 9), 46);
  });
}

function sheetXml(sheet: XlsxSheet) {
  const widths = autoWidths(sheet);
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const header = sheet.columns
    .map((name, i) => cellXml(`${columnLetter(i)}1`, name, STYLE_HEADER))
    .join('');

  const body = sheet.rows
    .map((row, r) => {
      const rowNo = r + 2;
      const cells = sheet.columns
        .map((_, c) => cellXml(`${columnLetter(c)}${rowNo}`, row[c], STYLE_PLAIN))
        .join('');
      return `<row r="${rowNo}">${cells}</row>`;
    })
    .join('');

  const lastCol = columnLetter(Math.max(sheet.columns.length - 1, 0));
  const lastRow = sheet.rows.length + 1;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData><row r="1">${header}</row>${body}</sheetData><autoFilter ref="A1:${lastCol}${lastRow}"/></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF1F4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// Excel menolak nama sheet yang memakai : \ / ? * [ ] atau lebih dari 31 karakter.
function safeSheetName(name: string, used: Set<string>) {
  let base = name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let out = base;
  let n = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = ` ${n}`;
    out = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  used.add(out.toLowerCase());
  return out;
}

// ── ZIP (metode store) ───────────────────────────────────────────────────── //

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; bytes: Uint8Array; crc: number; offset: number };

function zip(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const bytes = encoder.encode(file.content);
    const crc = crc32(bytes);

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // tanda local file header
    header.setUint16(4, 20, true); // butuh versi 2.0
    header.setUint16(6, 0x0800, true); // nama file UTF-8
    header.setUint16(8, 0, true); // metode 0 = store
    header.setUint16(10, 0, true); // jam (tidak dipakai)
    header.setUint16(12, 0x2d21, true); // tanggal (2002-09-01, sekadar nilai sah)
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);

    entries.push({ name: file.name, bytes, crc, offset });
    push(new Uint8Array(header.buffer));
    push(nameBytes);
    push(bytes);
  }

  const centralStart = offset;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x2d21, true);
    cd.setUint32(16, entry.crc, true);
    cd.setUint32(20, entry.bytes.length, true);
    cd.setUint32(24, entry.bytes.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, entry.offset, true);
    push(new Uint8Array(cd.buffer));
    push(nameBytes);
  }

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, offset - centralStart, true);
  eocd.setUint32(16, centralStart, true);
  push(new Uint8Array(eocd.buffer));

  return new Blob(chunks as BlobPart[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── API ──────────────────────────────────────────────────────────────────── //

export function buildXlsx(sheets: XlsxSheet[]) {
  const used = new Set<string>();
  const named = sheets.map(sheet => ({ ...sheet, name: safeSheetName(sheet.name, used) }));

  const sheetTags = named
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const relTags = named
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('');
  const overrides = named
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');

  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relTags}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', content: STYLES_XML },
    ...named.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: sheetXml(sheet),
    })),
  ];

  return zip(files);
}

export function downloadXlsx(filename: string, sheets: XlsxSheet[]) {
  const url = URL.createObjectURL(buildXlsx(sheets));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  // Beri jeda sebelum URL dibuang, kalau tidak unduhan bisa batal di sebagian browser.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

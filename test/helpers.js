import { toISO, parseISO, lastDayOfMonth } from '../src/lib/dates.js';

function weekdaysIn(month) {
  let n = 0;
  const last = Number(lastDayOfMonth(month).slice(8, 10));
  for (let day = 1; day <= last; day++) {
    const dow = parseISO(`${month}-${String(day).padStart(2, '0')}`).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

// Szereg dzienny (dni robocze); stopa zwrotu od końca do końca każdego pełnego miesiąca jest dokładnie równa `monthly`.
export function makeDaily(startIso, endIso, monthly, start = 100) {
  const out = [];
  const d = parseISO(startIso);
  const end = parseISO(endIso);
  let value = start;
  let prevMonth = null;
  let dailyRate = 0;
  while (d <= end) {
    const dow = d.getUTCDay();
    const iso = toISO(d);
    const month = iso.slice(0, 7);
    if (month !== prevMonth) {
      const r = typeof monthly === 'function' ? monthly(month) : monthly;
      dailyRate = (1 + r) ** (1 / weekdaysIn(month)) - 1;
      prevMonth = month;
    }
    if (dow !== 0 && dow !== 6) {
      value *= 1 + dailyRate;
      out.push({ date: iso, value });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const testConfig = {
  strategy: { variant: 'klasyczny', lookbackMonths: 12, skipMonths: 0, safeAssetRule: 'obligacje', switchBufferPct: 0, nearTiePct: 1 },
  variants: {
    klasyczny: { equities: ['US', 'EXUS'], absoluteRef: 'US', hurdle: 'TBILLS', safe: ['BONDS', 'TBILLS'] },
    rozszerzony: { equities: ['US', 'DEVX', 'EM'], absoluteRef: 'US', hurdle: 'TBILLS', safe: ['BONDS', 'TBILLS'] },
  },
  assets: Object.fromEntries(['US', 'EXUS', 'DEVX', 'EM', 'BONDS', 'TBILLS'].map((k) => [k, { name: k, proxy: k, xtb: { ticker: `${k}.X` } }])),
};

// Minimalny zapis pliku Excel 97–2003 (.xls: kontener CFB v3 + strumień BIFF8) do testów czytnika z src/xls.js.
// Teksty trafiają do tablicy SST podzielonej na rekordy CONTINUE co `chunk` bajtów (także w środku tekstu).
export function makeXls(rows, { chunk = 48, label = null } = {}) {
  const recs = [];
  const rec = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt16LE(type, 0);
    head.writeUInt16LE(data.length, 2);
    recs.push(head, data);
  };
  const u16 = (n) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(n);
    return b;
  };
  const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  const isWide = (s) => [...s].some((c) => c.charCodeAt(0) > 255);
  const chars = (s, wide) => (wide ? Buffer.from(s, 'utf16le') : Buffer.from(s, 'latin1'));
  const bof = (dt) => rec(0x0809, Buffer.concat([u16(0x0600), u16(dt), Buffer.alloc(12)]));

  bof(0x0005);
  rec(0x0085, Buffer.concat([u32(0), Buffer.from([0, 0, 6, 0]), Buffer.from('Arkusz', 'latin1')]));
  const strings = [...new Set(rows.flat().filter((v) => typeof v === 'string' && v !== label))];
  // SST: [total, unique] + teksty; podział na porcje jak w Excelu (nagłówek tekstu nigdy nie jest dzielony).
  const parts = [[u32(strings.length), u32(strings.length)]];
  let size = 8;
  const push = (buf) => {
    parts.at(-1).push(buf);
    size += buf.length;
  };
  for (const s of strings) {
    const wide = isWide(s);
    if (chunk - size < 4) {
      parts.push([]);
      size = 0;
    }
    push(Buffer.concat([u16(s.length), Buffer.from([wide ? 1 : 0])]));
    let rest = s;
    while (rest.length) {
      const room = Math.floor((chunk - size) / (wide ? 2 : 1));
      if (room <= 0) {
        parts.push([]);
        size = 0;
        push(Buffer.from([wide ? 1 : 0])); // bajt opcji na początku rekordu CONTINUE
        continue;
      }
      push(chars(rest.slice(0, room), wide));
      rest = rest.slice(room);
    }
  }
  parts.forEach((p, i) => rec(i === 0 ? 0x00fc : 0x003c, Buffer.concat(p)));
  rec(0x000a, Buffer.alloc(0));

  bof(0x0010);
  const cell = (r, c) => Buffer.concat([u16(r), u16(c), u16(15)]);
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      const v = row[c];
      if (v === null || v === undefined) {
        c++;
      } else if (typeof v === 'string' && v === label) {
        rec(0x0204, Buffer.concat([cell(r, c), u16(v.length), Buffer.from([isWide(v) ? 1 : 0]), chars(v, isWide(v))]));
        c++;
      } else if (typeof v === 'string') {
        rec(0x00fd, Buffer.concat([cell(r, c), u32(strings.indexOf(v))]));
        c++;
      } else if (Number.isInteger(v) && Number.isInteger(row[c + 1]) && Math.abs(v) < 2 ** 29) {
        // dwie liczby całkowite obok siebie → MULRK
        let end = c;
        while (Number.isInteger(row[end + 1]) && Math.abs(row[end + 1]) < 2 ** 29) end++;
        const body = [u16(r), u16(c)];
        for (let k = c; k <= end; k++) body.push(u16(15), u32(((row[k] << 2) | 2) >>> 0));
        body.push(u16(end));
        rec(0x00bd, Buffer.concat(body));
        c = end + 1;
      } else if (Number.isInteger(v) && Math.abs(v) < 2 ** 29) {
        rec(0x027e, Buffer.concat([cell(r, c), u32(((v << 2) | 2) >>> 0)]));
        c++;
      } else {
        const d = Buffer.alloc(8);
        d.writeDoubleLE(v);
        rec(0x0203, Buffer.concat([cell(r, c), d]));
        c++;
      }
    }
  });
  rec(0x000a, Buffer.alloc(0));
  let stream = Buffer.concat(recs);
  if (stream.length < 4096) stream = Buffer.concat([stream, Buffer.alloc(4096 - stream.length)]); // bez mini-strumienia

  const SECTOR = 512;
  const n = Math.ceil(stream.length / SECTOR);
  const body = Buffer.alloc((n + 2) * SECTOR);
  stream.copy(body, 0);
  const fat = body.subarray(n * SECTOR, (n + 1) * SECTOR);
  fat.fill(0xff);
  for (let i = 0; i < n; i++) fat.writeUInt32LE(i === n - 1 ? 0xfffffffe : i + 1, i * 4);
  fat.writeUInt32LE(0xfffffffd, n * 4); // sektor FAT
  fat.writeUInt32LE(0xfffffffe, (n + 1) * 4); // katalog
  const dir = body.subarray((n + 1) * SECTOR, (n + 2) * SECTOR);
  const entry = (i, name, type, start, len, child) => {
    const o = i * 128;
    dir.write(name, o, 'utf16le');
    dir.writeUInt16LE((name.length + 1) * 2, o + 0x40);
    dir[o + 0x42] = type;
    dir[o + 0x43] = 1;
    dir.writeUInt32LE(0xffffffff, o + 0x44);
    dir.writeUInt32LE(0xffffffff, o + 0x48);
    dir.writeUInt32LE(child, o + 0x4c);
    dir.writeUInt32LE(start, o + 0x74);
    dir.writeUInt32LE(len, o + 0x78);
  };
  entry(0, 'Root Entry', 5, 0xfffffffe, 0, 1);
  entry(1, 'Workbook', 2, 0, stream.length, 0xffffffff);
  const head = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(head, 0);
  head.writeUInt16LE(0x3e, 0x18);
  head.writeUInt16LE(3, 0x1a);
  head.writeUInt16LE(0xfffe, 0x1c);
  head.writeUInt16LE(9, 0x1e);
  head.writeUInt16LE(6, 0x20);
  head.writeUInt32LE(1, 0x2c);
  head.writeUInt32LE(n + 1, 0x30);
  head.writeUInt32LE(4096, 0x38);
  head.writeUInt32LE(0xfffffffe, 0x3c);
  head.writeUInt32LE(0xfffffffe, 0x44);
  for (let i = 0; i < 109; i++) head.writeUInt32LE(i === 0 ? n : 0xffffffff, 0x4c + i * 4);
  return Buffer.concat([head, body]);
}

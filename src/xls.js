// Minimalny czytnik plików Excel 97–2003 (.xls: kontener OLE2/CFB + strumień BIFF8), bez zależności.
// Wystarcza do arkuszy z archiwum notowań GPW: komórki tekstowe (SST/LABEL), liczbowe (NUMBER/RK/MULRK)
// i wyniki formuł. Zwraca tablicę arkuszy: [{ name, rows: [[wartość | null, ...], ...] }].

const ENDOFCHAIN = 0xfffffffe;

/** Odczytuje strumień o danej nazwie z kontenera CFB. */
function cfbStream(buf, wanted) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (buf.length < 512 || sig.some((b, i) => buf[i] !== b)) throw new Error('To nie jest plik XLS (OLE2)');
  const sectorSize = 1 << dv.getUint16(0x1e, true);
  const miniSize = 1 << dv.getUint16(0x20, true);
  const firstDir = dv.getUint32(0x30, true);
  const miniCutoff = dv.getUint32(0x38, true);
  const firstMiniFat = dv.getUint32(0x3c, true);
  const firstDifat = dv.getUint32(0x44, true);
  const numDifat = dv.getUint32(0x48, true);
  const sectorOffset = (s) => 512 + s * sectorSize;
  // DIFAT → lista sektorów FAT
  const fatSectors = [];
  for (let i = 0; i < 109; i++) {
    const s = dv.getUint32(0x4c + i * 4, true);
    if (s < ENDOFCHAIN) fatSectors.push(s);
  }
  let d = firstDifat;
  for (let n = 0; n < numDifat && d < ENDOFCHAIN; n++) {
    const off = sectorOffset(d);
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const s = dv.getUint32(off + i * 4, true);
      if (s < ENDOFCHAIN) fatSectors.push(s);
    }
    d = dv.getUint32(off + sectorSize - 4, true);
  }
  const fat = [];
  for (const s of fatSectors) {
    const off = sectorOffset(s);
    for (let i = 0; i < sectorSize / 4; i++) fat.push(dv.getUint32(off + i * 4, true));
  }
  const chain = (start, table) => {
    const out = [];
    const seen = new Set();
    for (let s = start; s < ENDOFCHAIN && !seen.has(s); s = table[s]) {
      seen.add(s);
      out.push(s);
    }
    return out;
  };
  const readChain = (start, size) => {
    const sectors = chain(start, fat);
    const out = new Uint8Array(sectors.length * sectorSize);
    sectors.forEach((s, i) => out.set(buf.subarray(sectorOffset(s), sectorOffset(s) + sectorSize), i * sectorSize));
    return size == null ? out : out.subarray(0, size);
  };
  // katalog
  const dir = readChain(firstDir);
  const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entries = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = ddv.getUint16(off + 0x40, true);
    let name = '';
    for (let i = 0; i < Math.max(0, nameLen / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(off + i * 2, true));
    entries.push({ name, type: dir[off + 0x42], start: ddv.getUint32(off + 0x74, true), size: ddv.getUint32(off + 0x78, true) });
  }
  const entry = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!entry) throw new Error('Brak arkusza w pliku XLS');
  if (entry.size >= miniCutoff) return readChain(entry.start, entry.size);
  // mały strumień: mini FAT + mini stream (dane w łańcuchu wpisu Root Entry)
  const root = entries.find((e) => e.type === 5);
  const miniStream = readChain(root.start);
  const miniFatRaw = readChain(firstMiniFat);
  const mdv = new DataView(miniFatRaw.buffer, miniFatRaw.byteOffset, miniFatRaw.byteLength);
  const miniFat = [];
  for (let i = 0; i < miniFatRaw.length / 4; i++) miniFat.push(mdv.getUint32(i * 4, true));
  const sectors = chain(entry.start, miniFat);
  const out = new Uint8Array(sectors.length * miniSize);
  sectors.forEach((s, i) => out.set(miniStream.subarray(s * miniSize, (s + 1) * miniSize), i * miniSize));
  return out.subarray(0, entry.size);
}

/** Wartość RK (skompresowana liczba w BIFF). */
function rkValue(rk) {
  let v;
  if (rk & 2) v = rk >> 2;
  else {
    const b = new DataView(new ArrayBuffer(8));
    b.setUint32(0, rk & 0xfffffffc, false);
    b.setUint32(4, 0, false);
    v = b.getFloat64(0, false);
  }
  return rk & 1 ? v / 100 : v;
}

/** Czyta tablicę współdzielonych tekstów (SST) rozbitą na rekordy CONTINUE. */
function readSst(chunks) {
  let ci = 0;
  let pos = 8; // pomiń total/unique
  const out = [];
  const total = new DataView(chunks[0].buffer, chunks[0].byteOffset, chunks[0].byteLength).getUint32(4, true);
  const ensure = () => {
    while (ci < chunks.length && pos >= chunks[ci].length) {
      ci++;
      pos = 0;
    }
    return ci < chunks.length;
  };
  const u8 = () => (ensure() ? chunks[ci][pos++] : 0);
  const u16 = () => u8() | (u8() << 8);
  const u32 = () => (u16() | (u16() << 16)) >>> 0;
  const skip = (n) => {
    while (n > 0 && ensure()) {
      const take = Math.min(n, chunks[ci].length - pos);
      pos += take;
      n -= take;
    }
  };
  for (let k = 0; k < total && ensure(); k++) {
    const cch = u16();
    const flags = u8();
    let high = flags & 1;
    const runs = flags & 8 ? u16() : 0;
    const ext = flags & 4 ? u32() : 0;
    let s = '';
    let left = cch;
    while (left > 0) {
      if (pos >= chunks[ci].length) {
        ci++;
        pos = 0;
        if (ci >= chunks.length) break;
        high = chunks[ci][pos++] & 1; // nowy bajt opcji po granicy CONTINUE
      }
      const avail = high ? Math.floor((chunks[ci].length - pos) / 2) : chunks[ci].length - pos;
      const take = Math.min(left, avail);
      for (let i = 0; i < take; i++) {
        s += String.fromCharCode(high ? chunks[ci][pos] | (chunks[ci][pos + 1] << 8) : chunks[ci][pos]);
        pos += high ? 2 : 1;
      }
      left -= take;
    }
    skip(runs * 4 + ext);
    out.push(s);
  }
  return out;
}

/** Czyta tekst w formacie BIFF8 (cch, flagi, znaki) z rekordu LABEL/BOUNDSHEET. */
function biffString(data, off, lenBytes = 2) {
  const cch = lenBytes === 2 ? data[off] | (data[off + 1] << 8) : data[off];
  const flags = data[off + lenBytes];
  const high = flags & 1;
  let s = '';
  let p = off + lenBytes + 1;
  for (let i = 0; i < cch; i++) {
    s += String.fromCharCode(high ? data[p] | (data[p + 1] << 8) : data[p]);
    p += high ? 2 : 1;
  }
  return s;
}

/**
 * Parsuje plik .xls do postaci tablic wierszy.
 * @param {Uint8Array|Buffer} input
 * @returns {{name: string, rows: (string|number|null)[][]}[]}
 */
export function readXls(input) {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  const wb = cfbStream(buf, ['Workbook', 'Book']);
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const sheets = [];
  const names = [];
  let sst = [];
  let current = null;
  let depth = 0;
  let pendingFormula = null;
  const put = (r, c, v) => {
    if (!current) return;
    (current.rows[r] ??= [])[c] = v;
  };
  let off = 0;
  while (off + 4 <= wb.length) {
    const type = dv.getUint16(off, true);
    const len = dv.getUint16(off + 2, true);
    const data = wb.subarray(off + 4, off + 4 + len);
    const rdv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    off += 4 + len;
    switch (type) {
      case 0x0809: { // BOF
        depth++;
        const kind = len >= 4 ? rdv.getUint16(2, true) : 0;
        if (kind === 0x0010) {
          current = { name: names[sheets.length] ?? `Arkusz${sheets.length + 1}`, rows: [] };
          sheets.push(current);
        }
        break;
      }
      case 0x000a: // EOF
        depth--;
        if (depth <= 0) current = null;
        break;
      case 0x0085: // BOUNDSHEET8
        names.push(biffString(data, 6, 1));
        break;
      case 0x00fc: { // SST + następujące CONTINUE
        const chunks = [data];
        let o = off;
        while (o + 4 <= wb.length && dv.getUint16(o, true) === 0x003c) {
          const l = dv.getUint16(o + 2, true);
          chunks.push(wb.subarray(o + 4, o + 4 + l));
          o += 4 + l;
        }
        off = o;
        sst = readSst(chunks);
        break;
      }
      case 0x00fd: // LABELSST
        put(rdv.getUint16(0, true), rdv.getUint16(2, true), sst[rdv.getUint32(6, true)] ?? '');
        break;
      case 0x0204: // LABEL
        put(rdv.getUint16(0, true), rdv.getUint16(2, true), biffString(data, 6, 2));
        break;
      case 0x0203: // NUMBER
        put(rdv.getUint16(0, true), rdv.getUint16(2, true), rdv.getFloat64(6, true));
        break;
      case 0x027e: // RK
        put(rdv.getUint16(0, true), rdv.getUint16(2, true), rkValue(rdv.getUint32(6, true)));
        break;
      case 0x00bd: { // MULRK
        const r = rdv.getUint16(0, true);
        const c0 = rdv.getUint16(2, true);
        const n = (len - 6) / 6;
        for (let i = 0; i < n; i++) put(r, c0 + i, rkValue(rdv.getUint32(4 + i * 6 + 2, true)));
        break;
      }
      case 0x0006: { // FORMULA: wynik liczbowy albo tekst w kolejnym rekordzie STRING
        const r = rdv.getUint16(0, true);
        const c = rdv.getUint16(2, true);
        if (rdv.getUint16(12, true) === 0xffff) {
          if (data[6] === 0) pendingFormula = [r, c];
          else put(r, c, data[6] === 1 ? Boolean(data[8]) : null);
        } else put(r, c, rdv.getFloat64(6, true));
        break;
      }
      case 0x0207: // STRING (wynik formuły tekstowej)
        if (pendingFormula) put(pendingFormula[0], pendingFormula[1], biffString(data, 0, 2));
        pendingFormula = null;
        break;
      default:
        break;
    }
  }
  for (const s of sheets) s.rows = Array.from(s.rows, (row) => Array.from(row ?? [], (v) => (v === undefined ? null : v)));
  return sheets;
}

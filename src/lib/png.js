// Minimalny koder PNG (RGBA) – ikona aplikacji na ekran główny telefonu bez zewnętrznych bibliotek.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (width * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Ikona: trzy rosnące słupki na granatowym tle.
export function appIcon(size) {
  const bg = [17, 32, 64, 255];
  const bars = [
    { x0: 0.2, x1: 0.33, top: 0.6, color: [94, 170, 255, 255] },
    { x0: 0.43, x1: 0.56, top: 0.43, color: [94, 170, 255, 255] },
    { x0: 0.66, x1: 0.79, top: 0.24, color: [74, 222, 158, 255] },
  ];
  return encodePng(size, size, (x, y) => {
    const u = x / size;
    const v = y / size;
    for (const b of bars) if (u >= b.x0 && u < b.x1 && v >= b.top && v < 0.8) return b.color;
    return bg;
  });
}

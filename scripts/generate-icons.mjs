// Generates the PNG app icons (no dependencies) from the rounded-hexagon mark, with 4x4 supersampling.
// Run: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hexPolygon, inside } from './hex.mjs';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const FOREST_TOP = hex('#4a8a77');
const FOREST_BOT = hex('#1f463c');
const DEEP_TOP = hex('#24524a');
const DEEP_BOT = hex('#12302a');
const HONEY_TOP = hex('#f7d675');
const HONEY_BOT = hex('#e0a02c');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Unit-square geometry (0..1). `scale` shrinks the mark toward the centre (safe zone for maskable icons).
function shapes(scale) {
  const C = 0.5;
  const medallion = hexPolygon(C, C, 0.46 * scale, 0.2);
  const ringOut = hexPolygon(C, C, 0.25 * scale, 0.2);
  const ringIn = hexPolygon(C, C, 0.165 * scale, 0.2);
  return { medallion, ringOut, ringIn, top: C - 0.46 * scale, height: 0.92 * scale };
}

/**
 * kind 'any'   : rounded-hexagon medallion on a transparent background
 * kind 'bleed' : full-bleed deep-green square with a medallion (maskable + iOS, which round the corners themselves)
 */
function make(size, kind) {
  const S = 4;
  const sh = shapes(kind === 'bleed' ? 0.66 : 1);
  return png(size, (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const px = (x + (sx + 0.5) / S) / size;
        const py = (y + (sy + 0.5) / S) / size;
        let col = null;
        if (kind === 'bleed') col = mix(DEEP_TOP, DEEP_BOT, py);
        if (inside(sh.medallion, px, py)) {
          const t = Math.min(1, Math.max(0, (py - sh.top) / sh.height));
          col = mix(FOREST_TOP, FOREST_BOT, t);
          if (inside(sh.ringOut, px, py) && !inside(sh.ringIn, px, py)) {
            const rt = (py - (0.5 - 0.25 * (kind === 'bleed' ? 0.66 : 1))) / (0.5 * (kind === 'bleed' ? 0.66 : 1));
            col = mix(HONEY_TOP, HONEY_BOT, Math.min(1, Math.max(0, rt)));
          }
        }
        if (col) {
          r += col[0];
          g += col[1];
          b += col[2];
          a += 1;
        }
      }
    }
    const n = S * S;
    if (a === 0) return [0, 0, 0, 0];
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / n) * 255)];
  });
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', make(192, 'any'));
writeFileSync('public/icons/icon-512.png', make(512, 'any'));
writeFileSync('public/icons/maskable-512.png', make(512, 'bleed'));
writeFileSync('public/icons/apple-touch-icon.png', make(180, 'bleed'));
console.log('Icons written to public/icons');

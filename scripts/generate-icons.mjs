// Generates PNG icons (no dependencies) by rasterising the Hexagon mark with 4x4 supersampling.
// Run: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [244, 239, 228]; // paper
const FOREST = [47, 93, 80];
const HONEY = [233, 180, 76];

function crc32(buf) {
  let c, crc = 0xffffffff;
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
      const [r, g, b] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Pointy-top regular hexagon: inside test using the apothem form.
function inHex(px, py, cx, cy, R) {
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  const apothem = R * Math.sqrt(3) / 2;
  return dx <= apothem && dx * 0.5 + dy * (Math.sqrt(3) / 2) <= apothem;
}
function inRing(px, py, cx, cy, R, thick) {
  return inHex(px, py, cx, cy, R) && !inHex(px, py, cx, cy, R - thick);
}

// full: hexagon on paper background (any); maskable: full-bleed forest with smaller mark in the safe zone
function make(size, { maskable, flat }) {
  const S = 4;
  return png(size, (x, y) => {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const px = (x + (sx + 0.5) / S) / size, py = (y + (sy + 0.5) / S) / size;
      let col;
      if (maskable) {
        col = FOREST;
        if (inRing(px, py, 0.5, 0.5, 0.27, 0.075)) col = HONEY;
      } else if (flat) {
        col = BG;
        if (inHex(px, py, 0.5, 0.5, 0.44)) col = FOREST;
        if (inRing(px, py, 0.5, 0.5, 0.25, 0.07)) col = HONEY;
      } else {
        col = BG;
        if (inHex(px, py, 0.5, 0.5, 0.44)) col = FOREST;
        if (inRing(px, py, 0.5, 0.5, 0.25, 0.07)) col = HONEY;
      }
      r += col[0]; g += col[1]; b += col[2];
    }
    const n = S * S;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', make(192, {}));
writeFileSync('public/icons/icon-512.png', make(512, {}));
writeFileSync('public/icons/maskable-512.png', make(512, { maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', make(180, { flat: true }));
console.log('Icons written to public/icons');

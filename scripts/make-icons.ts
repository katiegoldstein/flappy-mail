// Builds the favicon and touch icon from the flying-pigeon sprite (the logo).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { PIGEON_FLY_UP, PIGEON, spriteSvg, gridSize } from '../src/sprites.ts';

const out = new URL('../public/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(new URL('favicon.svg', out), spriteSvg(PIGEON_FLY_UP, PIGEON));

function png(size: number, scale: number, bg: string | null) {
  const { w, h } = gridSize(PIGEON_FLY_UP);
  const ox = Math.floor((size - w * scale) / 2), oy = Math.floor((size - h * scale) / 2);
  const px = Buffer.alloc(size * size * 4);
  const put = (x: number, y: number, hex: string) => { const i = (y * size + x) * 4; px[i] = parseInt(hex.slice(1, 3), 16); px[i + 1] = parseInt(hex.slice(3, 5), 16); px[i + 2] = parseInt(hex.slice(5, 7), 16); px[i + 3] = 255; };
  if (bg) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, bg);
  PIGEON_FLY_UP.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = PIGEON[row[x]]; if (!c) continue; for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(ox + x * scale + dx, oy + y * scale + dy, c); } });
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(new URL('favicon-48.png', out), png(48, 2, null));
fs.writeFileSync(new URL('apple-touch-icon.png', out), png(180, 9, '#5C94FC'));
console.log('icons written');

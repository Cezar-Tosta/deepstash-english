// Gera os ícones PNG do PWA sem dependências: quatro barras (5 · 1 · 3 · 1) sobre fundo sólido.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x2f, 0x5f, 0x6b];
const FG = [0xf6, 0xf4, 0xef];
const BARS = [5, 1, 3, 1];

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  // Tudo dentro de 60% do centro, para sobreviver ao recorte de ícone "maskable".
  const area = size * 0.5;
  const left = (size - area) / 2;
  const bottom = size / 2 + area / 2;
  const slot = area / BARS.length;
  const barWidth = slot * 0.56;

  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 3 + 1);
    for (let x = 0; x < size; x += 1) {
      const i = Math.floor((x - left) / slot);
      const height = i >= 0 && i < BARS.length ? (BARS[i] / 5) * area : 0;
      const inBar =
        height > 0 && x - left - i * slot >= (slot - barWidth) / 2 && x - left - i * slot < (slot + barWidth) / 2;
      const color = inBar && y < bottom && y >= bottom - height ? FG : BG;
      raw.set(color, row + 1 + x * 3);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size));
  console.log(`public/${name}`);
}

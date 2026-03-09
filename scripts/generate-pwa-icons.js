/**
 * P.A.T.H PWA Icon Generator (pure Node.js, no external deps)
 * Generates PNG icons using only built-in zlib + crypto modules
 * Run: node scripts/generate-pwa-icons.js
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUTPUT_DIR = path.join(__dirname, '..', 'P.A.T.H', 'icons');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── PNG helpers ──────────────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function makePNG(pixels, size) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor RGB
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  // Raw image data (filter byte 0 = None per row)
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      row[1 + x * 3] = pixels[i];
      row[1 + x * 3 + 1] = pixels[i + 1];
      row[1 + x * 3 + 2] = pixels[i + 2];
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
function setPixel(pixels, size, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 3;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
}

// Anti-aliased circle draw
function drawCircle(pixels, size, cx, cy, radius, r, g, b) {
  for (let y = Math.floor(cy - radius) - 1; y <= Math.ceil(cy + radius) + 1; y++) {
    for (let x = Math.floor(cx - radius) - 1; x <= Math.ceil(cx + radius) + 1; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= radius - 0.5) {
        setPixel(pixels, size, x, y, r, g, b);
      } else if (dist < radius + 0.5) {
        const alpha = (radius + 0.5 - dist);
        const bi = (y * size + x) * 3;
        if (x >= 0 && y >= 0 && x < size && y < size) {
          pixels[bi]   = Math.round(pixels[bi]   * (1 - alpha) + r * alpha);
          pixels[bi+1] = Math.round(pixels[bi+1] * (1 - alpha) + g * alpha);
          pixels[bi+2] = Math.round(pixels[bi+2] * (1 - alpha) + b * alpha);
        }
      }
    }
  }
}

// Draw a horizontal line
function hLine(pixels, size, x1, x2, y, r, g, b, thickness = 1) {
  for (let t = 0; t < thickness; t++) {
    for (let x = x1; x <= x2; x++) setPixel(pixels, size, x, y + t, r, g, b);
  }
}

// Draw rectangle outline
function rectOutline(pixels, size, x, y, w, h, r, g, b, thickness = 1) {
  for (let t = 0; t < thickness; t++) {
    hLine(pixels, size, x+t, x+w-t, y+t, r, g, b);        // top
    hLine(pixels, size, x+t, x+w-t, y+h-t, r, g, b);      // bottom
    for (let row = y+t; row <= y+h-t; row++) {
      setPixel(pixels, size, x+t, row, r, g, b);
      setPixel(pixels, size, x+w-t, row, r, g, b);
    }
  }
}

// ── Icon drawing function ────────────────────────────────────────────────────
function drawPathIcon(size) {
  const pixels = new Uint8Array(size * size * 3); // black background

  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);

  // Gold color
  const [gr, gg, gb] = [212, 175, 55];
  // Accent red
  const [ar, ag, ab] = [255, 59, 48];

  // ── Gold square frame ──────────────────────────────────────────────────
  const pad = Math.floor(size * 0.07);
  const thickness = Math.max(1, Math.floor(size * 0.012));
  rectOutline(pixels, size, pad, pad, size - pad * 2, size - pad * 2, gr, gg, gb, thickness);

  // ── Inner corner accents (like Japanese design marks) ──────────────────
  const cornerLen = Math.floor(size * 0.12);
  const innerPad = pad + Math.floor(size * 0.07);
  // top-left
  hLine(pixels, size, innerPad, innerPad + cornerLen, innerPad, gr, gg, gb, Math.max(1, Math.floor(size * 0.008)));
  for (let i = 0; i < cornerLen; i++) setPixel(pixels, size, innerPad, innerPad + i, gr, gg, gb);
  // top-right
  hLine(pixels, size, size - innerPad - cornerLen, size - innerPad, innerPad, gr, gg, gb, Math.max(1, Math.floor(size * 0.008)));
  for (let i = 0; i < cornerLen; i++) setPixel(pixels, size, size - innerPad, innerPad + i, gr, gg, gb);
  // bottom-left
  hLine(pixels, size, innerPad, innerPad + cornerLen, size - innerPad, gr, gg, gb, Math.max(1, Math.floor(size * 0.008)));
  for (let i = 0; i < cornerLen; i++) setPixel(pixels, size, innerPad, size - innerPad - i, gr, gg, gb);
  // bottom-right
  hLine(pixels, size, size - innerPad - cornerLen, size - innerPad, size - innerPad, gr, gg, gb, Math.max(1, Math.floor(size * 0.008)));
  for (let i = 0; i < cornerLen; i++) setPixel(pixels, size, size - innerPad, size - innerPad - i, gr, gg, gb);

  // ── Draw "PATH" letter by letter using pixel font ──────────────────────
  // Use a simple 5x7 pixel font approach scaled to icon size
  const letterHeight = Math.floor(size * 0.28);
  const letterWidth = Math.floor(letterHeight * 0.6);
  const spacing = Math.floor(letterWidth * 0.25);
  const totalWidth = letterWidth * 4 + spacing * 3;
  const startX = cx - Math.floor(totalWidth / 2);
  const startY = cy - Math.floor(letterHeight / 2) - Math.floor(size * 0.04);

  function drawBar(x, y, w, h) {
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) {
        setPixel(pixels, size, col, row, gr, gg, gb);
      }
    }
  }

  const sw = Math.max(1, Math.floor(letterWidth * 0.18)); // stroke width

  // P
  const px = startX;
  drawBar(px, startY, sw, letterHeight);                              // left vertical
  drawBar(px, startY, letterWidth * 0.7, sw);                        // top horizontal
  drawBar(px, startY + Math.floor(letterHeight * 0.45), letterWidth * 0.7, sw); // mid horizontal
  drawBar(px + Math.floor(letterWidth * 0.7) - sw, startY, sw, Math.floor(letterHeight * 0.45) + sw); // right top curve

  // A
  const ax = startX + letterWidth + spacing;
  drawBar(ax, startY, sw, letterHeight);                              // left vertical
  drawBar(ax + letterWidth - sw, startY, sw, letterHeight);           // right vertical
  drawBar(ax, startY, letterWidth, sw);                               // top horizontal
  drawBar(ax, startY + Math.floor(letterHeight * 0.48), letterWidth, sw); // mid horizontal

  // T
  const tx = startX + (letterWidth + spacing) * 2;
  drawBar(tx, startY, letterWidth, sw);                               // top horizontal
  drawBar(tx + Math.floor((letterWidth - sw) / 2), startY, sw, letterHeight); // center vertical

  // H
  const hx = startX + (letterWidth + spacing) * 3;
  drawBar(hx, startY, sw, letterHeight);                              // left vertical
  drawBar(hx + letterWidth - sw, startY, sw, letterHeight);           // right vertical
  drawBar(hx, startY + Math.floor(letterHeight * 0.45), letterWidth, sw); // mid horizontal

  // ── Decorative line below text ─────────────────────────────────────────
  const lineY = startY + letterHeight + Math.floor(size * 0.06);
  const lineLen = Math.floor(size * 0.42);
  const lineThick = Math.max(1, Math.floor(size * 0.007));
  hLine(pixels, size, cx - Math.floor(lineLen/2), cx + Math.floor(lineLen/2), lineY, gr, gg, gb, lineThick);

  // ── Red accent dot ─────────────────────────────────────────────────────
  const dotY = lineY + Math.floor(size * 0.07);
  const dotR = Math.max(1, Math.floor(size * 0.022));
  drawCircle(pixels, size, cx, dotY, dotR, ar, ag, ab);

  return pixels;
}

// ── Generate all sizes ───────────────────────────────────────────────────────
SIZES.forEach((size) => {
  const pixels = drawPathIcon(size);
  const png = makePNG(pixels, size);
  const outPath = path.join(OUTPUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  process.stdout.write(`✓ icon-${size}.png (${(png.length / 1024).toFixed(1)}KB)\n`);
});

process.stdout.write('\nDone! Icons saved to P.A.T.H/icons/\n');

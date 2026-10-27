// Lector de PNG sin librerías (no entrelazado): escala de grises, RGB, paleta, con o sin transparencia, 1 a 16 bits.
// Lo transparente queda sobre fondo blanco. decode(buf) → { width, height, rgb: Buffer (RGB de 8 bits) }
const zlib = require("zlib");
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decode(buf) {
  if (!buf || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("No es un PNG.");
  let p = 8, ihdr = null, plte = null, trns = null;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (!ihdr) throw new Error("PNG sin encabezado.");
  if (ihdr.interlace) throw new Error("PNG entrelazado no soportado.");
  const { w, h, depth, color } = ihdr;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!ch) throw new Error("Tipo de PNG desconocido.");
  const bpp = Math.max(1, Math.ceil(ch * depth / 8)), stride = Math.ceil(w * ch * depth / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat)), img = Buffer.alloc(stride * h);
  // Filtros por fila
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[dst + x - bpp] : 0, b = y ? img[dst - stride + x] : 0, c = x >= bpp && y ? img[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      img[dst + x] = v & 255;
    }
  }
  // Muestra n de la fila y, escalada a 8 bits
  const max = (1 << Math.min(depth, 8)) - 1;
  const sampleAt = (y, n) => {
    if (depth === 8) return img[y * stride + n];
    if (depth === 16) return img[y * stride + n * 2];
    const bitPos = n * depth, byte = img[y * stride + (bitPos >> 3)], shift = 8 - depth - (bitPos & 7);
    return (byte >> shift) & max;
  };
  const rgb = Buffer.alloc(w * h * 3);
  const put = (i, r, g, b, a) => { rgb[i] = r * a + 255 * (1 - a); rgb[i + 1] = g * a + 255 * (1 - a); rgb[i + 2] = b * a + 255 * (1 - a); };
  const scale = v => (depth < 8 ? Math.round(v * 255 / max) : v);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, n = x * ch;
    if (color === 3) {
      const k = sampleAt(y, x), a = trns && k < trns.length ? trns[k] / 255 : 1;
      if (!plte || k * 3 + 2 >= plte.length) throw new Error("PNG con paleta incompleta.");
      put(i, plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], a);
    } else if (color === 0 || color === 4) {
      const g = scale(sampleAt(y, n)), a = color === 4 ? sampleAt(y, n + 1) / 255 : 1;
      put(i, g, g, g, a);
    } else {
      const a = color === 6 ? sampleAt(y, n + 3) / 255 : 1;
      put(i, sampleAt(y, n), sampleAt(y, n + 1), sampleAt(y, n + 2), a);
    }
  }
  return { width: w, height: h, rgb };
}

module.exports = { decode };

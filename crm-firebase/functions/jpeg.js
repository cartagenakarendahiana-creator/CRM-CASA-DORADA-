// Lector de JPEG "baseline" (el formato normal de las fotos de Shopify con format=jpg), sin librerías.
// decode(buf) → { width, height, rgb: Buffer (RGB de 8 bits) }; lanza un error con JPEG progresivos u otros formatos.
const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
// cos[(2x+1)uπ/16] · c(u) / 2, para la IDCT separable
const COS = (() => { const t = new Float64Array(64); for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) t[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos((2 * x + 1) * u * Math.PI / 16) / 2; return t; })();

function huffTable(counts, symbols) {
  // Tabla canónica: por longitud, el código máximo y dónde empiezan sus símbolos
  const maxcode = new Int32Array(18).fill(-1), valptr = new Int32Array(17), mincode = new Int32Array(17);
  let code = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    valptr[l] = k; mincode[l] = code;
    code += counts[l - 1]; k += counts[l - 1];
    maxcode[l] = counts[l - 1] ? code - 1 : -1;
    code <<= 1;
  }
  maxcode[17] = 0x7fffffff;
  return { maxcode, valptr, mincode, symbols };
}

function decode(buf) {
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("No es un JPEG.");
  const qt = [], dc = [], ac = [];
  let frame = null, ri = 0, pos = 2;
  const u16 = p => (buf[p] << 8) | buf[p + 1];
  while (pos < buf.length) {
    if (buf[pos] !== 0xff) { pos++; continue; }
    const m = buf[pos + 1];
    if (m === 0xd8 || m === 0x01 || m === 0xff || (m >= 0xd0 && m <= 0xd7)) { pos += m === 0xff ? 1 : 2; continue; }
    if (m === 0xd9) break;
    const len = u16(pos + 2), seg = pos + 4, end = pos + 2 + len;
    if (m === 0xdb) { // DQT
      for (let p = seg; p < end;) {
        const pq = buf[p] >> 4, tq = buf[p] & 15; p++;
        const t = new Int32Array(64);
        for (let i = 0; i < 64; i++) { t[i] = pq ? u16(p) : buf[p]; p += pq ? 2 : 1; }
        qt[tq] = t;
      }
    } else if (m === 0xc4) { // DHT
      for (let p = seg; p < end;) {
        const tc = buf[p] >> 4, th = buf[p] & 15; p++;
        const counts = buf.subarray(p, p + 16); p += 16;
        const n = counts.reduce((a, b) => a + b, 0), symbols = buf.subarray(p, p + n); p += n;
        (tc ? ac : dc)[th] = huffTable(Array.from(counts), symbols);
      }
    } else if (m === 0xc0 || m === 0xc1) { // SOF baseline / extendido secuencial
      if (buf[seg] !== 8) throw new Error("JPEG de 12 bits no soportado.");
      const height = u16(seg + 1), width = u16(seg + 3), n = buf[seg + 5], comps = [];
      for (let i = 0; i < n; i++) { const p = seg + 6 + i * 3; comps.push({ id: buf[p], h: buf[p + 1] >> 4, v: buf[p + 1] & 15, tq: buf[p + 2] }); }
      const hmax = Math.max(...comps.map(c => c.h)), vmax = Math.max(...comps.map(c => c.v));
      const mcusX = Math.ceil(width / (8 * hmax)), mcusY = Math.ceil(height / (8 * vmax));
      for (const c of comps) {
        c.bpl = mcusX * c.h; c.bpc = mcusY * c.v;
        c.pw = c.bpl * 8; c.ph = c.bpc * 8; c.data = new Uint8Array(c.pw * c.ph);
        c.cw = Math.ceil(width * c.h / hmax); c.ch = Math.ceil(height * c.v / vmax);
      }
      frame = { width, height, comps, hmax, vmax, mcusX, mcusY };
    } else if (m >= 0xc2 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      throw new Error("JPEG progresivo o no soportado.");
    } else if (m === 0xdd) { ri = u16(seg); }
    else if (m === 0xda) { // SOS + datos
      if (!frame) throw new Error("JPEG sin encabezado.");
      const ns = buf[seg], sc = [];
      for (let i = 0; i < ns; i++) {
        const id = buf[seg + 1 + i * 2], t = buf[seg + 2 + i * 2], c = frame.comps.find(x => x.id === id);
        c.dcT = dc[t >> 4]; c.acT = ac[t & 15]; c.q = qt[c.tq]; sc.push(c);
      }
      pos = scan(buf, end, frame, sc, ri);
      continue;
    }
    pos = end;
  }
  if (!frame) throw new Error("JPEG sin imagen.");
  return toRgb(frame);
}

// Datos de una pasada: devuelve la posición donde termina
function scan(buf, start, f, sc, ri) {
  let p = start, bits = 0, nb = 0, eof = false;
  const byte = () => {
    if (p >= buf.length) { eof = true; return 0; }
    const b = buf[p];
    if (b === 0xff) {
      const n = buf[p + 1];
      if (n === 0) { p += 2; return 0xff; }
      eof = true; return 0; // marcador: se acabaron los datos
    }
    p++; return b;
  };
  const bit = () => { if (!nb) { bits = byte(); nb = 8; } nb--; return (bits >> nb) & 1; };
  const receive = n => { let v = 0; while (n--) v = (v << 1) | bit(); return v; };
  const extend = (v, t) => (v < 1 << (t - 1) ? v - (1 << t) + 1 : v);
  const huff = t => {
    let code = bit(), l = 1;
    while (code > t.maxcode[l]) { code = (code << 1) | bit(); if (++l > 16) return 0; }
    return t.symbols[t.valptr[l] + code - t.mincode[l]];
  };
  const blk = new Float64Array(64), tmp = new Float64Array(64);
  const block = (c, br, bc) => {
    blk.fill(0);
    const t = huff(c.dcT), diff = t ? extend(receive(t), t) : 0;
    c.pred += diff; blk[0] = c.pred * c.q[0];
    for (let k = 1; k < 64;) {
      const rs = huff(c.acT), s = rs & 15, r = rs >> 4;
      if (!s) { if (r === 15) { k += 16; continue; } break; }
      k += r; if (k > 63) break;
      blk[ZZ[k]] = extend(receive(s), s) * c.q[k]; k++;
    }
    // IDCT 2D separable
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * blk[y * 8 + u]; tmp[y * 8 + x] = s; }
    const base = (br * 8) * c.pw + bc * 8;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      let s = 0; for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * tmp[v * 8 + x];
      const val = Math.round(s + 128);
      c.data[base + y * c.pw + x] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  };
  const reset = () => { for (const c of sc) c.pred = 0; nb = 0; eof = false; };
  reset();
  const single = sc.length === 1;
  const total = single ? Math.ceil(sc[0].cw / 8) * Math.ceil(sc[0].ch / 8) : f.mcusX * f.mcusY;
  const perLine = single ? Math.ceil(sc[0].cw / 8) : f.mcusX;
  for (let n = 0; n < total; n++) {
    if (ri && n && n % ri === 0) {
      // Reinicio: buscar el marcador RSTn y empezar de nuevo los predictores
      while (p < buf.length && !(buf[p] === 0xff && buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7)) p++;
      p += 2; reset();
    }
    const mr = Math.floor(n / perLine), mc = n % perLine;
    if (single) block(sc[0], mr, mc);
    else for (const c of sc) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) block(c, mr * c.v + v, mc * c.h + h);
  }
  // Fin de la pasada: avanzar hasta el próximo marcador
  while (p < buf.length - 1 && !(buf[p] === 0xff && buf[p + 1] !== 0 && !(buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7))) p++;
  return p;
}

function toRgb(f) {
  const { width: w, height: h, comps } = f, rgb = Buffer.alloc(w * h * 3);
  const sample = (c, x, y) => c.data[Math.min(c.ph - 1, Math.floor(y * c.v / f.vmax)) * c.pw + Math.min(c.pw - 1, Math.floor(x * c.h / f.hmax))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    if (comps.length === 1) { const g = sample(comps[0], x, y); rgb[i] = rgb[i + 1] = rgb[i + 2] = g; continue; }
    const Y = sample(comps[0], x, y), cb = sample(comps[1], x, y) - 128, cr = sample(comps[2], x, y) - 128;
    const r = Y + 1.402 * cr, g = Y - 0.344136 * cb - 0.714136 * cr, b = Y + 1.772 * cb;
    rgb[i] = r < 0 ? 0 : r > 255 ? 255 : r; rgb[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; rgb[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  return { width: w, height: h, rgb };
}

module.exports = { decode };

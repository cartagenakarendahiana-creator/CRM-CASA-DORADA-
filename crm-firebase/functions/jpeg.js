// Lector de JPEG sin librerías: baseline y progresivo (los dos que usa Shopify), 8 bits, escala de grises o color.
// decode(buf) → { width, height, rgb: Buffer (RGB de 8 bits) }
// Los coeficientes de todas las pasadas se acumulan por bloque y al final se aplica la IDCT (como en un JPEG progresivo).
const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const COS = (() => { const t = new Float64Array(64); for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) t[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos((2 * x + 1) * u * Math.PI / 16) / 2; return t; })();

function huffTable(counts, symbols) {
  const maxcode = new Int32Array(18).fill(-1), valptr = new Int32Array(17), mincode = new Int32Array(17);
  let code = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    valptr[l] = k; mincode[l] = code;
    code += counts[l - 1]; k += counts[l - 1];
    maxcode[l] = counts[l - 1] ? code - 1 : -1;
    code <<= 1;
  }
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
    if (m === 0xdb) { // DQT (se guarda en orden natural)
      for (let p = seg; p < end;) {
        const pq = buf[p] >> 4, tq = buf[p] & 15; p++;
        const t = new Int32Array(64);
        for (let i = 0; i < 64; i++) { t[ZZ[i]] = pq ? u16(p) : buf[p]; p += pq ? 2 : 1; }
        qt[tq] = t;
      }
    } else if (m === 0xc4) { // DHT
      for (let p = seg; p < end;) {
        const tc = buf[p] >> 4, th = buf[p] & 15; p++;
        const counts = Array.from(buf.subarray(p, p + 16)); p += 16;
        const n = counts.reduce((a, b) => a + b, 0), symbols = buf.subarray(p, p + n); p += n;
        (tc ? ac : dc)[th] = huffTable(counts, symbols);
      }
    } else if (m === 0xc0 || m === 0xc1 || m === 0xc2) { // SOF baseline, secuencial extendido o progresivo
      if (buf[seg] !== 8) throw new Error("JPEG de 12 bits no soportado.");
      const height = u16(seg + 1), width = u16(seg + 3), n = buf[seg + 5], comps = [];
      if (!width || !height) throw new Error("JPEG sin tamaño.");
      for (let i = 0; i < n; i++) { const p = seg + 6 + i * 3; comps.push({ id: buf[p], h: buf[p + 1] >> 4, v: buf[p + 1] & 15, tq: buf[p + 2] }); }
      const hmax = Math.max(...comps.map(c => c.h)), vmax = Math.max(...comps.map(c => c.v));
      const mcusX = Math.ceil(width / (8 * hmax)), mcusY = Math.ceil(height / (8 * vmax));
      for (const c of comps) {
        c.bpl = mcusX * c.h; c.bpc = mcusY * c.v;
        c.coef = new Int32Array(c.bpl * c.bpc * 64);
        c.cw = Math.ceil(width * c.h / hmax); c.ch = Math.ceil(height * c.v / vmax);
      }
      frame = { width, height, comps, hmax, vmax, mcusX, mcusY, progressive: m === 0xc2 };
    } else if (m >= 0xc3 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      throw new Error("Tipo de JPEG no soportado (aritmético o sin pérdida).");
    } else if (m === 0xdd) { ri = u16(seg); }
    else if (m === 0xda) { // SOS
      if (!frame) throw new Error("JPEG sin encabezado.");
      const ns = buf[seg], sc = [];
      for (let i = 0; i < ns; i++) {
        const id = buf[seg + 1 + i * 2], t = buf[seg + 2 + i * 2], c = frame.comps.find(x => x.id === id);
        if (!c) throw new Error("JPEG con componente desconocido.");
        c.dcT = dc[t >> 4]; c.acT = ac[t & 15]; sc.push(c);
      }
      const p = seg + 1 + ns * 2, Ss = buf[p], Se = buf[p + 1], Ah = buf[p + 2] >> 4, Al = buf[p + 2] & 15;
      pos = scan(buf, end, frame, sc, ri, Ss, Se, Ah, Al);
      continue;
    }
    pos = end;
  }
  if (!frame) throw new Error("JPEG sin imagen.");
  for (const c of frame.comps) { c.q = qt[c.tq]; if (!c.q) throw new Error("JPEG sin tabla de cuantización."); }
  return toRgb(frame);
}

// Una pasada (scan). Devuelve la posición del siguiente marcador.
function scan(buf, start, f, sc, ri, Ss, Se, Ah, Al) {
  let p = start, bits = 0, nb = 0;
  const byte = () => {
    if (p >= buf.length) return 0;
    const b = buf[p];
    if (b === 0xff) { if (buf[p + 1] === 0) { p += 2; return 0xff; } return 0; } // marcador: no se consume
    p++; return b;
  };
  const bit = () => { if (!nb) { bits = byte(); nb = 8; } nb--; return (bits >> nb) & 1; };
  const receive = n => { let v = 0; while (n-- > 0) v = (v << 1) | bit(); return v; };
  const extend = (v, t) => (t && v < 1 << (t - 1) ? v - (1 << t) + 1 : v);
  const huff = t => {
    if (!t) throw new Error("JPEG sin tabla Huffman.");
    let code = bit(), l = 1;
    while (code > t.maxcode[l]) { code = (code << 1) | bit(); if (++l > 16) return 0; }
    return t.symbols[t.valptr[l] + code - t.mincode[l]];
  };
  let eobrun = 0, acState = 0, acNext = 0;
  const baseline = (c, o) => {
    const t = huff(c.dcT), diff = t ? extend(receive(t), t) : 0;
    c.pred += diff; c.coef[o] = c.pred;
    for (let k = 1; k < 64;) {
      const rs = huff(c.acT), s = rs & 15, r = rs >> 4;
      if (!s) { if (r === 15) { k += 16; continue; } break; }
      k += r; if (k > 63) break;
      c.coef[o + ZZ[k]] = extend(receive(s), s); k++;
    }
  };
  const dcFirst = (c, o) => { const t = huff(c.dcT), diff = t ? extend(receive(t), t) : 0; c.pred += diff; c.coef[o] = c.pred * (1 << Al); };
  const dcNext = (c, o) => { if (bit()) c.coef[o] |= 1 << Al; };
  const acFirst = (c, o) => {
    if (eobrun > 0) { eobrun--; return; }
    for (let k = Ss; k <= Se;) {
      const rs = huff(c.acT), s = rs & 15, r = rs >> 4;
      if (!s) { if (r < 15) { eobrun = receive(r) + (1 << r) - 1; break; } k += 16; continue; }
      k += r; if (k > 63) break;
      c.coef[o + ZZ[k]] = extend(receive(s), s) * (1 << Al); k++;
    }
  };
  const acNextPass = (c, o) => {
    let r = 0;
    for (let k = Ss; k <= Se; k++) {
      const z = o + ZZ[k], sign = c.coef[z] < 0 ? -1 : 1;
      switch (acState) {
        case 0: {
          const rs = huff(c.acT), s = rs & 15; r = rs >> 4;
          if (!s) { if (r < 15) { eobrun = receive(r) + (1 << r); acState = 4; } else { r = 16; acState = 1; } }
          else { acNext = extend(receive(s), s); acState = r ? 2 : 3; }
          k--; continue; // el mismo coeficiente se procesa en el nuevo estado
        }
        case 1: case 2:
          if (c.coef[z]) c.coef[z] += sign * (bit() << Al);
          else { r--; if (!r) acState = acState === 2 ? 3 : 0; }
          break;
        case 3:
          if (c.coef[z]) c.coef[z] += sign * (bit() << Al);
          else { c.coef[z] = acNext * (1 << Al); acState = 0; }
          break;
        case 4:
          if (c.coef[z]) c.coef[z] += sign * (bit() << Al);
          break;
      }
    }
    if (acState === 4) { eobrun--; if (!eobrun) acState = 0; }
  };
  const fn = !f.progressive ? baseline : Ss === 0 ? (Ah === 0 ? dcFirst : dcNext) : (Ah === 0 ? acFirst : acNextPass);
  const reset = () => { for (const c of sc) c.pred = 0; nb = 0; eobrun = 0; acState = 0; };
  reset();
  const single = sc.length === 1;
  const perLine = single ? Math.ceil(sc[0].cw / 8) : f.mcusX;
  const total = single ? perLine * Math.ceil(sc[0].ch / 8) : f.mcusX * f.mcusY;
  for (let n = 0; n < total; n++) {
    if (ri && n && n % ri === 0) {
      while (p < buf.length - 1 && !(buf[p] === 0xff && buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7)) p++;
      p += 2; reset();
    }
    const mr = Math.floor(n / perLine), mc = n % perLine;
    if (single) { const c = sc[0]; fn(c, (mr * c.bpl + mc) * 64); }
    else for (const c of sc) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) fn(c, ((mr * c.v + v) * c.bpl + mc * c.h + h) * 64);
  }
  while (p < buf.length - 1 && !(buf[p] === 0xff && buf[p + 1] !== 0 && !(buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7))) p++;
  return p;
}

// IDCT de todos los bloques y conversión YCbCr → RGB
function toRgb(f) {
  const blk = new Float64Array(64), tmp = new Float64Array(64);
  for (const c of f.comps) {
    c.pw = c.bpl * 8; c.ph = c.bpc * 8; c.data = new Uint8Array(c.pw * c.ph);
    for (let br = 0; br < c.bpc; br++) for (let bc = 0; bc < c.bpl; bc++) {
      const o = (br * c.bpl + bc) * 64;
      for (let i = 0; i < 64; i++) blk[i] = c.coef[o + i] * c.q[i];
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * blk[y * 8 + u]; tmp[y * 8 + x] = s; }
      const base = br * 8 * c.pw + bc * 8;
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
        let s = 0; for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * tmp[v * 8 + x];
        const val = Math.round(s + 128);
        c.data[base + y * c.pw + x] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
    }
  }
  const { width: w, height: h, comps } = f, rgb = Buffer.alloc(w * h * 3);
  const sample = (c, x, y) => c.data[Math.min(c.ph - 1, Math.floor(y * c.v / f.vmax)) * c.pw + Math.min(c.pw - 1, Math.floor(x * c.h / f.hmax))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    if (comps.length === 1) { const g = sample(comps[0], x, y); rgb[i] = rgb[i + 1] = rgb[i + 2] = g; continue; }
    if (comps.length !== 3) throw new Error("JPEG CMYK no soportado.");
    const Y = sample(comps[0], x, y), cb = sample(comps[1], x, y) - 128, cr = sample(comps[2], x, y) - 128;
    const r = Y + 1.402 * cr, g = Y - 0.344136 * cb - 0.714136 * cr, b = Y + 1.772 * cb;
    rgb[i] = r < 0 ? 0 : r > 255 ? 255 : r; rgb[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; rgb[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  return { width: w, height: h, rgb };
}

module.exports = { decode };

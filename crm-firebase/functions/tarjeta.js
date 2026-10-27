// Tarjeta de descuento en PNG (1080×1350) para mandarle al cliente cuando pregunta por un producto con descuento:
// logo de Casa Dorada, el porcentaje grande, el producto, el precio antes tachado y el precio ahora, y el código si hay.
// Se dibuja sin librerías: letras de Inter ya rasterizadas (tarjeta-fuentes.js), el logo como máscara (logo-pdf.js)
// y un codificador PNG con zlib.
const zlib = require("zlib");
const FONTS = require("./tarjeta-fuentes");
const LOGO = require("./logo-pdf");

const W = 1080, H = 1350;
const BG = [251, 248, 242], INK = [26, 24, 21], MUTED = [118, 112, 102], GOLD = [216, 182, 110], GOLD_DK = [168, 128, 52], WHITE = [255, 255, 255];
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

// Atlas de letras: se descomprime una vez
const atlas = {};
function font(name) {
  if (!atlas[name]) { const f = FONTS[name]; atlas[name] = { ...f, bits: zlib.inflateSync(Buffer.from(f.a, "base64")) }; }
  return atlas[name];
}
const glyph = (f, ch) => f.g[ch] || f.g[ch.normalize("NFD")[0]] || f.g["?"] || f.g[" "];

function canvas() {
  const px = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { px[i * 3] = BG[0]; px[i * 3 + 1] = BG[1]; px[i * 3 + 2] = BG[2]; }
  const blend = (x, y, c, a) => {
    if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3; if (a > 1) a = 1;
    px[i] += (c[0] - px[i]) * a; px[i + 1] += (c[1] - px[i + 1]) * a; px[i + 2] += (c[2] - px[i + 2]) * a;
  };
  // Cobertura de un rectángulo redondeado en el pixel (px, py), con borde suave
  const cover = (px_, py, x, y, w, h, r) => {
    const cx = px_ + 0.5, cy = py + 0.5;
    if (cx < x || cy < y || cx > x + w || cy > y + h) return Math.max(0, Math.min(1, Math.min(cx - x, cy - y, x + w - cx, y + h - cy) + 0.5));
    const dx = cx < x + r ? x + r - cx : cx > x + w - r ? cx - (x + w - r) : 0;
    const dy = cy < y + r ? y + r - cy : cy > y + h - r ? cy - (y + h - r) : 0;
    if (dx && dy) return Math.max(0, Math.min(1, r - Math.hypot(dx, dy) + 0.5));
    return Math.max(0, Math.min(1, Math.min(cx - x, cy - y, x + w - cx, y + h - cy) + 0.5));
  };
  const c = {
    px,
    round(x, y, w, h, r, color, a = 1) {
      for (let j = Math.floor(y) - 1; j <= Math.ceil(y + h); j++) for (let i = Math.floor(x) - 1; i <= Math.ceil(x + w); i++) blend(i, j, color, cover(i, j, x, y, w, h, r) * a);
    },
    ring(x, y, w, h, r, t, color) {
      for (let j = Math.floor(y) - 1; j <= Math.ceil(y + h); j++) for (let i = Math.floor(x) - 1; i <= Math.ceil(x + w); i++) {
        const o = cover(i, j, x, y, w, h, r), n = cover(i, j, x + t, y + t, w - 2 * t, h - 2 * t, Math.max(0, r - t));
        blend(i, j, color, o - n);
      }
    },
    measure(s, name, tracking = 0) {
      const f = font(name); let w = 0; const chars = [...String(s)];
      for (const ch of chars) w += glyph(f, ch)[0];
      return w + tracking * Math.max(0, chars.length - 1);
    },
    // Texto con la línea base en y; align: left | center | right
    text(s, name, x, y, { color = INK, align = "left", tracking = 0 } = {}) {
      const f = font(name), w = c.measure(s, name, tracking);
      let cx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
      for (const ch of String(s)) {
        const [adv, bx, by, gw, gh, off] = glyph(f, ch);
        const ox = Math.round(cx + bx), oy = Math.round(y + by);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const a = f.bits[off + j * gw + i]; if (a) blend(ox + i, oy + j, color, a / 255); }
        cx += adv + tracking;
      }
      return w;
    },
    wrap(s, name, max) {
      const lines = []; let cur = "";
      for (const word of String(s || "").split(/\s+/).filter(Boolean)) {
        const t = cur ? cur + " " + word : word;
        if (c.measure(t, name) <= max || !cur) cur = t; else { lines.push(cur); cur = word; }
      }
      if (cur) lines.push(cur);
      return lines;
    },
    // Logo (máscara de transparencia) en un color, escalado a `lw` de ancho con interpolación bilineal
    logo(x, y, lw, color) {
      const a = zlib.inflateSync(Buffer.from(LOGO.alpha, "base64")), sw = LOGO.width, sh = LOGO.height;
      const lh = Math.round(lw * sh / sw), k = sw / lw;
      for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
        const sx = (i + 0.5) * k - 0.5, sy = (j + 0.5) * k - 0.5, x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy));
        const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
        // promedio de los vecinos para reducir sin escalones
        let v = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(sw - 1, Math.max(0, Math.round(sx) + dx)), yy = Math.min(sh - 1, Math.max(0, Math.round(sy) + dy)); v += a[yy * sw + xx]; n++;
        }
        const bil = a[y0 * sw + x0] * (1 - fx) * (1 - fy) + a[y0 * sw + x1] * fx * (1 - fy) + a[y1 * sw + x0] * (1 - fx) * fy + a[y1 * sw + x1] * fx * fy;
        blend(x + i, y + j, color, ((bil + v / n) / 2) / 255);
      }
      return lh;
    },
  };
  return c;
}

// PNG (RGB de 8 bits)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(px) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// d: { title, variant, before, now, pct, promoName, code, until, company }
function card(d) {
  const c = canvas(), cx = W / 2;
  c.ring(40, 40, W - 80, H - 80, 34, 3, GOLD);
  c.ring(58, 58, W - 116, H - 116, 22, 1, GOLD);
  c.logo(cx - 190, 112, 380, GOLD);
  c.text("OFERTA ESPECIAL", "caps", cx, 300, { color: MUTED, align: "center", tracking: 7 });
  c.text(`-${d.pct}%`, "pct", cx, 530, { color: INK, align: "center" });
  c.text("DE DESCUENTO", "caps", cx, 590, { color: GOLD_DK, align: "center", tracking: 7 });
  c.round(cx - 60, 640, 120, 3, 1.5, GOLD);
  const lines = c.wrap(d.title, "title", 880).slice(0, 2);
  if (c.wrap(d.title, "title", 880).length > 2) lines[1] = lines[1].replace(/\s*\S*$/, "") + "…";
  const small = [d.promoName, d.until ? "hasta el " + d.until : ""].filter(Boolean).join(" · ");
  // El bloque de producto y precios se centra en el espacio que queda entre la línea dorada y el pie
  const used = lines.length * 58 + (d.variant ? 48 : 0) + 52 + 104 + 74 + (d.code ? 100 : 0) + (small ? 40 : 0);
  let y = 722 + Math.max(0, Math.round((H - 170 - 680 - used) / 2));
  for (const l of lines) { c.text(l, "title", cx, y, { align: "center" }); y += 58; }
  if (d.variant) { c.text(d.variant, "body", cx, y, { color: MUTED, align: "center" }); y += 48; }
  y += 52;
  const old = "Antes " + money(d.before), ow = c.text(old, "old", cx, y, { color: MUTED, align: "center" });
  const lw = c.measure("Antes ", "old");
  c.round(cx - ow / 2 + lw - 4, y - 14, ow - lw + 8, 3, 1.5, MUTED); // tachado solo sobre el precio
  y += 104;
  c.text("Ahora " + money(d.now), "price", cx, y, { color: INK, align: "center" });
  y += 74;
  if (d.code) {
    const t = "Código " + d.code, tw = c.measure(t, "pill", 2) + 64;
    c.round(cx - tw / 2, y, tw, 64, 32, INK);
    c.text(t, "pill", cx, y + 43, { color: WHITE, align: "center", tracking: 2 });
    y += 100;
  }
  if (small) c.text(small, "body", cx, y + (d.code ? 0 : 20), { color: MUTED, align: "center" });
  c.text(`${(d.company || "Casa Dorada").toUpperCase()}  ·  TEXTILES PARA EL HOGAR`, "caps", cx, H - 88, { color: MUTED, align: "center", tracking: 4 });
  return png(c.px);
}

module.exports = { card, W, H };

// Catálogo en PDF por medida de cama: logo, secciones por tipo de producto y una tarjeta por producto
// (foto, nombre, colores y precio; si tiene descuento, el precio antes tachado y el %). Sobrio: negro y grises.
// Las fotos van tal cual en JPEG dentro del PDF (sin decodificarlas): solo se lee su tamaño.
const zlib = require("zlib");
const LOGO = require("./logo-pdf");
const { enc, width, wrap } = require("./cotizacion-pdf");
const { colorsText } = require("./medidas");

const W = 612, H = 792, M = 40, GAP = 14, COLS = 3;
const COLW = (W - 2 * M - (COLS - 1) * GAP) / COLS, IMGH = 108, CARDH = 172;
const INK = [0.1, 0.1, 0.1], MUTED = [0.42, 0.42, 0.42], LINE = [0.86, 0.86, 0.86], SOFT = [0.965, 0.965, 0.96], LOGO_GOLD = [0.847, 0.714, 0.431];
const f2 = n => (Math.round(n * 100) / 100).toString();
const rgb = (c, op) => c.map(f2).join(" ") + " " + op;
const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

// Tamaño y canales de un JPEG (marcador SOF); null si no es un JPEG que el PDF pueda mostrar
function jpegInfo(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
      const comps = buf[i + 9];
      if (comps !== 1 && comps !== 3) return null; // CMYK: se omite la foto
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps };
    }
    i += 2 + len;
  }
  return null;
}

function page() {
  const ops = [];
  return {
    ops,
    text(x, y, s, { font = "F1", size = 10, color = INK, align = "left", tracking = 0 } = {}) {
      const w = width(s, font, size, tracking), X = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      ops.push(`BT /${font} ${f2(size)} Tf ${f2(tracking)} Tc ${rgb(color, "rg")} ${f2(X)} ${f2(H - y)} Td (${esc(enc(s))}) Tj ET`);
      return w;
    },
    rect(x, y, w, h, color) { ops.push(`${rgb(color, "rg")} ${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re f`); },
    line(x1, y1, x2, y2, color = LINE, lw = 0.6) { ops.push(`${rgb(color, "RG")} ${f2(lw)} w ${f2(x1)} ${f2(H - y1)} m ${f2(x2)} ${f2(H - y2)} l S`); },
    image(name, x, y, w, h) { ops.push(`q ${f2(w)} 0 0 ${f2(h)} ${f2(x)} ${f2(H - y - h)} cm /${name} Do Q`); },
  };
}
const longDate = d => new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });

// cat: resultado de medidas.catalog; images: Map(url → Buffer JPEG | { width, height, rgb } ya leído de un PNG); company: settings/cotizacion
function pdf({ cat, images = new Map(), company: co = {}, now = Date.now() }) {
  const name = co.nombre || "Casa Dorada";
  const pages = [], imgs = []; // imgs: { name, buf, info }
  const imgName = url => {
    const buf = images.get(url), info = buf && buf.rgb ? { w: buf.width, h: buf.height, comps: 3, raw: true } : jpegInfo(buf);
    if (!info) return null;
    let e = imgs.find(x => x.url === url);
    if (!e) imgs.push(e = { url, name: "Im" + (imgs.length + 1), buf, info });
    return e;
  };
  let p, y;
  const newPage = first => {
    p = page(); pages.push(p);
    const lh = first ? 40 : 24, lw = lh * LOGO.width / LOGO.height;
    p.image("LogoH", M, first ? 40 : 30, lw, lh);
    if (first) {
      p.text(W - M, 50, "CATÁLOGO", { font: "F2", size: 8.5, color: MUTED, align: "right", tracking: 2.2 });
      p.text(W - M, 70, "Todo para cama " + cat.label, { font: "F2", size: 15, align: "right" });
      p.text(W - M, 84, `${cat.total} productos · ${longDate(now)}`, { size: 8.5, color: MUTED, align: "right" });
      p.line(M, 96, W - M, 96, INK, 0.8);
      y = 112;
    } else {
      p.text(W - M, 46, "Todo para cama " + cat.label, { font: "F2", size: 9.5, color: MUTED, align: "right" });
      p.line(M, 62, W - M, 62, LINE, 0.6);
      y = 80;
    }
  };
  const bottom = H - 50;
  newPage(true);
  for (const s of cat.sections) {
    if (y + 24 + CARDH > bottom) newPage(false);
    p.text(M, y + 10, s.name.toUpperCase(), { font: "F2", size: 8.5, color: INK, tracking: 1.6 });
    p.line(M + width(s.name.toUpperCase(), "F2", 8.5, 1.6) + 10, y + 7, W - M, y + 7, LINE, 0.6);
    y += 24;
    s.items.forEach((g, i) => {
      const col = i % COLS;
      if (col === 0 && i > 0) y += CARDH + 8;
      if (col === 0 && y + CARDH > bottom) { newPage(false); }
      const x = M + col * (COLW + GAP);
      // Foto (ajustada sin deformar) sobre un fondo gris claro
      p.rect(x, y, COLW, IMGH, SOFT);
      const im = g.image && imgName(g.image);
      if (im) {
        const k = Math.min((COLW - 12) / im.info.w, (IMGH - 12) / im.info.h), iw = im.info.w * k, ih = im.info.h * k;
        p.image(im.name, x + (COLW - iw) / 2, y + (IMGH - ih) / 2, iw, ih);
      } else p.text(x + COLW / 2, y + IMGH / 2 + 3, name, { font: "F2", size: 9, color: [0.75, 0.75, 0.75], align: "center" });
      if (g.disc) { // etiqueta del descuento sobre la foto
        const t = `-${g.disc.pct}%`, tw = width(t, "F2", 9) + 12;
        p.rect(x + COLW - tw - 6, y + 6, tw, 16, INK);
        p.text(x + COLW - tw / 2 - 6, y + 17.5, t, { font: "F2", size: 9, color: [1, 1, 1], align: "center" });
      }
      let ty = y + IMGH + 14;
      const tl = wrap(g.title, "F2", 9.5, COLW);
      if (tl.length > 2) { let l = tl[1]; while (l && width(l + "…", "F2", 9.5) > COLW) l = l.replace(/\s*\S+$/, ""); tl[1] = (l || tl[1]) + "…"; }
      for (const l of tl.slice(0, 2)) { p.text(x, ty, l, { font: "F2", size: 9.5 }); ty += 11.5; }
      const colors = colorsText(g, 3);
      if (colors) for (const l of wrap(colors, "F1", 8, COLW).slice(0, 1)) { p.text(x, ty, l, { size: 8, color: MUTED }); ty += 10; }
      const py = y + CARDH - 8;
      const pt = g.max > g.min ? "Desde " + money(g.min) : money(g.min);
      const pw = p.text(x, py, pt, { font: "F2", size: 11.5 });
      if (g.disc && g.disc.before > g.disc.now) {
        const bt = money(g.disc.before), bx = x + pw + 8, bw = width(bt, "F1", 8.5);
        p.text(bx, py, bt, { size: 8.5, color: MUTED });
        p.line(bx - 1, py - 3, bx + bw + 1, py - 3, MUTED, 0.7);
      }
    });
    y += CARDH + 16;
  }
  // Pie y numeración
  const info = [name, co.telefono, co.web || co.correo].filter(Boolean).join("  ·  ");
  pages.forEach((pg, i) => {
    pg.line(M, H - 40, W - M, H - 40, LINE, 0.6);
    pg.text(M, H - 26, info + "  ·  Precios en pesos colombianos, sujetos a disponibilidad.", { size: 7.5, color: MUTED });
    pg.text(W - M, H - 26, `${i + 1} / ${pages.length}`, { size: 7.5, color: MUTED, align: "right" });
  });

  // Ensamble
  const objs = [], add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const fonts = [["F1", "Helvetica"], ["F2", "Helvetica-Bold"]].map(([k, base]) => [k, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`)]);
  const alpha = add({ dict: `/Type /XObject /Subtype /Image /Width ${LOGO.width} /Height ${LOGO.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, stream: Buffer.from(LOGO.alpha, "base64") });
  const logo = add({ dict: `/Type /XObject /Subtype /Image /Width ${LOGO.width} /Height ${LOGO.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${alpha} 0 R`,
    stream: zlib.deflateSync(Buffer.concat(Array(LOGO.width * LOGO.height).fill(Buffer.from(LOGO_GOLD.map(v => Math.round(v * 255)))))) });
  const imgIds = imgs.map(im => [im.name, add(im.info.raw
    ? { dict: `/Type /XObject /Subtype /Image /Width ${im.info.w} /Height ${im.info.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, stream: zlib.deflateSync(im.buf.rgb) }
    : { dict: `/Type /XObject /Subtype /Image /Width ${im.info.w} /Height ${im.info.h} /ColorSpace /${im.info.comps === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode`, stream: im.buf })]);
  const res = `<< /Font << ${fonts.map(([k, id]) => `/${k} ${id} 0 R`).join(" ")} >> /XObject << /LogoH ${logo} 0 R ${imgIds.map(([n, id]) => `/${n} ${id} 0 R`).join(" ")} >> >>`;
  const kids = pages.map(pg => {
    const cs = add({ dict: "/Filter /FlateDecode", stream: zlib.deflateSync(Buffer.from(pg.ops.join("\n"), "latin1")) });
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} /Contents ${cs} 0 R >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  const meta = add(`<< /Title (${esc(enc("Catálogo " + name + " · Cama " + cat.label))}) /Author (${esc(enc(name))}) /Producer (House Chat) >>`);
  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let off = chunks[0].length;
  const xref = [];
  objs.forEach((o, i) => {
    const b = typeof o === "string" ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1")
      : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${o.stream.length} ${o.dict} >>\nstream\n`, "latin1"), o.stream, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    xref.push(off); chunks.push(b); off += b.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${xref.map(x => String(x).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${meta} 0 R >>\nstartxref\n${off}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

// Pide la foto en JPEG y a `px` de ancho al CDN de Shopify (más liviana); otras direcciones van tal cual
function jpegUrl(url, px = 500) {
  try {
    const u = new URL(url);
    if (/cdn\.shopify\.com$/.test(u.hostname) || u.pathname.includes("/cdn/shop/")) { u.searchParams.set("width", String(px)); u.searchParams.set("format", "jpg"); }
    return u.toString();
  } catch { return url; }
}

module.exports = { pdf, jpegInfo, jpegUrl };

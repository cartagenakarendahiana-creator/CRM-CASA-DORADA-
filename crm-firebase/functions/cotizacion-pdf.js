// Cotización en PDF, sobria (negro y grises), con el logo de Casa Dorada sobre fondo blanco en el encabezado
// y como marca de agua gris muy suave en el fondo.
// PDF escrito a mano (sin librerías): fuentes estándar Helvetica y Times con codificación WinAnsi (tildes y ñ),
// tamaño carta, varias páginas si hace falta. pdf({ quote, contact, company }) → Buffer
const zlib = require("zlib");
const LOGO = require("./logo-pdf"); // generado por assets/logo-a-pdf.py a partir del logo original

const W = 612, H = 792, M = 54;                     // carta, márgenes de 3/4 de pulgada
const INK = [0.1, 0.1, 0.1], MUTED = [0.42, 0.42, 0.42], LINE = [0.86, 0.86, 0.86], SOFT = [0.965, 0.965, 0.965], WHITE = [1, 1, 1];
const FONTS = { F1: "Helvetica", F2: "Helvetica-Bold", F3: "Times-Bold", F4: "Times-Italic", F5: "Times-Roman" };

// Anchos (milésimas de em) de Helvetica y Helvetica-Bold para ASCII 32–126; las letras con tilde miden como su base
const HV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const TB = { " ": 250, A: 722, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 778, I: 389, J: 500, K: 778, L: 667, M: 944, N: 722, O: 778, P: 611, Q: 778, R: 722, S: 556, T: 667, U: 722, V: 722, W: 1000, X: 722, Y: 722, Z: 667 };
const WIN = { "€": 128, "‚": 130, "„": 132, "…": 133, "•": 149, "–": 150, "—": 151, "‘": 145, "’": 146, "“": 147, "”": 148, "™": 153 };

// Texto → bytes WinAnsi (lo que no existe, como emojis, se quita)
function enc(s) {
  let out = "";
  for (const ch of String(s == null ? "" : s).normalize("NFC")) {
    const c = ch.codePointAt(0);
    if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (c >= 32 && c < 127) out += ch;
    else if (c >= 160 && c < 256) out += ch;
    else if (c === 10 || c === 9) out += " ";
  }
  return out.replace(/ {2,}/g, " ");
}
const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
function width(s, font, size, tracking = 0) {
  let w = 0;
  const str = enc(s);
  for (const ch of str) {
    const base = ch.normalize("NFD")[0], c = base.charCodeAt(0);
    if (font === "F3") w += TB[base.toUpperCase()] || 500;
    else if (c >= 32 && c <= 126) w += (font === "F2" ? HB : HV)[c - 32];
    else w += 556;
  }
  return w * size / 1000 + tracking * Math.max(0, str.length - 1);
}
// Parte un texto en líneas que caben en `max` puntos
function wrap(s, font, size, max) {
  const lines = [];
  for (const para of String(s || "").split(/\n/)) {
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + " " + word : word;
      if (width(t, font, size) <= max || !cur) cur = t; else { lines.push(cur); cur = word; }
    }
    lines.push(cur);
  }
  return lines;
}
const f2 = n => (Math.round(n * 100) / 100).toString();
const rgb = (c, op) => c.map(f2).join(" ") + " " + op;
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const longDate = d => new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
const isoToDate = s => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? new Date(s + "T12:00:00-05:00") : null);

// Lienzo de una página: coordenadas desde arriba (y crece hacia abajo)
function page() {
  const ops = [];
  return {
    ops,
    text(x, y, s, { font = "F1", size = 10, color = INK, align = "left", tracking = 0 } = {}) {
      const w = width(s, font, size, tracking), X = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      ops.push(`BT /${font} ${f2(size)} Tf ${f2(tracking)} Tc ${rgb(color, "rg")} ${f2(X)} ${f2(H - y)} Td (${esc(enc(s))}) Tj ET`);
      return w;
    },
    rect(x, y, w, h, { fill, stroke, lw = 0.6 } = {}) {
      ops.push(`${fill ? rgb(fill, "rg") + " " : ""}${stroke ? rgb(stroke, "RG") + " " + f2(lw) + " w " : ""}${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re ${fill && stroke ? "B" : fill ? "f" : "S"}`);
    },
    line(x1, y1, x2, y2, color = LINE, lw = 0.6) { ops.push(`${rgb(color, "RG")} ${f2(lw)} w ${f2(x1)} ${f2(H - y1)} m ${f2(x2)} ${f2(H - y2)} l S`); },
    raw(s) { ops.push(s); },
  };
}
// Marca de agua: el logo completo (casa y nombre) en gris muy suave, centrado
const LOGO_GOLD = [0.847, 0.714, 0.431], WM_GRAY = [0.55, 0.55, 0.55];
function watermark(p) {
  const w = 430, h = w * LOGO.height / LOGO.width;
  p.raw(`q /GW gs ${f2(w)} 0 0 ${f2(h)} ${f2((W - w) / 2)} ${f2(H / 2 - h / 2 - 30)} cm /LogoW Do Q`);
}

function pdf({ quote: q, contact: c = {}, company: co = {} }) {
  const name = co.nombre || "Casa Dorada";
  const pages = [];
  let p, y;
  const footer = (pg) => {
    pg.line(M, H - 50, W - M, H - 50, LINE, 0.6);
    const info = [name, co.nit && "NIT " + co.nit, co.telefono, co.correo, co.web].filter(Boolean).join("  ·  ");
    pg.text(M, H - 34, info, { size: 7.5, color: MUTED });
    if (co.direccion) pg.text(M, H - 24, co.direccion, { size: 7.5, color: MUTED });
  };
  const newPage = first => {
    p = page(); pages.push(p);
    // Encabezado: el logo (casa y nombre) en su dorado, sobre fondo blanco
    const lh = 44, lw = lh * LOGO.width / LOGO.height;
    p.raw(`q ${f2(lw)} 0 0 ${f2(lh)} ${M} ${f2(H - 56 - lh)} cm /LogoH Do Q`);
    if (co.lema !== "-") p.text(M, 120, co.lema || "Textiles para el hogar y la hotelería", { font: "F4", size: 10, color: MUTED });
    p.text(W - M, 64, "COTIZACIÓN", { font: "F2", size: 9, color: MUTED, align: "right", tracking: 2.2 });
    p.text(W - M, 86, q.number || "", { font: "F2", size: 19, color: INK, align: "right" });
    p.text(W - M, 102, "Fecha: " + longDate(q.sentAt || q.createdAt || Date.now()), { size: 8.5, color: MUTED, align: "right" });
    const vu = isoToDate(q.validUntil);
    if (vu) p.text(W - M, 114, "Válida hasta: " + longDate(vu), { size: 8.5, color: MUTED, align: "right" });
    p.line(M, 133, W - M, 133, INK, 0.8);
    y = first ? 158 : 156;
  };
  newPage(true);

  // Cliente y asesor
  const label = (x, yy, t) => p.text(x, yy, t, { font: "F2", size: 7.5, color: MUTED, tracking: 1.4 });
  label(M, y, "PREPARADA PARA");
  const cname = c.name || q.contactName || c.company || "Cliente";
  p.text(M, y + 17, cname, { font: "F2", size: 12.5 });
  let cy = y + 31;
  for (const l of [c.name && c.company ? c.company : "", c.docId ? `${c.docType || "Documento"} ${c.docId}` : "", [c.city, c.phone && c.phone !== cname ? c.phone : ""].filter(Boolean).join("  ·  "), c.email].filter(Boolean)) {
    p.text(M, cy, l, { size: 9, color: MUTED }); cy += 12.5;
  }
  const rx = 360;
  label(rx, y, "ATENDIDA POR");
  p.text(rx, y + 17, String(q.sentByName || q.createdByName || name).replace(/ · IA$/, ""), { font: "F2", size: 11 });
  p.text(rx, y + 31, [co.telefono, co.correo].filter(Boolean).join("  ·  ") || name, { size: 9, color: MUTED });
  y = Math.max(cy, y + 44) + 16;

  // Tabla de productos
  const cols = { desc: M + 12, qty: 368, unit: 470, tot: W - M - 12 };
  const head = () => {
    p.rect(M, y, W - 2 * M, 24, { fill: INK });
    const o = { font: "F2", size: 7.5, color: WHITE, tracking: 1.2 };
    p.text(cols.desc, y + 15.5, "DESCRIPCIÓN", o);
    p.text(cols.qty, y + 15.5, "CANT.", { ...o, align: "center" });
    p.text(cols.unit, y + 15.5, "VALOR UNIT.", { ...o, align: "right" });
    p.text(cols.tot, y + 15.5, "TOTAL", { ...o, align: "right" });
    y += 24;
  };
  head();
  const items = (q.items || []).filter(it => it && (it.name || it.productId));
  items.forEach((it, i) => {
    const nameLines = wrap(it.name || "Producto", "F2", 10, 255).slice(0, 3);
    const sub = [it.promo ? `Promoción: ${it.promo}` : "", it.listPrice && it.listPrice > it.price ? `Precio normal ${money(it.listPrice)}` : "", it.note || ""].filter(Boolean).join("  ·  ");
    const subLines = sub ? wrap(sub, "F1", 8, 255).slice(0, 2) : [];
    const h = 14 + nameLines.length * 12.5 + subLines.length * 10.5 + 2;
    if (y + h > H - 150) { footer(p); newPage(false); head(); }
    if (i % 2 === 1) p.rect(M, y, W - 2 * M, h, { fill: SOFT });
    let ty = y + 17;
    nameLines.forEach(l => { p.text(cols.desc, ty, l, { font: "F2", size: 10 }); ty += 12.5; });
    subLines.forEach(l => { p.text(cols.desc, ty - 1.5, l, { size: 8, color: MUTED }); ty += 10.5; });
    p.text(cols.qty, y + 17, String(it.qty || 0), { size: 10, align: "center" });
    p.text(cols.unit, y + 17, money(it.price), { size: 10, align: "right" });
    p.text(cols.tot, y + 17, money((it.qty || 0) * (it.price || 0)), { font: "F2", size: 10, align: "right" });
    y += h;
    p.line(M, y, W - M, y, LINE, 0.6);
  });

  // Totales
  const subtotal = q.subtotal != null ? q.subtotal : items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  // En la app el descuento es un porcentaje (q.discount) y total ya lo trae aplicado
  const total = q.total != null ? q.total : subtotal, discount = Math.max(0, subtotal - total);
  if (y + 110 > H - 70) { footer(p); newPage(false); }
  y += 16;
  const tx = 360;
  const row = (t, v, o = {}) => { p.text(tx, y, t, { size: 9.5, color: MUTED }); p.text(W - M - 12, y, v, { size: 10, align: "right", ...o }); y += 16; };
  row("Subtotal", money(subtotal));
  if (discount) row(q.discount ? `Descuento (${q.discount}%)` : "Descuento", "- " + money(discount));
  if (q.shipping) row("Envío", money(q.shipping));
  y += 2;
  p.line(tx - 12, y - 4, W - M, y - 4, INK, 0.8);
  p.line(tx - 12, y + 28, W - M, y + 28, INK, 0.8);
  p.text(tx, y + 16, "TOTAL", { font: "F2", size: 9, color: INK, tracking: 1.6 });
  p.text(W - M - 12, y + 17, money(total), { font: "F2", size: 15, align: "right" });
  p.text(tx, y + 42, "Valores en pesos colombianos (COP).", { size: 7.5, color: MUTED });
  y += 62;

  // Observaciones y condiciones
  const block = (t, txt) => {
    const lines = wrap(txt, "F1", 9, W - 2 * M);
    if (y + 26 + lines.length * 12.5 > H - 70) { footer(p); newPage(false); }
    label(M, y, t); y += 15;
    lines.forEach(l => { p.text(M, y, l, { size: 9, color: INK }); y += 12.5; });
    y += 12;
  };
  if (q.notes && String(q.notes).trim()) block("OBSERVACIONES", String(q.notes).trim());
  const vu = isoToDate(q.validUntil);
  block("CONDICIONES", (co.condiciones && String(co.condiciones).trim()) ||
    `Cotización válida${vu ? " hasta el " + longDate(vu) : " por 15 días"}. Precios sujetos a disponibilidad de inventario al momento de confirmar el pedido. Los tiempos de entrega y el costo del envío se confirman con tu asesora.`);
  if (y + 40 < H - 70) p.text(W / 2, Math.max(y + 18, H - 82), "Gracias por tu confianza.", { font: "F4", size: 11, color: MUTED, align: "center" });
  footer(p);

  // Ensamble del PDF
  const n = pages.length;
  pages.forEach(watermark); // al final, encima de todo y casi transparente: no lo tapan las filas de la tabla
  pages.forEach((pg, i) => { if (n > 1) pg.text(W - M, H - 34, `Página ${i + 1} de ${n}`, { size: 7.5, color: MUTED, align: "right" }); });
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesId = add(null);
  const fontIds = Object.entries(FONTS).map(([k, base]) => [k, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`)]);
  // Logo: JPEG original para el encabezado; para la marca de agua, dorado liso con la máscara de transparencia
  const alpha = add({ dict: `/Type /XObject /Subtype /Image /Width ${LOGO.width} /Height ${LOGO.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, stream: Buffer.from(LOGO.alpha, "base64") });
  // El mismo logo en un color liso: dorado para el encabezado, gris para la marca de agua
  const solid = color => add({ dict: `/Type /XObject /Subtype /Image /Width ${LOGO.width} /Height ${LOGO.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask ${alpha} 0 R`,
    stream: zlib.deflateSync(Buffer.concat(Array(LOGO.width * LOGO.height).fill(Buffer.from(color.map(v => Math.round(v * 255)))))) });
  const logoH = solid(LOGO_GOLD), logoW = solid(WM_GRAY);
  const res = `<< /Font << ${fontIds.map(([k, id]) => `/${k} ${id} 0 R`).join(" ")} >> /XObject << /LogoW ${logoW} 0 R /LogoH ${logoH} 0 R >> /ExtGState << /GW << /Type /ExtGState /ca 0.08 /CA 0.08 >> >> >>`;
  const kids = pages.map(pg => {
    const data = zlib.deflateSync(Buffer.from(pg.ops.join("\n"), "latin1"));
    const cs = add({ dict: "/Filter /FlateDecode", stream: data });
    return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} /Contents ${cs} 0 R >>`);
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${esc(enc("Cotización " + (q.number || "")))}) /Author (${esc(enc(name))}) /Producer (House Chat) >>`);
  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let off = chunks[0].length;
  const xref = [];
  objs.forEach((o, i) => {
    const b = typeof o === "string" ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1")
      : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${o.stream.length} ${o.dict} >>\nstream\n`, "latin1"), o.stream, Buffer.from("\nendstream\nendobj\n", "latin1")]);
    xref.push(off); chunks.push(b); off += b.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${xref.map(x => String(x).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${off}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

module.exports = { pdf, enc, width, wrap };

// Catálogo por medida de cama: cuando el cliente quiere "de todo para su cama doble", reúne los productos de cama
// de esa medida y los que sirven para cualquier medida (almohadas, cojines…), agrupa las variantes de color de un
// mismo producto y los ordena por tipo (kits, sábanas, plumones, cobijas, protectores…). Se envía como catálogo en PDF.
const PROMOS = require("./promos");
const { splitName, discountOf } = require("./ficha");

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
// Medidas: "1.40", "1,40", "1.40mt", "140x190", "doble"… En orden: "semidoble" va antes que "doble".
// (?<![\d.,]) evita confundir 11.40 o 21.20; "doble faz" (tela de dos caras) no es una medida.
const N = "(?<![\\d.,])";
const SIZES = [
  { key: "semidoble", label: "Semidoble (1.20 m)", re: new RegExp(`semi ?doble|${N}1[.,]20?(?!\\d)|\\b120 ?x`) },
  { key: "sencilla", label: "Sencilla (1.00 m)", re: new RegExp(`\\bsencill[oa]s?\\b|\\bindividual(es)?\\b|\\btwin\\b|${N}1[.,]00?(?!\\d)|${N}1 ?mts?\\b|\\b100 ?x`) },
  { key: "doble", label: "Doble (1.40 m)", re: new RegExp(`\\bdobles?\\b|${N}1[.,]40?(?!\\d)|\\b140 ?x|\\bfull\\b`) },
  { key: "queen", label: "Queen (1.60 m)", re: new RegExp(`\\bqueen\\b|${N}1[.,]60?(?!\\d)|\\b160 ?x`) },
  { key: "king", label: "King (2.00 m)", re: new RegExp(`\\bking\\b|${N}2[.,]00?(?!\\d)|${N}2 ?x ?2(?!\\d)|\\b200 ?x`) },
];
const sizeOf = s => { const t = norm(s).replace(/doble faz/g, ""); const z = SIZES.find(x => x.re.test(t)); return z ? z.key : null; };

// Tipo de producto por su nombre (las categorías de Shopify a veces dicen "Físico" u "Otros")
const SECTIONS = [
  ["Kits y combos", /\bkit\b|combo/],
  ["Sábanas", /sabana/],
  ["Plumones y edredones", /plumon|edredon|duvet|acolchad|cubrelecho|colcha|sobrecama|tendido/],
  ["Cobijas", /cobij|manta|frazada/],
  ["Protectores y fundas", /protector|funda/],
  ["Almohadas y cojines", /almohad|cojin|pie de cama|relleno/],
];
// Gana la palabra que aparece primero en el nombre: "Plumón 6 piezas con sábana" es plumón; "Kit 8 piezas (Plumón…)" es kit
function sectionOf(p) {
  const t = norm(`${splitName(p.name).title} ${p.category}`);
  let best = null, at = Infinity;
  for (const [name, re] of SECTIONS) { const m = t.match(re); if (m && m.index < at) { at = m.index; best = name; } }
  return best;
}
const isBed = p => !!sectionOf(p) && !/toalla|cortina|tapete|mantel|individual de mesa/.test(norm(p.name));

// Nombre corto para el catálogo: sin la parte publicitaria después de " | ", " – ", " — " o " - "
function shortTitle(t) {
  const first = String(t || "").split(/\s+[|–—-]\s+/)[0].trim();
  return first.length >= 12 ? first : String(t || "").trim();
}
// Colores de la variante, sin la parte de la medida ("Queen (1.60 mt) · azul indigo" → "azul indigo")
const colorOf = variant => variant.split(" · ").filter(x => !sizeOf(x) && !/^\d+([.,]\d+)?( ?x ?\d+([.,]\d+)?)? ?(mts?|cm)?$/.test(norm(x).trim())).join(" · ").trim();

// Agrupa las variantes de un mismo producto: { title, section, colors[], min, max, image, ids[], disc }
function group(list, promos) {
  const by = new Map();
  for (const p of list) {
    const { title, variant } = splitName(p.name);
    const k = norm(title);
    const g = by.get(k) || { title: shortTitle(title), fullTitle: title, section: sectionOf(p) || "Otros", colors: [], min: Infinity, max: 0, image: "", ids: [], disc: null };
    const color = colorOf(variant);
    if (color && !g.colors.some(c => norm(c) === norm(color))) g.colors.push(color);
    const d = discountOf(p, promos), price = d ? d.now : PROMOS.bestPrice(p, 1, p.priceRetail || 0, promos).price;
    if (price && price < g.min) { g.min = price; g.disc = d; if (p.image) g.image = p.image; }
    if (price) g.max = Math.max(g.max, price);
    if (!g.image && p.image) g.image = p.image;
    g.ids.push(p.id);
    by.set(k, g);
  }
  const order = s => { const i = SECTIONS.findIndex(([n]) => n === s); return i < 0 ? SECTIONS.length : i; };
  return [...by.values()].sort((a, b) => order(a.section) - order(b.section) || a.min - b.min || a.title.localeCompare(b.title));
}
const priceText = g => (!isFinite(g.min) ? "" : g.max > g.min ? "desde " + money(g.min) : money(g.min));
const colorsText = (g, n = 4) => (g.colors.length ? g.colors.slice(0, n).join(", ") + (g.colors.length > n ? ` y ${g.colors.length - n} más` : "") : "");

// catalog(products, "doble") → { key, label, sections: [{ name, items }], items, total, photos } o null si la medida no se reconoce
function catalog(products, medida, promos = [], { maxPhotos = 8 } = {}) {
  const key = sizeOf(medida);
  const size = SIZES.find(s => s.key === key);
  if (!size) return null;
  const bed = products.filter(p => p.active !== false && isBed(p));
  const items = group(bed.filter(p => { const s = sizeOf(p.name); return s === key || !s; }), promos);
  const sections = [];
  for (const g of items) { let s = sections.find(x => x.name === g.section); if (!s) sections.push(s = { name: g.section, items: [] }); s.items.push(g); }
  const photos = items.filter(g => g.image).slice(0, maxPhotos).map(g => ({ id: g.ids[0], image: g.image,
    caption: [`*${g.title}*`, colorsText(g) ? `_${colorsText(g)}_` : "", priceText(g) ? `*${priceText(g)[0].toUpperCase() + priceText(g).slice(1)}*` : ""].filter(Boolean).join("\n") }));
  // Resumen corto (para la IA, o como respaldo si no se puede enviar el PDF)
  const summary = [`*Todo para cama ${size.label}* 🛏️`, ...sections.map(s => `\n*${s.name}*\n` + s.items.slice(0, 6).map(g => `• ${g.title} — ${priceText(g)}`).join("\n")
    + (s.items.length > 6 ? `\n_…y ${s.items.length - 6} más_` : ""))].join("\n");
  return { key, label: size.label, sections, items, total: items.length, photos, summary };
}

module.exports = { catalog, sizeOf, SIZES, group, sectionOf, shortTitle, colorsText, priceText };

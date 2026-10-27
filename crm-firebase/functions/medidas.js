// Catálogo por medida de cama: cuando el cliente quiere "de todo para su cama doble", reúne todos los productos
// de esa medida (sábanas, cobijas, edredones, fundas, protectores…) agrupando las variantes de color de un mismo
// producto, más los artículos de cama que sirven para cualquier medida (almohadas, cojines…).
const PROMOS = require("./promos");
const { splitName } = require("./ficha");

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
// En orden: "semidoble" va antes que "doble"
const SIZES = [
  { key: "semidoble", label: "Semidoble (1.20 m)", re: /semi ?doble|\b1[.,]20?\b(?!\d)|\b120 ?x/ },
  { key: "sencilla", label: "Sencilla (1.00 m)", re: /\bsencill[oa]s?\b|\bindividual(es)?\b|\btwin\b|\b1[.,]00?\b(?!\d)|\b100 ?x/ },
  { key: "doble", label: "Doble (1.40 m)", re: /\bdobles?\b|\b1[.,]40?\b(?!\d)|\b140 ?x|\bfull\b/ },
  { key: "queen", label: "Queen (1.60 m)", re: /\bqueen\b|\b1[.,]60?\b(?!\d)|\b160 ?x/ },
  { key: "king", label: "King (2.00 m)", re: /\bking\b|\b2[.,]00?\b(?!\d)|\b200 ?x/ },
];
const sizeOf = s => { const t = norm(s); const z = SIZES.find(x => x.re.test(t)); return z ? z.key : null; };
const BED = /sabana|cobij|edred|almohad|protector|cubrelecho|plumon|funda|colcha|duvet|cojin|manta|frazada|sobrecama|lencer|cama/;
const isBed = p => BED.test(norm(`${p.category} ${p.name}`)) && !/toalla|bano/.test(norm(`${p.category} ${p.name}`));

// Orden de las categorías en la lista, como en la tienda: primero sábanas, luego lo de abrigo, fundas y protectores
const ORDER = [/sabana/, /cobij|manta|frazada/, /edred|plumon|duvet/, /cubrelecho|colcha|sobrecama/, /funda/, /protector/, /almohad/, /cojin/];
const rank = c => { const i = ORDER.findIndex(r => r.test(norm(c))); return i < 0 ? ORDER.length : i; };
// Agrupa las variantes de un mismo producto: { title, category, colors[], min, max, image, ids[] }
function group(list, promos) {
  const by = new Map();
  for (const p of list) {
    const { title, variant } = splitName(p.name);
    const k = norm(title) + "|" + norm(p.category);
    const g = by.get(k) || { title, category: p.category || "Otros", colors: [], min: Infinity, max: 0, image: "", ids: [] };
    const color = variant.split(" · ").filter(x => !sizeOf(x)).join(" · ").trim();
    if (color && !g.colors.some(c => norm(c) === norm(color))) g.colors.push(color);
    const price = PROMOS.bestPrice(p, 1, p.priceRetail || 0, promos).price;
    if (price) { g.min = Math.min(g.min, price); g.max = Math.max(g.max, price); }
    if (!g.image && p.image) g.image = p.image;
    g.ids.push(p.id);
    by.set(k, g);
  }
  return [...by.values()].sort((a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}
const priceText = g => (!isFinite(g.min) ? "" : g.max > g.min ? "desde " + money(g.min) : money(g.min));

// catalog(products, "doble") → { label, groups, general, summary, photos } o null si la medida no se reconoce
function catalog(products, medida, promos = [], { maxPhotos = 8, maxChars = 3500 } = {}) {
  const key = sizeOf(medida);
  const size = SIZES.find(s => s.key === key);
  if (!size) return null;
  const active = products.filter(p => p.active !== false);
  const groups = group(active.filter(p => sizeOf(p.name) === key), promos);
  const general = group(active.filter(p => !sizeOf(p.name) && isBed(p)), promos);
  // Lista ordenada por categoría
  const lines = [`*Todo para cama ${size.label}* 🛏️`];
  let cat = null, shown = 0;
  const all = [...groups.map(g => ({ ...g, sec: g.category })), ...general.map(g => ({ ...g, sec: "Para cualquier medida" }))];
  for (const g of all) {
    const add = [];
    if (g.sec !== cat) { add.push("", `*${g.sec}*`); }
    add.push(`• ${g.title}${priceText(g) ? " — " + priceText(g) : ""}`);
    if (g.colors.length) add.push(`   _${g.colors.slice(0, 8).join(", ")}${g.colors.length > 8 ? "…" : ""}_`);
    if ((lines.join("\n") + "\n" + add.join("\n")).length > maxChars) break;
    if (g.sec !== cat) cat = g.sec;
    lines.push(...add); shown++;
  }
  if (shown < all.length) lines.push("", `_…y ${all.length - shown} productos más._`);
  // Fotos: una por producto (primero los de la medida), con un pie corto
  const photos = all.filter(g => g.image).slice(0, maxPhotos).map(g => ({ id: g.ids[0], image: g.image,
    caption: [`*${g.title}*`, g.colors.length ? `_${g.colors.slice(0, 6).join(", ")}_` : "", priceText(g) ? `*${priceText(g)[0].toUpperCase() + priceText(g).slice(1)}*` : ""].filter(Boolean).join("\n") }));
  return { key, label: size.label, groups, general, summary: lines.join("\n"), photos, total: all.length };
}

module.exports = { catalog, sizeOf, SIZES, group };

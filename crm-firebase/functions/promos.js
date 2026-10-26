// Promociones y descuentos (colección promos, la administra la administradora en House Chat).
// { name, desc (texto para el cliente), type, value, scope, categories[], productIds[], minQty, code, start, end, on }
//   type: porcentaje (value % menos) · valor (value pesos menos por unidad) · precio (precio especial = value)
//         regalo · envio (envío gratis) · otro (beneficio en texto; no cambia el precio)
//   scope: todo · categoria · productos     start/end: AAAA-MM-DD (opcionales, hora de Colombia)
const TYPES = { porcentaje: "% de descuento", valor: "pesos menos", precio: "precio especial", regalo: "regalo", envio: "envío gratis", otro: "beneficio" };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const today = (now = Date.now()) => new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

const isActive = (p, now = Date.now()) => p && p.on !== false && p.name && (!p.start || p.start <= today(now)) && (!p.end || p.end >= today(now));
const activePromos = (list, now) => (list || []).filter(p => isActive(p, now));

// Los productos de Shopify con variantes tienen id shp_{producto}_{variante}: una promo del producto aplica a todas sus variantes
function appliesTo(promo, product) {
  if (!promo || !product) return false;
  if (promo.scope === "categoria") return (promo.categories || []).map(norm).includes(norm(product.category));
  if (promo.scope === "productos") return (promo.productIds || []).some(id => id === product.id || String(product.id).startsWith(id + "_"));
  return true;
}
// Precio por unidad con la promo, o null si la promo no cambia el precio o no alcanza el mínimo de unidades
function promoUnitPrice(promo, base, qty = 1) {
  if (!base || (promo.minQty && qty < promo.minQty)) return null;
  const v = Number(promo.value) || 0;
  const p = promo.type === "porcentaje" ? base * (1 - Math.min(100, v) / 100) : promo.type === "valor" ? base - v : promo.type === "precio" ? v : null;
  return p === null || p <= 0 || p >= base ? null : Math.round(p);
}
// Mejor precio para un producto y cantidad: { price, promo } (promo = null si no hay descuento)
function bestPrice(product, qty, basePrice, promos) {
  let best = { price: basePrice, promo: null };
  for (const pr of promos || []) {
    if (!appliesTo(pr, product)) continue;
    const p = promoUnitPrice(pr, basePrice, qty);
    if (p !== null && p < best.price) best = { price: p, promo: pr };
  }
  return best;
}
// Promociones que aplican a un producto (con o sin cambio de precio)
const promosFor = (product, promos) => (promos || []).filter(pr => appliesTo(pr, product));

function conditionText(p) {
  const v = Number(p.value) || 0;
  const what = p.type === "porcentaje" ? `${v}% de descuento` : p.type === "valor" ? `${money(v)} menos por unidad` : p.type === "precio" ? `precio especial de ${money(v)}`
    : p.type === "envio" ? "envío gratis" : p.type === "regalo" ? "regalo" : "beneficio";
  const on = p.scope === "categoria" ? ` en ${(p.categories || []).join(", ")}` : p.scope === "productos" ? " en productos seleccionados" : " en todo el catálogo";
  return what + on + (p.minQty ? `, comprando desde ${p.minQty} unidades` : "") + (p.code ? `, con el código ${p.code}` : "") + (p.end ? `, hasta el ${p.end}` : "");
}
// Lista para las instrucciones de la asesora
function promosText(list) {
  if (!list.length) return "No hay promociones vigentes: no ofrezcas descuentos.";
  return "Promociones vigentes (son las ÚNICAS que puedes ofrecer, tal cual):\n" + list.slice(0, 30).map(p => `- ${p.name}: ${conditionText(p)}.${p.desc ? " " + String(p.desc).slice(0, 300) : ""}`).join("\n");
}

module.exports = { TYPES, isActive, activePromos, appliesTo, promoUnitPrice, bestPrice, promosFor, conditionText, promosText, today };

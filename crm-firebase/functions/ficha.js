// Ficha de producto con formato fijo y elegante (formato de WhatsApp: *negrita*, _cursiva_, ~tachado~),
// y conversión de ese formato para los canales que no lo entienden (Telegram usa HTML; Messenger, Instagram: texto limpio).
const PROMOS = require("./promos");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

// Hasta 2 puntos cortos y completos a partir de la descripción ("50% microfibra, 50% algodón. Liviana y suave" → 2 puntos):
// frases de hasta 90 caracteres; las más largas se parten por comas y se descartan los pedazos que sigan siendo largos
function bullets(desc) {
  return String(desc || "").split(/[.;\n•·▫️]+/).map(x => x.trim()).flatMap(x => (x.length > 90 ? x.split(/,\s*/) : [x]))
    .map(x => x.trim().replace(/^[-–*]\s*/, "").replace(/^(y|e|junto a)\s+/i, "")).filter(x => x.length > 2 && x.length <= 90)
    .slice(0, 2).map(x => "• " + x[0].toUpperCase() + x.slice(1));
}
// "Juego de Sábanas Silver  50% algodón | Casa Dorada · Queen (1.60 mt) / azul indigo"
//   → { title: "Juego de Sábanas Silver 50% algodón", variant: "Queen (1.60 mt) · azul indigo" }
function splitName(name) {
  const [base, ...rest] = String(name || "").split(" · ");
  const title = base.replace(/\s*[|–-]\s*casa dorada\s*$/i, "").replace(/\s*\|\s*$/, "").replace(/\s{2,}/g, " ").trim();
  const variant = rest.join(" · ").split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean).join(" · ");
  return { title, variant };
}
function productCard(p, promos = []) {
  const b = PROMOS.bestPrice(p, 1, p.priceRetail || 0, promos);
  const before = p.compareAt > p.priceRetail ? p.compareAt : b.promo ? p.priceRetail : 0;
  const { title, variant } = splitName(p.name);
  const lines = [`*${title}*`];
  if (variant || p.category) lines.push(`_${variant || p.category}_`);
  const pts = bullets(p.desc);
  if (pts.length) lines.push("", ...pts);
  lines.push("", before ? `*${money(b.price)}*   Antes ~${money(before)}~` : `*${money(p.priceRetail)}*`);
  if (b.promo) lines.push(`🏷️ ${b.promo.name}${b.promo.code ? ` · código *${b.promo.code}*` : ""}`);
  else if (before) lines.push("🏷️ Precio de oferta");
  if (p.priceWholesale && p.minWholesale) lines.push(`Por mayor: desde ${p.minWholesale} unidades a ${money(p.priceWholesale)} c/u`);
  return lines.join("\n");
}

// Formato de WhatsApp → otros canales
const MARK = /(^|[\s(¡¿"'])([*_~])([^\s*_~](?:[^*_~\n]*[^\s*_~])?)\2(?=$|[\s).,!?:;"'])/g;
const stripFormat = t => String(t || "").replace(MARK, "$1$3");
const escHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toTelegramHtml = t => escHtml(t).replace(MARK, (m, pre, k, x) => `${pre}<${{ "*": "b", "_": "i", "~": "s" }[k]}>${x}</${{ "*": "b", "_": "i", "~": "s" }[k]}>`);

module.exports = { productCard, bullets, splitName, stripFormat, toTelegramHtml };

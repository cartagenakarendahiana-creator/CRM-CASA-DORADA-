// Ficha de producto con formato fijo y elegante (formato de WhatsApp: *negrita*, _cursiva_, ~tachado~),
// y conversión de ese formato para los canales que no lo entienden (Telegram usa HTML; Messenger, Instagram: texto limpio).
const PROMOS = require("./promos");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

// Hasta 3 puntos cortos a partir de la descripción ("50% microfibra, 50% algodón. Liviana y suave" → 2 puntos)
function bullets(desc) {
  return String(desc || "").split(/[.;\n•·]+/).map(x => x.trim().replace(/^[-–]\s*/, "")).filter(x => x.length > 2)
    .slice(0, 3).map(x => "▫️ " + (x[0].toUpperCase() + x.slice(1)).slice(0, 90));
}
function productCard(p, promos = []) {
  const b = PROMOS.bestPrice(p, 1, p.priceRetail || 0, promos);
  const before = p.compareAt > p.priceRetail ? p.compareAt : b.promo ? p.priceRetail : 0;
  const lines = [`*${String(p.name || "").trim()}*`];
  if (p.category) lines.push(`_${p.category}_`);
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

module.exports = { productCard, bullets, stripFormat, toTelegramHtml };

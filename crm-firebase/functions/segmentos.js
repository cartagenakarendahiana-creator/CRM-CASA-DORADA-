// Segmentos de contactos (colección segments). Dos tipos:
//  - manual: los contactos con la etiqueta del segmento (se agregan desde cada chat)
//  - dinamico: se llenan solos con reglas y siempre están al día:
//    { minOrders, minSpent, boughtWithinDays, notBoughtDays, neverBought, pipeline, stage, tag, origin, channel, quietDays }
//    origin: anuncio · comentario · web · organico
const DAY = 864e5;
const chOf = c => c.lastChannel || (c.phone ? "whatsapp" : "web");

// Compras por contacto a partir de los pedidos (sin cancelados): { [contactId]: { n, spent, last } }
function orderStats(orders) {
  const st = {};
  for (const o of orders || []) {
    if (!o.contactId || o.status === "Cancelado") continue;
    const s = st[o.contactId] || (st[o.contactId] = { n: 0, spent: 0, last: 0 });
    s.n++; s.spent += Number(o.total) || 0; s.last = Math.max(s.last, o.createdAt || 0);
  }
  return st;
}
function originOf(c) { return c.ad ? "anuncio" : c.comment ? "comentario" : c.webFunnel || /^web_/.test(c.id || "") ? "web" : "organico"; }

function inSegment(c, seg, stats = {}, now = Date.now()) {
  if (!c || !seg || c.archived) return false;
  if (seg.type === "manual") return (c.tags || []).includes(seg.name);
  const r = seg.rules || {}, s = stats[c.id] || { n: 0, spent: 0, last: 0 };
  const last = Math.max(s.last, c.lastPurchaseAt || 0), n = Math.max(s.n, c.lastPurchaseAt && !s.n ? 1 : 0);
  if (r.minOrders && n < Number(r.minOrders)) return false;
  if (r.minSpent && s.spent < Number(r.minSpent)) return false;
  if (r.neverBought && n > 0) return false;
  if (r.boughtWithinDays && !(last && now - last <= r.boughtWithinDays * DAY)) return false;
  if (r.notBoughtDays && !(last && now - last > r.notBoughtDays * DAY)) return false;
  if (r.pipeline && (c.pipeline || "ventas") !== r.pipeline) return false;
  if (r.stage && (c.stage || "Nuevo") !== r.stage) return false;
  if (r.tag && !(c.tags || []).includes(r.tag)) return false;
  if (r.origin && originOf(c) !== r.origin) return false;
  if (r.channel && chOf(c) !== r.channel) return false;
  if (r.quietDays && now - Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0) < r.quietDays * DAY) return false;
  return true;
}
module.exports = { orderStats, inSegment, originOf };

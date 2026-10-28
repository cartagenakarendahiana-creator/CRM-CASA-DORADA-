// Carritos abandonados de Shopify: se guardan en carts/{token}, se marcan como recuperados cuando llega el pedido
// y, si está activo, se le escribe al cliente una hora después (de 8 a. m. a 8 p. m.), una sola vez por carrito.
// settings/carritos: { auto, templateId, text, toAll }
//  - templateId: plantilla del CRM aprobada en WhatsApp (para cuando no hay ventana de 24 h abierta)
//  - toAll: también a quien no ha dado permiso (no ha escrito ni aceptó publicidad en la tienda); nunca a quien pidió no recibir
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const firstName = s => String(s || "").trim().split(/\s+/)[0] || "";
const hourBogota = ms => Number(new Date(ms).toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false })) % 24;
const DEFAULT_TEXT = "Hola {nombre} 😊 Vimos que dejaste {producto} en tu carrito. Si te quedó alguna duda te ayudo con gusto. Puedes terminar tu compra aquí: {enlace}";

function cartFrom(body, contactId, now) {
  const items = (body.line_items || []).map(i => ({ name: [i.title, i.variant_title].filter(Boolean).join(" · ").slice(0, 160), qty: Number(i.quantity) || 1, price: Math.round(Number(i.price) || 0) }));
  const addr = body.shipping_address || {}, cust = body.customer || {};
  return { token: String(body.token || body.id), contactId, items, total: Math.round(Number(body.total_price) || items.reduce((s, i) => s + i.qty * i.price, 0)),
    url: String(body.abandoned_checkout_url || "").slice(0, 600), name: String(addr.name || [cust.first_name, cust.last_name].filter(Boolean).join(" ") || "").slice(0, 120),
    phone: String(body.phone || addr.phone || cust.phone || "").slice(0, 30), email: String(body.email || cust.email || "").slice(0, 120),
    consent: !!(body.buyer_accepts_marketing || cust.accepts_marketing), updatedAt: now };
}
// Valores para el texto y para las variables de la plantilla
function values(cart, contact, empresa) {
  const first = cart.items[0];
  const producto = first ? first.name.split(" · ")[0] + (cart.items.length > 1 ? ` y ${cart.items.length - 1} producto${cart.items.length > 2 ? "s" : ""} más` : "") : "tus productos";
  return { nombre: firstName(contact.name || cart.name) || "", producto, total: money(cart.total), enlace: cart.url || "", empresa: empresa || "Casa Dorada",
    asesor: firstName(contact.owner), precio: money(cart.total) };
}
const fill = (text, v) => String(text || "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\s+([,!.?])/g, "$1").replace(/Hola\s+😊/, "Hola 😊");

module.exports = function carritos({ db, send }) {
  async function save(body, contactId, now = Date.now()) {
    const c = cartFrom(body, contactId, now);
    const ref = db.doc("carts/" + c.token.replace(/[\/]/g, "_"));
    const s = await ref.get();
    if (s.exists && s.get("status") === "recuperado") return "ya recuperado";
    await ref.set({ ...c, ...(s.exists ? {} : { createdAt: now, status: "abierto" }) }, { merge: true });
    return s.exists ? "carrito actualizado" : "carrito nuevo";
  }
  // El pedido llegó: el carrito de ese checkout (o el último abierto del cliente) queda recuperado
  async function recovered(body, contactId, orderId, now = Date.now()) {
    let ref = body.checkout_token ? db.doc("carts/" + String(body.checkout_token).replace(/[\/]/g, "_")) : null;
    if (!ref || !(await ref.get()).exists) {
      const open = await db.collection("carts").where("contactId", "==", contactId).get().catch(() => ({ docs: [] }));
      const last = open.docs.filter(d => d.get("status") !== "recuperado").sort((a, b) => (b.get("createdAt") || 0) - (a.get("createdAt") || 0))[0];
      ref = last ? last.ref : null;
    }
    if (!ref) return null;
    const s = await ref.get();
    await ref.set({ status: "recuperado", recoveredAt: now, orderId, orderTotal: Math.round(Number(body.total_price) || 0), afterReminder: !!(s.exists && s.get("remindedAt")) }, { merge: true });
    return ref.id;
  }
  // Recordatorio a un carrito (automático o con el botón)
  async function remind(id, { manual = false, byName = "Recordatorio de carrito", cfg, now = Date.now() } = {}) {
    const ref = db.doc("carts/" + id), s = await ref.get();
    if (!s.exists) throw new Error("El carrito no existe.");
    const cart = s.data();
    if (cart.status === "recuperado") throw new Error("Ese carrito ya se convirtió en compra.");
    if (cart.remindedAt && !manual) return "ya recordado";
    cfg = cfg || ((await db.doc("settings/carritos").get()).data() || {});
    const cref = db.doc("contacts/" + cart.contactId), contact = (await cref.get()).data();
    if (!contact) throw new Error("El cliente ya no existe.");
    if (contact.optOut) throw new Error("El cliente pidió no recibir mensajes.");
    if ((contact.lastPurchaseAt || 0) > (cart.createdAt || 0)) { await ref.set({ status: "recuperado", recoveredAt: contact.lastPurchaseAt }, { merge: true }); return "ya compró"; }
    const v = values(cart, contact, cfg.empresa);
    const text = fill(cfg.text || DEFAULT_TEXT, v);
    let template = null;
    if (cfg.templateId) {
      const t = (await db.doc("templates/" + cfg.templateId).get()).data();
      if (t && t.waName && (!t.waStatus || t.waStatus === "APPROVED")) template = { name: t.waName, lang: t.waLang || "es", params: (t.waParams || []).map(k => v[k] || "-") };
    }
    await send({ cref, contact, text, template, byName });
    await ref.set({ remindedAt: now, reminderBy: byName, reminderError: null, status: "recordado" }, { merge: true });
    return "recordado";
  }
  // Cada 15 minutos: carritos de entre 1 y 48 horas, sin recordar, de 8 a. m. a 8 p. m.
  async function sweep(now = Date.now()) {
    const cfg = (await db.doc("settings/carritos").get()).data() || {};
    if (!cfg.auto) return { off: true };
    const h = hourBogota(now);
    if (h < 8 || h >= 20) return { fuera_de_horario: true };
    const snap = await db.collection("carts").where("status", "==", "abierto").get();
    const out = { recordados: 0, saltados: 0, errores: 0 };
    for (const d of snap.docs) {
      const c = d.data(), age = now - (c.createdAt || now);
      if (age < HOUR || age > 2 * DAY || c.remindedAt || !c.phone && !c.contactId) continue;
      const contact = (await db.doc("contacts/" + c.contactId).get()).data() || {};
      const permiso = c.consent || !!contact.lastInboundAt;
      if (!permiso && !cfg.toAll) { out.saltados++; continue; }
      try { (await remind(d.id, { cfg, now })) === "recordado" ? out.recordados++ : out.saltados++; }
      catch (e) { out.errores++; await d.ref.set({ reminderError: String(e.message).slice(0, 200), remindedAt: now }, { merge: true }); }
    }
    return out;
  }
  return { save, recovered, remind, sweep };
};
Object.assign(module.exports, { cartFrom, values, fill, hourBogota, DEFAULT_TEXT });

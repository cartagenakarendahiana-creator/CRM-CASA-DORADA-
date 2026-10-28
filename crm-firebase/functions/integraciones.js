// Integraciones: webhooks salientes (avisar a Zapier, Make, n8n, tu tienda o tu ERP cuando pasa algo)
// y una API sencilla con clave para crear contactos, notas y pedidos desde otros sistemas.
// Configuración en private/integrations: { webhooks: [{ id, url, events, secret, lastStatus, lastAt }], apiKeyHash, apiKeyHint }
const crypto = require("crypto");

const EVENTS = {
  "contacto.creado": "Contacto nuevo",
  "mensaje.recibido": "Mensaje recibido",
  "etapa.cambiada": "Cambio de etapa",
  "cotizacion.creada": "Cotización creada",
  "pedido.creado": "Pedido creado",
};
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const C_KEYS = ["name", "phone", "email", "company", "cargo", "city", "segment", "type", "stage", "temperature", "owner", "looking", "tags", "nextDate", "nextAction", "obs", "source"];

module.exports = function integraciones({ db, admin, fetchFn = (...a) => fetch(...a), phoneId }) {
  let cache = null, cacheAt = 0;
  async function cfg(fresh) {
    if (!fresh && cache && Date.now() - cacheAt < 60000) return cache;
    const s = await db.doc("private/integrations").get();
    cache = s.exists ? s.data() : {}; cacheAt = Date.now();
    return cache;
  }

  // ---------- Webhooks salientes ----------
  async function post(h, event, data) {
    const body = JSON.stringify({ event, at: new Date().toISOString(), data });
    const sig = "sha256=" + crypto.createHmac("sha256", h.secret || "").update(body).digest("hex");
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetchFn(h.url, { method: "POST", headers: { "Content-Type": "application/json", "X-HouseChat-Event": event, "X-HouseChat-Signature": sig }, body, signal: ctrl.signal });
      return r.status;
    } catch (e) { return "error: " + (e.name === "AbortError" ? "sin respuesta en 8 s" : e.message); }
    finally { clearTimeout(t); }
  }
  async function emit(event, data) {
    const hooks = ((await cfg()).webhooks || []).filter(h => h.url && (h.events || []).includes(event));
    if (!hooks.length) return 0;
    const results = await Promise.all(hooks.map(h => post(h, event, data)));
    const all = (await cfg(true)).webhooks || [];
    hooks.forEach((h, i) => { const x = all.find(w => w.id === h.id); if (x) Object.assign(x, { lastStatus: String(results[i]), lastAt: Date.now(), lastEvent: event }); });
    await db.doc("private/integrations").set({ webhooks: all }, { merge: true });
    cache = null;
    return hooks.length;
  }
  const contactOut = (id, c) => ({ id, ...pick(c, C_KEYS), channel: c.lastChannel || (c.phone ? "whatsapp" : ""), createdAt: c.createdAt || null });

  // ---------- Gestión desde la app (solo administradora) ----------
  async function manage(action, data = {}) {
    const c = await cfg(true);
    const hooks = c.webhooks || [];
    const pub = () => ({ webhooks: hooks.map(h => ({ id: h.id, url: h.url, events: h.events || [], lastStatus: h.lastStatus || "", lastAt: h.lastAt || 0, secret: h.secret })),
      apiKeyHint: c.apiKeyHint || "", events: EVENTS });
    if (action === "get") return pub();
    if (action === "saveWebhook") {
      const url = String(data.url || "").trim();
      if (!/^https:\/\/[^\s]+$/.test(url)) throw new Error("La URL debe empezar por https://");
      const events = (data.events || []).filter(e => EVENTS[e]);
      if (!events.length) throw new Error("Elige al menos un evento.");
      const ex = hooks.find(h => h.id === data.id);
      if (ex) Object.assign(ex, { url, events });
      else hooks.push({ id: crypto.randomBytes(6).toString("hex"), url, events, secret: crypto.randomBytes(16).toString("hex") });
      await db.doc("private/integrations").set({ webhooks: hooks }, { merge: true }); cache = null;
      return pub();
    }
    if (action === "deleteWebhook") {
      await db.doc("private/integrations").set({ webhooks: hooks.filter(h => h.id !== data.id) }, { merge: true }); cache = null;
      c.webhooks = hooks.filter(h => h.id !== data.id); return { ...pub(), webhooks: pub().webhooks.filter(h => h.id !== data.id) };
    }
    if (action === "testWebhook") {
      const h = hooks.find(x => x.id === data.id);
      if (!h) throw new Error("Ese webhook no existe.");
      const st = await post(h, "prueba", { mensaje: "Prueba desde House Chat", at: Date.now() });
      h.lastStatus = String(st); h.lastAt = Date.now();
      await db.doc("private/integrations").set({ webhooks: hooks }, { merge: true }); cache = null;
      return { status: st };
    }
    if (action === "newApiKey") {
      const key = "hc_" + crypto.randomBytes(24).toString("base64url");
      await db.doc("private/integrations").set({ apiKeyHash: sha(key), apiKeyHint: key.slice(0, 6) + "…" + key.slice(-4), apiKeyAt: Date.now() }, { merge: true }); cache = null;
      return { key }; // se muestra una sola vez
    }
    if (action === "revokeApiKey") {
      await db.doc("private/integrations").set({ apiKeyHash: admin.firestore.FieldValue.delete(), apiKeyHint: admin.firestore.FieldValue.delete() }, { merge: true }); cache = null;
      return { ok: true };
    }
    throw new Error("Acción desconocida.");
  }

  // ---------- API entrante ----------
  async function api(req, res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");
    res.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    const key = String(req.get("x-api-key") || (req.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    const c = await cfg();
    if (!key || !c.apiKeyHash || sha(key) !== c.apiKeyHash) return res.status(401).json({ error: "Clave de API inválida." });
    const parts = String(req.path || "/").split("/").filter(Boolean);
    while (parts[0] === "api" || parts[0] === "v1") parts.shift();
    const [col, id, sub] = parts, b = req.body || {};
    const now = Date.now();

    if (col === "contacts" && !id && req.method === "GET") {
      let q = db.collection("contacts");
      if (req.query.phone) q = q.where("phone", "==", "+" + phoneId(req.query.phone));
      else if (req.query.email) q = q.where("email", "==", String(req.query.email).trim().toLowerCase());
      const snap = await q.limit(Math.min(100, Number(req.query.limit) || 50)).get();
      return res.json({ data: snap.docs.map(d => contactOut(d.id, d.data())) });
    }
    if (col === "contacts" && !id && req.method === "POST") {
      const data = pick(b, C_KEYS);
      if (!data.name && !data.phone && !data.email) return res.status(400).json({ error: "Envía al menos name, phone o email." });
      if (data.phone) data.phone = "+" + phoneId(data.phone);
      if (data.email) data.email = String(data.email).trim().toLowerCase();
      if (data.tags && !Array.isArray(data.tags)) data.tags = String(data.tags).split(",").map(t => t.trim()).filter(Boolean);
      let cid = data.phone ? "wa_" + phoneId(data.phone) : null;
      if (!cid && data.email) { const s = await db.collection("contacts").where("email", "==", data.email).limit(1).get(); if (s.docs.length) cid = s.docs[0].id; }
      const ref = cid ? db.doc("contacts/" + cid) : db.collection("contacts").doc();
      const ex = await ref.get();
      const patch = { ...data, updatedAt: now, updatedBy: "API" };
      if (!ex.exists) Object.assign(patch, { stage: data.stage || "Nuevo", type: data.type || "Prospecto", segment: data.segment || "API", source: data.source || "API", createdAt: now, stageAt: now, unread: 0, owner: patch.owner || "" });
      await ref.set(patch, { merge: true });
      if (b.note) await ref.collection("messages").add({ dir: "note", text: String(b.note).slice(0, 2000), ts: now, by: "api", byName: "API" });
      return res.status(ex.exists ? 200 : 201).json({ id: ref.id, created: !ex.exists });
    }
    if (col === "contacts" && id && !sub && (req.method === "PATCH" || req.method === "GET")) {
      const ref = db.doc("contacts/" + id), s = await ref.get();
      if (!s.exists) return res.status(404).json({ error: "No existe ese contacto." });
      if (req.method === "GET") return res.json({ data: contactOut(id, s.data()) });
      const data = pick(b, C_KEYS);
      if (data.stage && data.stage !== s.get("stage")) data.stageAt = now;
      await ref.set({ ...data, updatedAt: now, updatedBy: "API" }, { merge: true });
      return res.json({ id, updated: Object.keys(data) });
    }
    if (col === "contacts" && id && sub === "notes" && req.method === "POST") {
      const ref = db.doc("contacts/" + id);
      if (!(await ref.get()).exists) return res.status(404).json({ error: "No existe ese contacto." });
      if (!String(b.text || "").trim()) return res.status(400).json({ error: "Falta text." });
      await ref.collection("messages").add({ dir: "note", text: String(b.text).slice(0, 2000), ts: now, by: "api", byName: "API" });
      return res.status(201).json({ ok: true });
    }
    if (col === "products" && req.method === "GET") {
      const snap = await db.collection("products").get();
      return res.json({ data: snap.docs.map(d => ({ id: d.id, ...pick(d.data(), ["name", "category", "desc", "priceRetail", "priceWholesale", "minWholesale", "active"]) })).filter(p => p.active !== false) });
    }
    if (col === "orders" && !id && req.method === "POST") {
      let contactId = b.contactId;
      if (!contactId && b.phone) contactId = "wa_" + phoneId(b.phone);
      const cs = contactId ? await db.doc("contacts/" + contactId).get() : null;
      if (!cs || !cs.exists) return res.status(400).json({ error: "Envía un contactId o phone de un contacto existente." });
      const items = (Array.isArray(b.items) ? b.items : []).map(i => ({ productId: String(i.productId || ""), name: String(i.name || ""), qty: Number(i.qty) || 1, price: Number(i.price) || 0 })).filter(i => i.name);
      if (!items.length) return res.status(400).json({ error: "El pedido necesita items con name, qty y price." });
      const total = Number(b.total) || items.reduce((s, i) => s + i.qty * i.price, 0);
      const oref = db.collection("orders").doc();
      const number = await db.runTransaction(async t => {
        const cr = db.doc("counters/orders"), s = await t.get(cr), n = (s.exists ? s.get("n") || 0 : 0) + 1, num = "PED-" + String(n).padStart(4, "0");
        t.set(cr, { n });
        t.set(oref, { contactId, contactName: cs.get("name") || cs.get("company") || "", items, total, status: b.status || "Nuevo", payment: b.payment || "Pendiente",
          notes: String(b.notes || "").slice(0, 1000), number: num, source: "API", createdAt: now, createdByName: "API", updatedAt: now, updatedBy: "API" });
        return num;
      });
      await db.doc("contacts/" + contactId).set({ lastPurchaseAt: now, type: "Cliente", updatedAt: now, updatedBy: "API" }, { merge: true });
      return res.status(201).json({ id: oref.id, number, total });
    }
    return res.status(404).json({ error: "Ruta no encontrada. Usa /api/v1/contacts, /api/v1/contacts/{id}/notes, /api/v1/products o /api/v1/orders." });
  }

  return { emit, manage, api, contactOut, EVENTS };
};
module.exports.EVENTS = EVENTS;

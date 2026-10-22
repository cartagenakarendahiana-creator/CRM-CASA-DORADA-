// Aplicaciones conectadas: Shopify (pedidos, clientes, carritos y productos) y Siigo (clientes y facturas).
// Mastershop sincroniza sus pedidos con Shopify, así que llegan por el mismo camino.
// Claves en private/apps (solo funciones); estado público en settings/apps.
const crypto = require("crypto");

const SHOPIFY_API = "2026-07";
const SIIGO = "https://api.siigo.com";
const DAY = 864e5;
const isoDay = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const stripHtml = s => String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

module.exports = function apps({ db, admin, phoneId, fetchFn = (...a) => fetch(...a) }) {
  let cache = null, cacheAt = 0;
  async function cfg(fresh) {
    if (!fresh && cache && Date.now() - cacheAt < 60000) return cache;
    const s = await db.doc("private/apps").get();
    cache = s.exists ? s.data() : {}; cacheAt = Date.now();
    return cache;
  }
  const setPub = data => db.doc("settings/apps").set(data, { merge: true });
  const setPriv = async data => { await db.doc("private/apps").set(data, { merge: true }); cache = null; };

  // ---------- Shopify ----------
  function shopifyValid(req, secret) {
    const sig = req.get("x-shopify-hmac-sha256") || "";
    if (!secret || !sig || !req.rawBody) return false;
    const exp = crypto.createHmac("sha256", secret).update(req.rawBody).digest("base64");
    const a = Buffer.from(sig), b = Buffer.from(exp);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // Busca o crea el contacto del cliente de Shopify (por celular o correo)
  async function upsertCustomer(c = {}, extra = {}, src = "Shopify") {
    const addr = c.default_address || extra.address || c.shipping_address || {};
    const phoneRaw = c.phone || addr.phone || extra.phone || "";
    const pid = phoneRaw ? phoneId(phoneRaw) : "";
    const email = String(c.email || extra.email || "").trim().toLowerCase();
    const name = [c.first_name || addr.first_name, c.last_name || addr.last_name].filter(Boolean).join(" ").trim() || extra.name || "";
    let ref = pid && pid.length >= 8 ? db.doc("contacts/wa_" + pid) : null;
    if (!ref && email) { const q = await db.collection("contacts").where("email", "==", email).limit(1).get(); if (q.docs.length) ref = db.doc("contacts/" + q.docs[0].id); }
    if (!ref) ref = db.collection("contacts").doc();
    const ex = await ref.get(), now = Date.now();
    const patch = { updatedAt: now, updatedBy: src, shopifyCustomerId: c.id ? String(c.id) : (ex.exists ? ex.get("shopifyCustomerId") || "" : "") };
    if (pid && pid.length >= 8 && !(ex.exists && ex.get("phone"))) patch.phone = "+" + pid;
    if (email && !(ex.exists && ex.get("email"))) patch.email = email;
    if (name && !(ex.exists && ex.get("name"))) patch.name = name;
    if (addr.city && !(ex.exists && ex.get("city"))) patch.city = addr.city;
    if (addr.company && !(ex.exists && ex.get("company"))) patch.company = addr.company;
    if (!ex.exists) Object.assign(patch, { type: "Prospecto", segment: "Tienda en línea", stage: "Nuevo", stageAt: now, source: src, createdAt: now, unread: 0 });
    await ref.set(patch, { merge: true });
    return { ref, existed: ex.exists };
  }
  const payOf = fs => ({ paid: "Pagado", partially_paid: "Abono", refunded: "Pendiente", partially_refunded: "Pagado" }[fs] || "Pendiente");
  async function shopifyEvent(topic, body) {
    const now = Date.now();
    if (topic === "orders/create" || topic === "orders/paid" || topic === "orders/updated") {
      const oref = db.doc("orders/shp_" + body.id), ex = await oref.get();
      if (ex.exists) { // ya existe: solo actualiza pago y estado
        const patch = { payment: payOf(body.financial_status), updatedAt: now, updatedBy: "Shopify" };
        if (body.cancelled_at) patch.status = "Cancelado"; else if (body.fulfillment_status === "fulfilled" && ex.get("status") === "Nuevo") patch.status = "Enviado";
        await oref.set(patch, { merge: true });
        return "pedido actualizado";
      }
      if (topic === "orders/updated") return "ignorado";
      const { ref } = await upsertCustomer(body.customer || {}, { phone: body.phone || (body.shipping_address || {}).phone, email: body.email || body.contact_email,
        name: (body.shipping_address || {}).name, address: body.shipping_address || body.billing_address }, "Shopify");
      const items = (body.line_items || []).map(i => ({ productId: i.product_id ? "shp_" + i.product_id : "", name: [i.title, i.variant_title].filter(Boolean).join(" · "), qty: Number(i.quantity) || 1, price: Number(i.price) || 0 }));
      const total = Math.round(Number(body.total_price) || items.reduce((s, i) => s + i.qty * i.price, 0));
      const cs = (await ref.get()).data() || {};
      const addr = body.shipping_address || {};
      const number = await db.runTransaction(async t => {
        const cr = db.doc("counters/orders"), s = await t.get(cr), n = (s.exists ? s.get("n") || 0 : 0) + 1, num = "PED-" + String(n).padStart(4, "0");
        t.set(cr, { n });
        t.set(oref, { number: num, source: "Shopify", shopifyName: body.name || "", shopifyId: String(body.id), contactId: ref.id, contactName: cs.name || cs.company || addr.name || "",
          items, total, status: body.cancelled_at ? "Cancelado" : "Nuevo", payment: payOf(body.financial_status),
          notes: [addr.address1, addr.address2, addr.city, addr.province].filter(Boolean).join(", ") + (body.note ? "\nNota: " + body.note : ""),
          createdAt: now, createdByName: "Shopify", updatedAt: now, updatedBy: "Shopify" });
        return num;
      });
      await ref.set({ type: "Cliente", lastPurchaseAt: now, stage: (cs.pipeline || "ventas") === "ventas" ? "Ganado" : cs.stage || "Nuevo", stageAt: now,
        tags: admin.firestore.FieldValue.arrayRemove("Carrito abandonado"), updatedAt: now, updatedBy: "Shopify" }, { merge: true });
      await ref.collection("messages").add({ dir: "note", ts: now, by: "shopify", byName: "Shopify",
        text: `🛍️ Compró en Shopify ${body.name || ""} por $${total.toLocaleString("es-CO")} (${number}).\n` + items.map(i => `• ${i.qty} × ${i.name}`).join("\n") });
      await setPub({ shopify: { lastAt: now, orders: admin.firestore.FieldValue.increment(1) } });
      return "pedido " + number;
    }
    if (topic === "customers/create") { await upsertCustomer(body, {}, "Shopify"); return "cliente"; }
    if (topic === "checkouts/create" || topic === "checkouts/update") {
      if (!body.phone && !body.email && !(body.customer || {}).phone && !(body.shipping_address || {}).phone) return "carrito sin datos";
      const { ref } = await upsertCustomer(body.customer || {}, { phone: body.phone || (body.shipping_address || {}).phone, email: body.email, name: (body.shipping_address || {}).name, address: body.shipping_address }, "Shopify");
      const items = (body.line_items || []).map(i => `• ${i.quantity} × ${i.title}`).join("\n");
      const c = (await ref.get()).data() || {};
      if ((c.lastPurchaseAt || 0) > now - 3600e3) return "ya compró";
      if (c.lastCheckout === String(body.token || body.id)) return "carrito repetido";
      await ref.set({ lastCheckout: String(body.token || body.id), tags: admin.firestore.FieldValue.arrayUnion("Carrito abandonado"),
        nextDate: isoDay(now + DAY), nextAction: "Recuperar carrito de Shopify" + (body.abandoned_checkout_url ? ": " + body.abandoned_checkout_url : ""), updatedAt: now, updatedBy: "Shopify" }, { merge: true });
      await ref.collection("messages").add({ dir: "note", ts: now, by: "shopify", byName: "Shopify", text: `🛒 Inició una compra en Shopify por $${Math.round(Number(body.total_price) || 0).toLocaleString("es-CO")} sin terminarla.\n${items}` });
      return "carrito";
    }
    return "tema no usado";
  }
  async function shopifyWebhook(req, res) {
    const c = (await cfg()).shopify || {};
    if (!shopifyValid(req, c.secret)) return res.sendStatus(401);
    const out = await shopifyEvent(String(req.get("x-shopify-topic") || ""), req.body || {});
    res.status(200).json({ ok: true, out });
  }
  // Guarda un producto de Shopify. Si tiene variantes con precios distintos (tallas, medidas), crea una ficha por variante.
  async function saveShopifyProduct(p, active) {
    const vs = (p.variants || []).length ? p.variants : [{}];
    const multi = vs.length > 1 && new Set(vs.map(v => Number(v.price) || 0)).size > 1;
    const base = { category: p.product_type || "", desc: stripHtml(p.body_html).slice(0, 200), active, source: "Shopify", updatedAt: Date.now(), updatedBy: "Shopify" };
    for (const v of multi ? vs : [vs[0]]) {
      const vt = multi && v.title && v.title !== "Default Title" ? " · " + v.title : "";
      await db.doc("products/shp_" + p.id + (multi ? "_" + v.id : "")).set({ ...base, name: p.title + vt, priceRetail: Math.round(Number(v.price) || 0), sku: v.sku || "" }, { merge: true });
    }
    return multi ? vs.length : 1;
  }
  // Con token de Admin usa la API; sin token lee el catálogo público de la tienda (tienda.com/products.json)
  async function shopifyImport() {
    const c = (await cfg(true)).shopify || {};
    if (!c.shop) throw new Error("Primero conecta la tienda de Shopify.");
    let n = 0;
    if (c.token) {
      let url = `https://${c.shop}/admin/api/${SHOPIFY_API}/products.json?limit=250&status=active`, pages = 0;
      while (url && pages++ < 20) {
        const r = await fetchFn(url, { headers: { "X-Shopify-Access-Token": c.token, "Content-Type": "application/json" } });
        if (!r.ok) throw new Error(r.status === 401 ? "Shopify rechazó el token de acceso." : "Shopify respondió " + r.status);
        const j = await r.json();
        for (const p of j.products || []) n += await saveShopifyProduct(p, p.status !== "archived");
        const link = (r.headers && r.headers.get && r.headers.get("link")) || "";
        const m = link.match(/<([^>]+)>;\s*rel="next"/);
        url = m ? m[1] : null;
      }
    } else {
      for (let page = 1; page <= 40; page++) {
        const r = await fetchFn(`https://${c.shop}/products.json?limit=250&page=${page}`, { headers: { Accept: "application/json" } });
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (!j || !Array.isArray(j.products)) {
          if (page === 1) throw new Error("No se pudo leer el catálogo público de la tienda. Si la tienda tiene contraseña, quítala o usa un token de Admin.");
          break;
        }
        if (!j.products.length) break;
        for (const p of j.products) n += await saveShopifyProduct(p, true);
      }
    }
    await setPub({ shopify: { productsAt: Date.now(), products: n } });
    return { products: n };
  }

  // ---------- Siigo ----------
  async function siigoToken(c) {
    if (c.tok && c.tokExp > Date.now() + 60000) return c.tok;
    const r = await fetchFn(`${SIIGO}/auth`, { method: "POST", headers: { "Content-Type": "application/json", "Partner-Id": c.partnerId || "HouseChat" },
      body: JSON.stringify({ username: c.username, access_key: c.accessKey }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error("Siigo no aceptó el usuario o la clave de acceso de la API.");
    c.tok = j.access_token; c.tokExp = Date.now() + ((Number(j.expires_in) || 3600) - 120) * 1000;
    await setPriv({ siigo: { ...c } });
    return c.tok;
  }
  async function siigo(c, method, path, body) {
    const tok = await siigoToken(c);
    const r = await fetchFn(SIIGO + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, "Partner-Id": c.partnerId || "HouseChat" },
      body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = (j.Errors || j.errors || [])[0] || {}; throw new Error("Siigo: " + (e.Message || e.message || j.message || "error " + r.status) + (e.Params ? " (" + [].concat(e.Params).join(", ") + ")" : "")); }
    return j;
  }
  async function siigoCustomer(c, contact) {
    const ident = String(contact.docId || "").replace(/[^\dA-Za-z]/g, "");
    if (!ident) throw new Error("Al contacto le falta el documento (cédula o NIT). Escríbelo en su ficha.");
    const found = await siigo(c, "GET", "/v1/customers?identification=" + encodeURIComponent(ident));
    if ((found.results || []).length) return ident;
    const company = (contact.docType || "CC") === "NIT";
    const fullName = String(contact.name || contact.company || "Cliente").trim();
    const [first, ...rest] = fullName.split(/\s+/);
    await siigo(c, "POST", "/v1/customers", {
      type: "Customer", person_type: company ? "Company" : "Person", id_type: company ? "31" : "13", identification: ident,
      name: company ? [contact.company || fullName] : [first, rest.join(" ") || first],
      address: { address: contact.address || "Sin dirección", city: { country_code: "Co", state_code: c.stateCode || "05", city_code: c.cityCode || "05001" } },
      phones: contact.phone ? [{ number: String(contact.phone).replace(/\D/g, "").slice(-10) }] : [],
      contacts: [{ first_name: first, last_name: rest.join(" ") || first, email: contact.email || "" }],
    });
    return ident;
  }
  async function siigoInvoice(orderId) {
    const c = (await cfg(true)).siigo || {};
    if (!c.username || !c.accessKey) throw new Error("Siigo no está conectado.");
    if (!c.documentId || !c.paymentId) throw new Error("Falta configurar el tipo de comprobante y la forma de pago de Siigo.");
    const oref = db.doc("orders/" + orderId), o = (await oref.get()).data();
    if (!o) throw new Error("El pedido no existe.");
    if (o.siigoId) throw new Error("Este pedido ya tiene factura en Siigo: " + (o.siigoName || o.siigoId));
    const contact = (await db.doc("contacts/" + o.contactId).get()).data() || {};
    const ident = await siigoCustomer(c, contact);
    const prods = (await db.collection("products").get()).docs.reduce((m, d) => (m[d.id] = d.data(), m), {});
    const rate = Number(c.ivaRate) || 0, incl = c.pricesIncludeIva !== false;
    const items = (o.items || []).map(i => {
      const p = prods[i.productId] || {};
      const price = rate && incl ? +(i.price / (1 + rate / 100)).toFixed(2) : i.price;
      return { code: p.sku || c.defaultCode || "", description: i.name, quantity: i.qty, price, ...(c.ivaId ? { taxes: [{ id: Number(c.ivaId) }] } : {}) };
    });
    if (items.some(i => !i.code)) throw new Error("Hay productos sin referencia de Siigo. Escribe la referencia en Productos o configura un código por defecto.");
    const subtotal = items.reduce((s, i) => s + i.quantity * i.price, 0);
    const total = +(c.ivaId && rate ? subtotal * (1 + rate / 100) : subtotal).toFixed(2);
    const inv = await siigo(c, "POST", "/v1/invoices", {
      document: { id: Number(c.documentId) }, date: isoDay(Date.now()), customer: { identification: ident, branch_office: 0 },
      ...(c.sellerId ? { seller: Number(c.sellerId) } : {}), observations: `Pedido ${o.number}${o.shopifyName ? " · Shopify " + o.shopifyName : ""}`,
      items, payments: [{ id: Number(c.paymentId), value: total, due_date: isoDay(Date.now()) }],
      ...(c.sendDian ? { stamp: { send: true }, mail: { send: !!contact.email } } : {}),
    });
    await oref.set({ siigoId: inv.id || "", siigoName: inv.name || "", siigoAt: Date.now() }, { merge: true });
    return { id: inv.id, name: inv.name, total };
  }

  // ---------- Gestión (solo administradora) ----------
  async function manage(action, d = {}) {
    if (action === "saveShopify") {
      const shop = String(d.shop || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) throw new Error("Escribe el dominio de la tienda, por ejemplo casadorada.myshopify.com");
      const prev = (await cfg(true)).shopify || {};
      const secret = String(d.secret || "").trim() || prev.secret;
      if (!secret) throw new Error("Pega la clave de firma de los webhooks de Shopify.");
      await setPriv({ shopify: { shop, secret, token: String(d.token || "").trim() || prev.token || "" } });
      await setPub({ shopify: { on: true, shop, hasToken: !!(String(d.token || "").trim() || prev.token), at: Date.now() } });
      return { ok: true };
    }
    if (action === "importShopify") return shopifyImport();
    if (action === "saveSiigo") {
      const prev = (await cfg(true)).siigo || {};
      const c = { ...prev, username: String(d.username || prev.username || "").trim(), accessKey: String(d.accessKey || "").trim() || prev.accessKey, partnerId: String(d.partnerId || prev.partnerId || "").trim(),
        documentId: d.documentId, paymentId: d.paymentId, sellerId: d.sellerId, defaultCode: String(d.defaultCode || "").trim(), ivaId: d.ivaId, ivaRate: Number(d.ivaRate) || 0,
        pricesIncludeIva: d.pricesIncludeIva !== false, sendDian: !!d.sendDian, stateCode: String(d.stateCode || "05"), cityCode: String(d.cityCode || "05001"), tok: "", tokExp: 0 };
      if (!c.username || !c.accessKey) throw new Error("Escribe el usuario y la clave de acceso de la API de Siigo.");
      await siigoToken(c); // prueba la conexión
      await setPub({ siigo: { on: true, user: c.username, documentId: c.documentId || "", paymentId: c.paymentId || "", sellerId: c.sellerId || "", defaultCode: c.defaultCode,
        ivaId: c.ivaId || "", ivaRate: c.ivaRate, pricesIncludeIva: c.pricesIncludeIva, sendDian: c.sendDian, stateCode: c.stateCode, cityCode: c.cityCode, partnerId: c.partnerId, at: Date.now() } });
      return { ok: true };
    }
    if (action === "siigoInvoice") return siigoInvoice(String(d.orderId || ""));
    if (action === "setMastershop") { await setPub({ mastershop: { on: !!d.on, at: Date.now() } }); return { ok: true }; }
    if (action === "disconnect") {
      const k = d.app;
      if (!["shopify", "siigo"].includes(k)) throw new Error("Aplicación desconocida.");
      await setPriv({ [k]: admin.firestore.FieldValue.delete() });
      await setPub({ [k]: { on: false } });
      return { ok: true };
    }
    throw new Error("Acción desconocida.");
  }

  return { shopifyWebhook, shopifyEvent, shopifyValid, shopifyImport, siigoInvoice, manage };
};

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
  const CART = require("./carritos")({ db });
  const EMB = require("./embudos"); // carritos abandonados (el recordatorio lo envía index.js)
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
    if (!ex.exists) Object.assign(patch, { type: "Prospecto", segment: "Tienda en línea", stage: "Nuevo", stageAt: now, source: src, createdAt: now, unread: 0, owner: "" });
    await ref.set(patch, { merge: true });
    return { ref, existed: ex.exists };
  }
  // Envío del pedido en Shopify: guía, transportadora y enlace de rastreo (lo llena la app de envíos o quien despacha)
  function shipOf(body) {
    const f = (body.fulfillments || []).filter(x => x.status !== "cancelled").pop();
    if (!f && !body.fulfillment_status) return null;
    return { status: (f && f.shipment_status) || body.fulfillment_status || "", company: (f && f.tracking_company) || "", number: (f && (f.tracking_number || (f.tracking_numbers || [])[0])) || "",
      url: (f && (f.tracking_url || (f.tracking_urls || [])[0])) || "", at: Date.now() };
  }
  // ¿El pedido llegó desde Facebook o Instagram? (enlace con fbclid o utm, o la página de donde venía)
  function socialOf(body) {
    const t = [body.landing_site, body.referring_site, body.source_name, ...(body.note_attributes || []).map(n => n.name + "=" + n.value)].join(" ").toLowerCase();
    if (/instagram|utm_source=ig\b|[?&]igshid=/.test(t)) return "instagram";
    if (/facebook|fbclid=|utm_source=(fb|meta)\b/.test(t)) return "facebook";
    return "";
  }
  const payOf = fs => ({ paid: "Pagado", partially_paid: "Abono", refunded: "Pendiente", partially_refunded: "Pagado" }[fs] || "Pendiente");
  async function shopifyEvent(topic, body) {
    const now = Date.now();
    if (topic === "orders/create" || topic === "orders/paid" || topic === "orders/updated") {
      const oref = db.doc("orders/shp_" + body.id), ex = await oref.get();
      if (ex.exists) { // ya existe: solo actualiza pago y estado
        const patch = { payment: payOf(body.financial_status), updatedAt: now, updatedBy: "Shopify" };
        if (body.cancelled_at) patch.status = "Cancelado"; else if (body.fulfillment_status === "fulfilled" && ex.get("status") === "Nuevo") patch.status = "Enviado";
        const sh = shipOf(body); if (sh) patch.shipping = sh;
        await oref.set(patch, { merge: true });
        return "pedido actualizado";
      }
      if (topic === "orders/updated") return "ignorado";
      const { ref } = await upsertCustomer(body.customer || {}, { phone: body.phone || (body.shipping_address || {}).phone, email: body.email || body.contact_email,
        name: (body.shipping_address || {}).name, address: body.shipping_address || body.billing_address }, "Shopify");
      const items = (body.line_items || []).map(i => ({ productId: i.product_id ? "shp_" + i.product_id : "", name: [i.title, i.variant_title].filter(Boolean).join(" · "), qty: Number(i.quantity) || 1, price: Number(i.price) || 0 }));
      const total = Math.round(Number(body.total_price) || items.reduce((s, i) => s + i.qty * i.price, 0));
      const cs = (await ref.get()).data() || {};
      const addr = body.shipping_address || {}, shop = ((await cfg()).shopify || {}).shop || "";
      const number = await db.runTransaction(async t => {
        const cr = db.doc("counters/orders"), s = await t.get(cr), n = (s.exists ? s.get("n") || 0 : 0) + 1, num = "PED-" + String(n).padStart(4, "0");
        t.set(cr, { n });
        t.set(oref, { number: num, source: "Shopify", shopifyName: body.name || "", shopifyId: String(body.id), contactId: ref.id, contactName: cs.name || cs.company || addr.name || "",
          items, total, status: body.cancelled_at ? "Cancelado" : "Nuevo", payment: payOf(body.financial_status), ...(shipOf(body) ? { shipping: shipOf(body) } : {}),
          checkoutToken: String(body.checkout_token || ""), ...(socialOf(body) ? { adSource: socialOf(body) } : {}), shopifyUrl: shop ? `https://${shop}/admin/orders/${body.id}` : "",
          notes: [addr.address1, addr.address2, addr.city, addr.province].filter(Boolean).join(", ") + (body.note ? "\nNota: " + body.note : ""),
          createdAt: now, createdByName: "Shopify", updatedAt: now, updatedBy: "Shopify" });
        return num;
      });
      await CART.recovered(body, ref.id, oref.id, now).catch(e => console.error("carrito recuperado", e.message));
      await ref.set({ type: "Cliente", lastPurchaseAt: now, stage: (cs.pipeline || "ventas") === "ventas" ? "Ganado" : cs.stage || "Nuevo", stageAt: now,
        tags: admin.firestore.FieldValue.arrayRemove("Carrito abandonado"), updatedAt: now, updatedBy: "Shopify" }, { merge: true });
      await ref.collection("messages").add({ dir: "note", ts: now, by: "shopify", byName: "Shopify",
        text: `🛍️ Compró en Shopify ${body.name || ""} por $${total.toLocaleString("es-CO")} (${number}).\n` + items.map(i => `• ${i.qty} × ${i.name}`).join("\n") });
      await setPub({ shopify: { lastAt: now, orders: admin.firestore.FieldValue.increment(1) } });
      return "pedido " + number;
    }
    if (topic === "customers/create") { // se registró en la tienda: embudo "Registro en sitio web" (o Línea Hotelera si es un hotel)
      const { ref, existed } = await upsertCustomer(body, {}, "Shopify");
      if (!existed) {
        const list = ((await db.doc("settings/pipelines").get()).data() || {}).list || [];
        const addr = body.default_address || {}, hotel = EMB.isHotel(addr.company || "", body.note || "");
        const pp = EMB.findPipe(list, hotel ? "hoteles" : "registro");
        if (pp) await ref.set({ pipeline: pp.id, stage: (pp.stages || ["Nuevo"])[0], ...(hotel ? { segment: "Hoteles" } : { segment: "Registro en la tienda" }) }, { merge: true });
      }
      return "cliente";
    }
    // Productos: el stock, los precios y las fotos quedan al día al instante (además de la revisión de cada hora)
    if (topic === "products/create" || topic === "products/update") { await saveShopifyProduct(body, body.status ? body.status === "active" : true); return "producto"; }
    if (topic === "products/delete") {
      const olds = await db.collection("products").where("shopifyProductId", "==", String(body.id)).get();
      for (const d of olds.docs) await d.ref.delete();
      const legacy = db.doc("products/shp_" + body.id); if ((await legacy.get()).exists) await legacy.delete();
      return "producto borrado";
    }
    if (topic === "checkouts/create" || topic === "checkouts/update") {
      if (!body.phone && !body.email && !(body.customer || {}).phone && !(body.shipping_address || {}).phone) return "carrito sin datos";
      const { ref } = await upsertCustomer(body.customer || {}, { phone: body.phone || (body.shipping_address || {}).phone, email: body.email, name: (body.shipping_address || {}).name, address: body.shipping_address }, "Shopify");
      const items = (body.line_items || []).map(i => `• ${i.quantity} × ${i.title}`).join("\n");
      const c = (await ref.get()).data() || {};
      if ((c.lastPurchaseAt || 0) > now - 3600e3) return "ya compró";
      await CART.save(body, ref.id, now);
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
  // Foto de cada color: 1) la que Shopify le asigna a la variante; 2) una foto del producto cuyo nombre de archivo o texto
  // alternativo menciona ese color (muchas tiendas suben la foto de cada color sin asignarla); 3) la principal.
  // El CDN de Shopify la entrega a 1200 px.
  const normTxt = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const SIZE_OPT = /^\d|^(sencill|semidobl|dobl|queen|king|twin|full|individual|unica|default)/;
  function shopifyImage(p, v = {}) {
    const imgs = p.images || [];
    let src = (v.featured_image && v.featured_image.src) || (v.image_id && (imgs.find(i => i.id === v.image_id) || {}).src)
      || (imgs.find(i => (i.variant_ids || []).includes(v.id)) || {}).src || "";
    if (!src) {
      const colors = [v.option1, v.option2, v.option3].map(normTxt).filter(o => o && !SIZE_OPT.test(o));
      if (colors.length) {
        const hay = i => " " + normTxt((i.alt || "") + " " + decodeURIComponent(String(i.src || "").split("?")[0].split("/").pop() || "").replace(/\.\w+$/, "")) + " ";
        const hit = imgs.find(i => colors.every(c => hay(i).includes(" " + c + " "))) || imgs.find(i => colors.some(c => c.length > 3 && hay(i).includes(" " + c + " ")));
        if (hit) src = hit.src;
      }
    }
    src = src || (p.image && p.image.src) || (imgs[0] || {}).src || "";
    if (!src) return "";
    const url = src.startsWith("//") ? "https:" + src : src;
    return /cdn\.shopify\.com/.test(url) && !/[?&]width=/.test(url) ? url + (url.includes("?") ? "&" : "?") + "width=1200" : url;
  }
  // ¿Hay stock? 1) Catálogo público ("available": lo mismo que ve el cliente en la tienda). 2) Lo que dice el catálogo
  // público de esa variante cuando se importa con el acceso de Admin (pub). 3) API de Admin: si no lleva inventario, si se
  // vende sin stock o si hay unidades. Si Shopify no manda la cantidad (la app no tiene el permiso read_inventory), no se
  // puede saber: se toma como disponible, nunca como agotado.
  const inStock = (v, pub) => {
    if ("available" in v) return v.available !== false;
    if (pub && pub.has(String(v.id))) return pub.get(String(v.id));
    if (!v.inventory_management || v.inventory_policy === "continue") return true;
    if (v.inventory_quantity === undefined || v.inventory_quantity === null) return true;
    return Number(v.inventory_quantity) > 0;
  };
  // Disponibilidad de cada variante en el catálogo público de la tienda (tienda.com/products.json): variante → true/false
  async function publicAvailability(shop) {
    const map = new Map();
    try {
      for (let page = 1; page <= 40; page++) {
        const r = await fetchFn(`https://${shop}/products.json?limit=250&page=${page}`, { headers: { Accept: "application/json" } });
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (!j || !Array.isArray(j.products) || !j.products.length) break;
        for (const p of j.products) for (const v of p.variants || []) if ("available" in v) map.set(String(v.id), v.available !== false);
      }
    } catch (e) { console.error("catálogo público", e.message); }
    return map;
  }
  // Guarda un producto de Shopify: una ficha por variante (color, medida…), con su foto, su precio y si hay stock.
  // Borra las fichas de ese producto que ya no existen en la tienda.
  async function saveShopifyProduct(p, active, pub) {
    const vs = (p.variants || []).length ? p.variants : [{}];
    const multi = vs.length > 1;
    const base = { category: p.product_type || "", desc: stripHtml(p.body_html).slice(0, 200), active, source: "Shopify", shopifyProductId: String(p.id), updatedAt: Date.now(), updatedBy: "Shopify" };
    const keep = new Set();
    for (const v of vs) {
      const id = "shp_" + p.id + (multi ? "_" + v.id : "");
      const vt = multi && v.title && v.title !== "Default Title" ? " · " + v.title : "";
      const price = Math.round(Number(v.price) || 0), before = Math.round(Number(v.compare_at_price) || 0);
      // compareAt: "precio de comparación" de Shopify (producto en oferta: antes compareAt, ahora priceRetail)
      await db.doc("products/" + id).set({ ...base, name: p.title + vt, priceRetail: price, sku: v.sku || "",
        compareAt: before > price ? before : 0, image: shopifyImage(p, v), available: inStock(v, pub),
        ...(v.inventory_management && v.inventory_quantity != null ? { stock: Number(v.inventory_quantity) || 0 } : {}) }, { merge: true });
      keep.add(id);
    }
    const olds = await db.collection("products").where("shopifyProductId", "==", String(p.id)).get().catch(() => ({ docs: [] }));
    for (const d of olds.docs) if (!keep.has(d.id)) await d.ref.delete();
    if (multi) { const legacy = db.doc("products/shp_" + p.id); if ((await legacy.get()).exists) await legacy.delete(); }
    return vs.length;
  }
  // Token de Admin: el que pegó la administradora (shpat_…) o, con una app del Dev Dashboard de Shopify (Client ID y
  // Client secret), uno que se pide solo con "client credentials" y dura 24 h (se renueva cuando falta poco para vencer).
  async function adminToken(c) {
    if (c.token) return c.token;
    if (!c.clientId || !c.clientSecret) return "";
    if (c.cct && (c.cctExp || 0) > Date.now() + 10 * 60 * 1000) return c.cct;
    const r = await fetchFn(`https://${c.shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }).toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error("Shopify no entregó el acceso con ese Client ID y Client secret. Revisa que la app esté instalada en tu tienda y tenga los permisos read_discounts, read_products y read_inventory. " + (j.error_description || j.error || "(" + r.status + ")"));
    const exp = Date.now() + ((Number(j.expires_in) || 86400) - 60) * 1000;
    await setPriv({ shopify: { cct: j.access_token, cctExp: exp } });
    return j.access_token;
  }
  const hasAdmin = c => !!(c.token || (c.clientId && c.clientSecret));

  // Con acceso de Admin usa la API; sin él lee el catálogo público de la tienda (tienda.com/products.json)
  async function shopifyImport() {
    const c0 = (await cfg(true)).shopify || {};
    if (!c0.shop) throw new Error("Primero conecta la tienda de Shopify.");
    const c = { ...c0, token: await adminToken(c0) };
    let n = 0;
    if (c.token) {
      const pub = await publicAvailability(c.shop); // el stock que ve el cliente, por si la API no manda las cantidades
      let url = `https://${c.shop}/admin/api/${SHOPIFY_API}/products.json?limit=250&status=active`, pages = 0;
      while (url && pages++ < 20) {
        const r = await fetchFn(url, { headers: { "X-Shopify-Access-Token": c.token, "Content-Type": "application/json" } });
        if (!r.ok) throw new Error(r.status === 401 ? "Shopify rechazó el token de acceso." : "Shopify respondió " + r.status);
        const j = await r.json();
        for (const p of j.products || []) n += await saveShopifyProduct(p, p.status !== "archived", pub);
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

  // Descuentos de Shopify (automáticos y códigos) → promociones de House Chat. Requiere token de Admin con read_discounts.
  const gid = s => String(s || "").split("/").pop();
  const DISC_QUERY = `query($after: String) { discountNodes(first: 25, after: $after) { pageInfo { hasNextPage endCursor } nodes { id discount { __typename
    ... on DiscountAutomaticBasic { title status startsAt endsAt minimumRequirement { ...Min } customerGets { ...Gets } }
    ... on DiscountCodeBasic { title status startsAt endsAt codes(first: 1) { nodes { code } } minimumRequirement { ...Min } customerGets { ...Gets } }
    ... on DiscountAutomaticFreeShipping { title status startsAt endsAt minimumRequirement { ...Min } }
    ... on DiscountCodeFreeShipping { title status startsAt endsAt codes(first: 1) { nodes { code } } minimumRequirement { ...Min } }
    ... on DiscountAutomaticBxgy { title status startsAt endsAt }
    ... on DiscountCodeBxgy { title status startsAt endsAt codes(first: 1) { nodes { code } } } } } } }
  fragment Min on DiscountMinimumRequirement { ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity } ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } }
  fragment Gets on DiscountCustomerGets { value { ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } appliesOnEachItem } }
    items { ... on AllDiscountItems { allItems } ... on DiscountProducts { products(first: 30) { nodes { id } } productVariants(first: 30) { nodes { product { id } } } }
      ... on DiscountCollections { collections(first: 5) { nodes { id title } } } } }`;
  async function shopifyGql(c, query, variables) {
    const r = await fetchFn(`https://${c.shop}/admin/api/${SHOPIFY_API}/graphql.json`, { method: "POST",
      headers: { "X-Shopify-Access-Token": c.token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw new Error("Shopify rechazó el token: necesita el permiso read_discounts (y read_products).");
    if (!r.ok || j.errors) throw new Error("Shopify respondió: " + ((j.errors && (j.errors[0] && j.errors[0].message || JSON.stringify(j.errors).slice(0, 200))) || r.status));
    return j.data;
  }
  async function collectionProducts(c, id) {
    const d = await shopifyGql(c, "query($id: ID!) { collection(id: $id) { products(first: 250) { nodes { id } } } }", { id });
    return ((d.collection && d.collection.products.nodes) || []).map(n => "shp_" + gid(n.id));
  }
  // Convierte un descuento de Shopify en promoción (null si no se puede representar)
  async function mapDiscount(c, node) {
    const d = node.discount || {}, t = d.__typename || "";
    if (!d.title || d.status === "EXPIRED") return null;
    const min = d.minimumRequirement || {}, code = d.codes && d.codes.nodes[0] && d.codes.nodes[0].code;
    const promo = { name: d.title, source: "Shopify", shopifyId: node.id, on: true, scope: "todo", categories: [], productIds: [], code: code || "",
      minQty: Number(min.greaterThanOrEqualToQuantity) || 0, start: d.startsAt ? String(d.startsAt).slice(0, 10) : "", end: d.endsAt ? String(d.endsAt).slice(0, 10) : "",
      desc: min.greaterThanOrEqualToSubtotal ? `Compra mínima de $${Math.round(Number(min.greaterThanOrEqualToSubtotal.amount) || 0).toLocaleString("es-CO")}` : "" };
    if (/FreeShipping/.test(t)) return { ...promo, type: "envio", value: 0 };
    if (/Bxgy/.test(t)) return { ...promo, type: "otro", value: 0, desc: [promo.desc, "Promoción de compra uno y lleva otro (revisa las condiciones en Shopify)"].filter(Boolean).join(". ") };
    const g = d.customerGets || {}, v = g.value || {}, items = g.items || {};
    if (v.percentage != null) Object.assign(promo, { type: "porcentaje", value: Math.round(Number(v.percentage) * 1000) / 10 });
    else if (v.amount) Object.assign(promo, v.appliesOnEachItem ? { type: "valor", value: Math.round(Number(v.amount.amount) || 0) }
      : { type: "otro", value: 0, desc: [promo.desc, `$${Math.round(Number(v.amount.amount) || 0).toLocaleString("es-CO")} de descuento en el total del pedido`].filter(Boolean).join(". ") });
    else return null;
    if (items.products || items.productVariants) {
      promo.scope = "productos";
      promo.productIds = [...new Set([...((items.products && items.products.nodes) || []).map(n => "shp_" + gid(n.id)), ...((items.productVariants && items.productVariants.nodes) || []).map(n => "shp_" + gid(n.product && n.product.id))])];
    } else if (items.collections) {
      promo.scope = "productos";
      for (const col of items.collections.nodes || []) promo.productIds.push(...await collectionProducts(c, col.id));
      promo.productIds = [...new Set(promo.productIds)];
      promo.desc = [promo.desc, "En: " + (items.collections.nodes || []).map(x => x.title).join(", ")].filter(Boolean).join(". ");
    }
    if (promo.scope === "productos" && !promo.productIds.length) return null;
    return promo;
  }
  async function shopifyDiscounts() {
    const c0 = (await cfg(true)).shopify || {};
    if (!c0.shop) throw new Error("Primero conecta la tienda de Shopify.");
    if (!hasAdmin(c0)) throw new Error("Para leer los descuentos y códigos de Shopify conecta el acceso de Admin (Client ID y Client secret de tu app del Dev Dashboard de Shopify). Las ofertas con precio tachado sí se importan con Importar productos.");
    const c = { ...c0, token: await adminToken(c0) };
    const keep = new Set(); let after = null, pages = 0, n = 0;
    do {
      const d = await shopifyGql(c, DISC_QUERY, { after });
      for (const node of d.discountNodes.nodes) {
        const promo = await mapDiscount(c, node);
        if (!promo) continue;
        const id = "shp_disc_" + gid(node.id); keep.add(id); n++;
        // Lo que la administradora decide en House Chat (quién la inicia, cuándo ofrecerla…) no se pierde al releer Shopify
        const prev = (await db.doc("promos/" + id).get()).data() || {};
        const mine = Object.fromEntries(["visibility", "when", "priority", "onlyBuyers"].filter(k => k in prev).map(k => [k, prev[k]]));
        await db.doc("promos/" + id).set({ ...promo, ...mine, updatedAt: Date.now(), updatedBy: "Shopify" });
      }
      after = d.discountNodes.pageInfo.hasNextPage ? d.discountNodes.pageInfo.endCursor : null;
    } while (after && ++pages < 10);
    // Los descuentos que ya no existen en Shopify se quitan de House Chat
    const old = await db.collection("promos").where("source", "==", "Shopify").get();
    for (const doc of old.docs) if (!keep.has(doc.id)) await doc.ref.delete();
    await setPub({ shopify: { promosAt: Date.now(), promos: n, promosError: "" } });
    return { promos: n };
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
      const clientId = String(d.clientId || "").trim() || prev.clientId || "", clientSecret = String(d.clientSecret || "").trim() || prev.clientSecret || "";
      const secret = String(d.secret || "").trim() || prev.secret || clientSecret; // las apps del Dev Dashboard firman los webhooks con el Client secret
      if (!secret) throw new Error("Pega la clave de firma de los webhooks de Shopify (o el Client secret de tu app).");
      const next = { shop, secret, token: String(d.token || "").trim() || prev.token || "", clientId, clientSecret,
        ...(clientId !== prev.clientId || clientSecret !== prev.clientSecret || shop !== prev.shop ? { cct: "", cctExp: 0 } : {}) };
      // Se prueba ya (si falla, la administradora ve el motivo); el acceso nuevo ya quedó guardado, no se pisa
      if (clientId && clientSecret && !next.token) { await adminToken({ ...prev, ...next }); delete next.cct; delete next.cctExp; }
      await setPriv({ shopify: next });
      await setPub({ shopify: { on: true, shop, hasToken: hasAdmin(next), at: Date.now() } });
      let promos = null;
      if (hasAdmin(next)) promos = await shopifyDiscounts().then(r => r.promos).catch(e => { console.error("descuentos", e.message); return null; });
      return { ok: true, promos };
    }
    if (action === "importShopify") return shopifyImport();
    if (action === "importShopifyPromos") return shopifyDiscounts();
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

  // Cada 3 horas: vuelve a leer los descuentos de Shopify para que la asesora ofrezca siempre los vigentes
  // Cada hora: vuelve a leer los productos (stock, precios, fotos) para que la asesora no ofrezca nada agotado
  async function syncProducts() {
    const c = (await cfg(true)).shopify || {};
    if (!c.shop) return "sin tienda";
    return shopifyImport();
  }
  // Carritos abandonados por la API de Admin (permiso read_orders): trae los de los últimos 30 días, también los que
  // llegaron antes de conectar el webhook. Sin ese permiso no hace nada.
  async function syncCheckouts(now = Date.now()) {
    const c0 = (await cfg(true)).shopify || {};
    if (!c0.shop || !hasAdmin(c0)) return "sin acceso de Admin";
    const token = await adminToken(c0);
    const since = new Date(now - 30 * 24 * 3600e3).toISOString();
    let url = `https://${c0.shop}/admin/api/${SHOPIFY_API}/checkouts.json?limit=250&created_at_min=${encodeURIComponent(since)}`, n = 0;
    for (let page = 0; url && page < 8; page++) {
      const r = await fetchFn(url, { headers: { "X-Shopify-Access-Token": token } });
      if (r.status === 403 || r.status === 401) { await setPub({ shopify: { cartsError: "Para traer los carritos, agrega el permiso read_orders a tu app de Shopify." } }); return "sin permiso read_orders"; }
      if (!r.ok) throw new Error("Shopify respondió " + r.status + " al leer los carritos.");
      const j = await r.json();
      for (const ck of j.checkouts || []) {
        if (ck.completed_at) continue;
        const phone = ck.phone || (ck.shipping_address || {}).phone || (ck.customer || {}).phone, email = ck.email || (ck.customer || {}).email;
        if (!phone && !email) continue;
        if ((await db.doc("carts/" + String(ck.token).replace(/[\/]/g, "_")).get()).exists) continue;
        const { ref } = await upsertCustomer(ck.customer || {}, { phone, email, name: (ck.shipping_address || {}).name, address: ck.shipping_address }, "Shopify");
        const created = Date.parse(ck.created_at) || now;
        await CART.save(ck, ref.id, created);
        n++;
      }
      const link = (r.headers && r.headers.get && r.headers.get("link")) || "";
      const m = link.match(/<([^>]+)>;\s*rel="next"/);
      url = m ? m[1] : null;
    }
    await setPub({ shopify: { cartsAt: now, cartsError: "" } });
    return { carritos: n };
  }
  async function syncDiscounts() {
    const c = (await cfg(true)).shopify || {};
    if (!c.shop || !hasAdmin(c)) return "sin acceso de Admin";
    try { return await shopifyDiscounts(); }
    catch (e) { await setPub({ shopify: { promosError: String(e.message || e).slice(0, 300), promosErrorAt: Date.now() } }); throw e; }
  }
  return { syncCheckouts, shopifyWebhook, shopifyEvent, shopifyValid, shopifyImport, shopifyImage, shopifyDiscounts, syncDiscounts, syncProducts, saveShopifyProduct, adminToken, mapDiscount, siigoInvoice, manage };
};

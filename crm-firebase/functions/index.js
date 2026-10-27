// Funciones del CRM Casa Dorada:
// - whatsappWebhook: recibe los mensajes y estados de la API de WhatsApp (Meta)
// - waStatus: revisa con Meta el estado del número, la cuenta y la suscripción (también cada hora)
// - sendWhatsApp: envía texto (ventana de 24 h abierta) o plantillas aprobadas
// - createTeamUser: la administradora crea cuentas para su equipo
// - setTeamPassword: la administradora le pone una contraseña nueva a alguien del equipo
// - asesoraVirtual: la asesora con IA responde los mensajes entrantes (ver asesora.js)
// - catalogoPdf: catálogo en PDF con fotos por medida de cama (ver catalogo-pdf.js y medidas.js)
// - tarjetaDescuento: tarjeta de descuento en PNG de un producto (ver tarjeta.js)
// - cotizacionPdf, enviarCotizacion: cotización en PDF con marca de agua, enviada por el chat (ver cotizacion-pdf.js)
// - notificaciones, notificarMensaje: notificaciones push al equipo cuando un cliente escribe (ver notificaciones.js)
// - copiloto, analizarConversaciones: copiloto de ventas con IA para el equipo y análisis automático de cada chat (ver copiloto.js)
// - guardarMedia: descarga las fotos, audios, videos y documentos que mandan los clientes (ver media.js)
// - sendMessage: envía texto por el canal del contacto (WhatsApp, Telegram, Messenger, Instagram o chat web)
// - telegramWebhook, webchat, connectTelegram, connectMeta, disconnectChannel: otros canales (ver canales.js)
// - autoNuevoContacto, autoEtapa, autoMensaje, autoSinRespuesta, runCampaign: automatizaciones y campañas (ver automatizaciones.js)
// - integrations, api, intCotizacion, intPedido: webhooks salientes y API con clave (ver integraciones.js)
// - forms: formularios de captura públicos que crean contactos (ver formularios.js)
// - shopifyWebhook, apps: Shopify (pedidos, clientes, carritos, productos) y Siigo (facturas) (ver apps.js)
// WhatsApp por código QR: si no hay WA_PHONE_ID y el puente está conectado (settings/channels.waqr.on), los envíos
// quedan en la colección waOutbox y el puente de la carpeta whatsapp-qr los manda desde el celular vinculado.
const crypto = require("crypto");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const REGION = "us-east1";
const GRAPH = "https://graph.facebook.com/v21.0";

const WA_TOKEN = defineSecret("WA_TOKEN");             // token permanente del usuario del sistema
const WA_VERIFY_TOKEN = defineSecret("WA_VERIFY_TOKEN"); // texto que tú inventas para verificar el webhook
const WA_APP_SECRET = defineSecret("WA_APP_SECRET");     // clave secreta de la app de Meta
const WA_PHONE_ID = defineString("WA_PHONE_ID", { default: "" }); // identificador del número de teléfono
const WA_WABA_ID = defineString("WA_WABA_ID", { default: "" });   // cuenta de WhatsApp Business (para revisar su estado)
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");     // clave de la API de Claude (asesora virtual)
const asesora = require("./asesora");
const CH = require("./canales")({ db, admin, GRAPH });
const PROJECT = process.env.GCLOUD_PROJECT || (JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId) || "";

const DAY = 24 * 3600 * 1000;

function phoneId(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 10 && d[0] === "3") d = "57" + d;
  return d;
}

// Id de documento para un mensaje de WhatsApp (los wamid pueden traer "/", que Firestore no admite en un id)
const msgDocId = id => String(id || "").replace(/\//g, "_");

// Archivo de un mensaje de WhatsApp (se descarga después en guardarMedia)
function waMedia(m) {
  const kind = { image: "image", sticker: "image", audio: "audio", video: "video", document: "document" }[m.type];
  const o = kind && m[m.type];
  return o && o.id ? { kind, id: o.id, mime: o.mime_type || "", ...(o.filename ? { filename: o.filename } : {}) } : null;
}
// Texto legible de cualquier tipo de mensaje entrante
function textOf(m) {
  switch (m.type) {
    case "text": return m.text.body;
    case "button": return m.button.text;
    case "interactive": return (m.interactive.button_reply || m.interactive.list_reply || {}).title || "[respuesta]";
    case "image": return "[Imagen]" + (m.image.caption ? " " + m.image.caption : "");
    case "video": return "[Video]" + (m.video.caption ? " " + m.video.caption : "");
    case "document": return "[Documento] " + (m.document.filename || "");
    case "audio": return "[Audio]";
    case "sticker": return "[Sticker]";
    case "location": return "[Ubicación] " + (m.location.name || `${m.location.latitude},${m.location.longitude}`);
    case "contacts": return "[Contacto compartido]";
    case "reaction": return "[Reacción] " + (m.reaction.emoji || "");
    default: return "[" + m.type + "]";
  }
}

function validSignature(req, secret) {
  const sig = req.get("x-hub-signature-256") || "";
  if (!secret || !sig.startsWith("sha256=") || !req.rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.whatsappWebhook = onRequest({ region: REGION, invoker: "public", secrets: [WA_VERIFY_TOKEN, WA_APP_SECRET] }, async (req, res) => {
  if (req.method === "GET") {
    const ok = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === WA_VERIFY_TOKEN.value();
    return ok ? res.status(200).send(req.query["hub.challenge"]) : res.sendStatus(403);
  }
  if (req.method !== "POST") return res.sendStatus(405);
  if (!validSignature(req, WA_APP_SECRET.value())) return res.sendStatus(401);
  try {
    await handleWebhook(req.body || {});
    res.sendStatus(200);
  } catch (e) {
    console.error("webhook", e);
    res.sendStatus(500); // Meta reintenta
  }
});

async function handleWebhook(body) {
  if (body.object === "page" || body.object === "instagram") return CH.metaEvents(body); // Messenger e Instagram
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const names = {};
      (v.contacts || []).forEach(c => { names[c.wa_id] = c.profile && c.profile.name; });
      const line = v.metadata && v.metadata.phone_number_id; // con varias líneas, a cuál número escribió
      for (const m of v.messages || []) await saveInbound(m, names[m.from], line);
      for (const s of v.statuses || []) await saveStatus(s);
    }
  }
}
exports._handleWebhook = handleWebhook; // para pruebas

// Configuración pública de canales (líneas de WhatsApp [{ id: phone_number_id, name, number, owner }], embudo de destino…)
let chCache = null, chAt = 0;
async function chSettings() {
  if (chCache && Date.now() - chAt < 60000) return chCache;
  chCache = (await db.doc("settings/channels").get()).data() || {}; chAt = Date.now();
  return chCache;
}
const waLines = async () => (await chSettings()).waLines || [];
async function saveInbound(m, profileName, line) {
  const pid = phoneId(m.from), cid = "wa_" + pid;
  const lineCfg = line ? (await waLines()).find(l => String(l.id) === String(line)) : null;
  const dest = (await chSettings()).waPipeline; // embudo al que entran los contactos nuevos de WhatsApp
  const ts = Number(m.timestamp) * 1000 || Date.now();
  const text = textOf(m);
  const cref = db.doc("contacts/" + cid);
  const mref = cref.collection("messages").doc(msgDocId(m.id));
  const reaction = m.type === "reaction"; // 👍❤️ a un mensaje: queda en el chat, pero no cuenta como mensaje por responder
  await db.runTransaction(async t => {
    const [snap, msnap] = await Promise.all([t.get(cref), t.get(mref)]);
    if (msnap.exists) return; // Meta puede reenviar el mismo mensaje
    const patch = { phone: "+" + pid, lastInboundAt: ts, lastMessage: text.slice(0, 200), lastMessageDir: "in", lastChannel: "whatsapp", channels: { whatsapp: pid },
      unread: admin.firestore.FieldValue.increment(1), updatedAt: Date.now(), updatedBy: "WhatsApp" };
    if (line) patch.waLine = String(line);
    if (!snap.exists) Object.assign(patch, { name: profileName || "", segment: "WhatsApp", type: "Prospecto", stage: "Nuevo",
      createdAt: ts, stageAt: ts, source: "WhatsApp" + (lineCfg && lineCfg.name ? " · " + lineCfg.name : "") }, lineCfg && lineCfg.owner ? { owner: lineCfg.owner } : {},
      dest && dest !== "ventas" ? { pipeline: dest } : {});
    else if (!snap.get("name") && profileName) patch.name = profileName;
    if (reaction && snap.exists) ["lastInboundAt", "lastMessage", "lastMessageDir", "unread"].forEach(k => delete patch[k]);
    t.set(cref, patch, { merge: true });
    const md = waMedia(m);
    t.set(mref, { dir: "in", text, type: m.type, ts, waId: m.id, channel: "whatsapp", ...(line ? { line: String(line) } : {}), ...(md ? { media: md } : {}) });
  });
}

// Estado de la conexión con Meta: acceso, número, calidad, cuenta y suscripción a los mensajes.
// Se guarda en settings/channels.waStatus; se revisa cada hora y con el botón "Comprobar acceso a Meta".
async function graphGet(path) {
  const r = await fetch(`${GRAPH}/${path}`, { headers: { Authorization: "Bearer " + WA_TOKEN.value() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.error_user_msg || j.error.message)) || "Meta respondió " + r.status);
  return j;
}
async function waCheck() {
  const pid = WA_PHONE_ID.value(), waba = WA_WABA_ID.value(), out = { checkedAt: Date.now() };
  if (!pid) out.meta = "sin_configurar";
  else {
    try {
      const p = await graphGet(`${pid}?fields=display_phone_number,verified_name,quality_rating,status,code_verification_status,messaging_limit_tier`);
      Object.assign(out, { meta: "ok", phone: p.display_phone_number || "", name: p.verified_name || "", quality: p.quality_rating || "",
        number: p.status || p.code_verification_status || "", tier: p.messaging_limit_tier || "" });
    } catch (e) { out.meta = "error"; out.error = String(e.message).slice(0, 300); }
    if (out.meta === "ok" && waba) {
      try { out.account = (await graphGet(`${waba}?fields=account_review_status`)).account_review_status || ""; }
      catch (e) { out.account = "error"; }
      try { out.subscribed = ((await graphGet(`${waba}/subscribed_apps`)).data || []).length > 0; }
      catch (e) { out.subscribed = null; }
    }
  }
  await db.doc("settings/channels").set({ waStatus: out }, { merge: true });
  return out;
}
exports._waCheck = waCheck; // para pruebas
exports.waStatus = onCall({ region: REGION, invoker: "public", secrets: [WA_TOKEN] }, async req => {
  await requireAdmin(req);
  return waCheck();
});

// Estado de un mensaje enviado (enviado, entregado, leído, fallido). Si se envió desde una ficha cuyo id no es
// wa_{número} (contactos creados a mano o duplicados), waIds dice a qué ficha pertenece.
async function saveStatus(s) {
  const mid = msgDocId(s.id);
  const map = await db.doc("waIds/" + mid).get();
  const cid = map.exists ? map.get("cid") : "wa_" + phoneId(s.recipient_id);
  const ref = db.doc(`contacts/${cid}/messages/${mid}`);
  if (!map.exists) {
    const [m, c] = await Promise.all([ref.get(), db.doc("contacts/" + cid).get()]);
    if (!m.exists && !c.exists) return; // mensaje que no es de House Chat: no crear fichas ni mensajes vacíos
  }
  const patch = { status: s.status, statusAt: Number(s.timestamp) * 1000 || Date.now() };
  if (s.errors && s.errors[0]) patch.error = String(s.errors[0].error_data && s.errors[0].error_data.details || s.errors[0].title || s.errors[0].message || "").slice(0, 300);
  await ref.set(patch, { merge: true });
}

async function requireMember(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
  const u = await db.doc("users/" + req.auth.uid).get();
  if (!u.exists || u.get("active") === false) throw new HttpsError("permission-denied", "Tu usuario no está activo.");
  return u.data();
}

exports.sendWhatsApp = onCall({ region: REGION, invoker: "public", secrets: [WA_TOKEN] }, async req => {
  const me = await requireMember(req);
  const { contactId, text, template, preview } = req.data || {};
  if (!contactId) throw new HttpsError("invalid-argument", "Falta el contacto.");
  const cref = db.doc("contacts/" + contactId), c = await cref.get();
  if (!c.exists) throw new HttpsError("not-found", "El contacto no existe.");
  const phoneNumberId = c.get("waLine") || WA_PHONE_ID.value();
  const waQr = !phoneNumberId && await CH.waQrOn();
  if (!phoneNumberId && !waQr) throw new HttpsError("failed-precondition", "Falta configurar WA_PHONE_ID.");
  const to = phoneId(c.get("phone")) || (waQr && c.get("waJid") ? String((c.get("channels") || {}).whatsapp || "") : "");
  if (!to) throw new HttpsError("failed-precondition", "El contacto no tiene WhatsApp.");

  let payload, shown;
  if (waQr && !text && template && template.name) { // por QR no hay plantillas: se envía el texto ya armado
    if (!preview || /^\[Plantilla /.test(preview)) throw new HttpsError("failed-precondition", "Con WhatsApp por QR no se usan plantillas: escribe el mensaje.");
    payload = { messaging_product: "whatsapp", to, type: "text", text: { body: String(preview).slice(0, 4096) } };
    shown = String(preview);
  } else if (text) {
    const open = Date.now() - (c.get("lastInboundAt") || 0) < DAY;
    if (!open && !waQr) throw new HttpsError("failed-precondition", "VENTANA_CERRADA");
    payload = { messaging_product: "whatsapp", to, type: "text", text: { body: String(text).slice(0, 4096) } };
    shown = String(text);
  } else if (template && template.name) {
    const params = (template.params || []).map(p => ({ type: "text", text: String(p || "-") }));
    payload = { messaging_product: "whatsapp", to, type: "template",
      template: { name: template.name, language: { code: template.lang || "es" }, ...(params.length ? { components: [{ type: "body", parameters: params }] } : {}) } };
    shown = preview || "[Plantilla " + template.name + "]";
  } else throw new HttpsError("invalid-argument", "Falta el mensaje.");

  // Cuando una persona escribe, la asesora virtual se pausa en ese chat por unas horas
  const ai = await db.doc("settings/asesora").get();
  const pauseH = ai.exists ? Number(ai.get("pauseHours")) || 12 : 12;
  try {
    const id = await waSend(cref, payload, { text: shown, type: text ? "text" : "template", by: req.auth.uid, byName: me.name || "" },
      { unread: 0, aiPausedUntil: Date.now() + pauseH * 3600 * 1000 }, phoneNumberId || null);
    return { id };
  } catch (e) { throw new HttpsError("internal", e.message); }
});

// Envía por la API de WhatsApp (o lo deja en cola para el puente QR) y devuelve el id del mensaje
async function waPost(payload, line, cid) {
  const from = line || WA_PHONE_ID.value();
  if (!from && await CH.waQrOn()) return waQueue(payload, cid);
  if (!from) throw new Error("WhatsApp no está conectado (falta WA_PHONE_ID).");
  const r = await fetch(`${GRAPH}/${from}/messages`, {
    method: "POST", headers: { Authorization: "Bearer " + WA_TOKEN.value(), "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((out.error && (out.error.error_user_msg || out.error.message)) || "WhatsApp rechazó el mensaje.");
  const id = out.messages && out.messages[0] && out.messages[0].id;
  // Ficha con id distinto de wa_{número}: se anota a cuál pertenece para que lleguen los vistos ✓✓
  if (id && cid && cid !== "wa_" + phoneId(payload.to)) await db.doc("waIds/" + msgDocId(id)).set({ cid, at: Date.now() }).catch(e => console.error("waIds", e.message));
  return id;
}
// WhatsApp por código QR: el puente (carpeta whatsapp-qr) escucha waOutbox y envía desde el celular vinculado
async function waQueue(payload, cid) {
  if (!["text", "image", "document"].includes(payload.type)) throw new Error("Con WhatsApp por QR solo se envían textos, fotos y documentos, no plantillas.");
  const ref = db.collection("waOutbox").doc();
  await ref.set({ cid: cid || "wa_" + payload.to, to: payload.to || "", status: "pendiente", createdAt: Date.now(),
    ...(payload.type === "image" ? { image: payload.image.link, text: payload.image.caption || "" }
      : payload.type === "document" ? { document: payload.document.link, filename: payload.document.filename || "", text: payload.document.caption || "" } : { text: payload.text.body }) });
  return ref.id;
}
// Texto, o foto con pie de foto (image = enlace https)
const waText = contact => async (body, cid, image, doc) => {
  const to = phoneId(contact.phone) || (contact.waJid && cid ? String((contact.channels || {}).whatsapp || "") : "");
  if (!to) throw new Error("El contacto no tiene WhatsApp.");
  if (doc) return waPost({ messaging_product: "whatsapp", to, type: "document", document: { link: doc.url, filename: doc.filename || "documento.pdf", ...(body ? { caption: body.slice(0, 1024) } : {}) } }, contact.waLine, cid);
  return waPost(image ? { messaging_product: "whatsapp", to, type: "image", image: { link: image, ...(body ? { caption: body.slice(0, 1024) } : {}) } }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4096) } }, contact.waLine, cid);
};
// Envía por la API de WhatsApp y registra el mensaje saliente en el contacto
async function waSend(cref, payload, msg, extra = {}, line) {
  const id = await waPost(payload, line, cref.id);
  const now = Date.now();
  await cref.collection("messages").doc(id ? msgDocId(id) : db.collection("x").doc().id).set({ dir: "out", ts: now, channel: "whatsapp", ...msg }, { merge: true }); // merge: el estado puede haber llegado antes
  await cref.set({ lastOutboundAt: now, lastOutboundBy: msg.byName, lastMessage: msg.text.slice(0, 200), lastMessageDir: "out", updatedAt: now, updatedBy: msg.byName, ...extra }, { merge: true });
  return id;
}

// Asesora virtual: se dispara con cada mensaje nuevo; solo actúa con los entrantes
exports.asesoraVirtual = onDocumentCreated({ document: "contacts/{cid}/messages/{mid}", region: REGION, secrets: [WA_TOKEN, ANTHROPIC_API_KEY],
  timeoutSeconds: 300, memory: "512MiB" }, async event => {
  const m = event.data && event.data.data();
  if (!m || m.dir !== "in") return;
  if ((m.channel || "whatsapp") === "whatsapp" && !WA_PHONE_ID.value() && !m.line && m.via !== "qr") return;
  const result = await asesora.handleInbound({ db, admin, cid: event.params.cid, mid: event.params.mid, apiKey: ANTHROPIC_API_KEY.value(), loadMedia: p => MEDIA.read(p),
    quoteLink, discountCard, catalogLink,
    send: ({ cref, contact, text, byName, image, document }) => CH.deliver({ cref, contact, text, image, document, channel: m.channel || contact.lastChannel,
      msg: { by: "asesora", byName, ai: true }, sendWhatsApp: waText(contact) }) });
  console.log("asesora", event.params.cid, result);
});

// Cotización en PDF: se genera al vuelo desde la base de datos y se comparte con un enlace secreto por cotización
// (WhatsApp, Telegram y Messenger descargan el archivo desde ese enlace). Datos de la empresa en settings/cotizacion.
const QPDF = require("./cotizacion-pdf");
const PUBLIC_URL = "https://housechat.web.app";
async function quoteLink(qid) {
  const ref = db.doc("quotes/" + qid), q = await ref.get();
  if (!q.exists) throw new Error("La cotización no existe.");
  let token = q.get("pdfToken");
  if (!token) { token = crypto.randomBytes(16).toString("hex"); await ref.set({ pdfToken: token }, { merge: true }); }
  const file = String(q.get("number") || "cotizacion").replace(/[^\w-]/g, "") + ".pdf";
  return { url: `${PUBLIC_URL}/api/cotizacion/${qid}/${token}/${file}`, filename: `Cotización ${q.get("number") || ""} - Casa Dorada.pdf`.replace(/\s+-/, " -"), quote: { id: qid, ...q.data() } };
}
async function quotePdf(q) {
  const [c, co] = await Promise.all([q.contactId ? db.doc("contacts/" + q.contactId).get() : null, db.doc("settings/cotizacion").get()]);
  return QPDF.pdf({ quote: q, contact: c && c.exists ? c.data() : {}, company: co.exists ? co.data() : {} });
}
exports.cotizacionPdf = onRequest({ region: REGION, invoker: "public", memory: "256MiB" }, async (req, res) => {
  const [, qid, token] = (String(req.path || "").match(/cotizacion\/([\w-]{1,64})\/([0-9a-f]{32})/) || []);
  if (!qid) return res.sendStatus(404);
  try {
    const q = await db.doc("quotes/" + qid).get();
    const ok = q.exists && q.get("pdfToken") && crypto.timingSafeEqual(Buffer.from(String(q.get("pdfToken"))), Buffer.from(token));
    if (!ok) return res.sendStatus(404);
    const buf = await quotePdf(q.data());
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${String(q.get("number") || "cotizacion").replace(/[^\w-]/g, "")}.pdf"`);
    res.set("Cache-Control", "private, max-age=60");
    return res.status(200).send(buf);
  } catch (e) { console.error("pdf", e); return res.sendStatus(500); }
});
// Tarjeta de descuento: /api/tarjeta/{producto}.png → imagen 1080×1350 con el % de descuento, el precio antes y el de ahora.
// Es pública (es publicidad del producto); 404 si el producto ya no tiene descuento.
const TARJETA = require("./tarjeta");
const JPEG = require("./jpeg");
const FICHA = require("./ficha");
const PROMOS = require("./promos");
const longDay = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? new Date(iso + "T12:00:00-05:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", timeZone: "America/Bogota" }) : "");
// Descarga la foto de un producto y la deja lista para dibujar (JPEG normal o progresivo, o PNG).
// Devuelve { photo } o { reason } con el motivo si no se pudo (para dejarlo en la nota interna del chat).
const PNG = require("./png");
async function productPhoto(url, px) {
  if (!url) return { reason: "el producto no tiene foto" };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(CATPDF.jpegUrl(url, px), { signal: ctl.signal, headers: { Accept: "image/jpeg,image/png;q=0.9,*/*;q=0.1" } });
    if (!r.ok) return { reason: "Shopify respondió " + r.status };
    const b = Buffer.from(await r.arrayBuffer());
    if (b[0] === 0xff && b[1] === 0xd8) return { photo: JPEG.decode(b) };
    if (b[0] === 0x89 && b[1] === 0x50) return { photo: PNG.decode(b) };
    return { reason: "la foto llegó en un formato no soportado (" + (r.headers.get("content-type") || "desconocido") + ")" };
  } catch (e) { return { reason: e.name === "AbortError" ? "la foto tardó demasiado en descargar" : "no se pudo leer la foto: " + e.message }; }
  finally { clearTimeout(t); }
}
const cardHash = (p, d) => crypto.createHash("sha1").update([d.now, d.before, d.promo && d.promo.id, d.promo && d.promo.code, d.promo && d.promo.end, p.name, p.image].join("|")).digest("hex").slice(0, 12);
async function renderCard(p, d, photo) {
  const n = FICHA.splitName(p.name), co = await db.doc("settings/cotizacion").get();
  return TARJETA.card({ photo, title: FICHA.shortTitle(n.title), variant: n.variant, before: d.before, now: d.now, pct: d.pct,
    promoName: d.promo ? d.promo.name : "Precio de oferta", code: d.promo && d.promo.code, until: d.promo && longDay(d.promo.end), company: co.exists && co.get("nombre") });
}
// Tarjeta de oferta CON la foto del producto: se dibuja una vez, se guarda en el bucket (tarjetas/) y se devuelve su enlace.
// Si no se pudo poner la foto devuelve { reason } y la asesora manda la foto normal del producto.
async function discountCard(p, d) {
  const hash = cardHash(p, d), file = admin.storage().bucket(MEDIA_BUCKET).file(`tarjetas/${p.id}-${hash}.png`);
  const url = `${PUBLIC_URL}/api/tarjeta/${encodeURIComponent(p.id)}.png?v=${hash}`;
  if ((await file.exists())[0]) return { url };
  const r = await productPhoto(p.image, 1080);
  if (!r.photo) return { reason: r.reason };
  await file.save(await renderCard(p, d, r.photo), { resumable: false, contentType: "image/png" });
  return { url };
}
exports.tarjetaDescuento = onRequest({ region: REGION, invoker: "public", memory: "512MiB" }, async (req, res) => {
  const [, id] = String(req.path || "").match(/tarjeta\/([\w-]{1,120})\.png$/) || [];
  if (!id) return res.sendStatus(404);
  try {
    const [ps, prs] = await Promise.all([db.doc("products/" + id).get(), db.collection("promos").get()]);
    if (!ps.exists || ps.get("active") === false) return res.sendStatus(404);
    const p = { id, ...ps.data() }, promos = PROMOS.activePromos(prs.docs.map(d => ({ id: d.id, ...d.data() })));
    const d = FICHA.discountOf(p, promos);
    if (!d) return res.sendStatus(404);
    const file = admin.storage().bucket(MEDIA_BUCKET).file(`tarjetas/${p.id}-${cardHash(p, d)}.png`);
    let buf;
    if ((await file.exists())[0]) [buf] = await file.download();
    else { const r = await productPhoto(p.image, 1080); if (!r.photo) console.log("tarjeta sin foto", id, r.reason); buf = await renderCard(p, d, r.photo); }
    res.set("Content-Type", "image/png"); res.set("Cache-Control", "public, max-age=3600");
    return res.status(200).send(buf);
  } catch (e) { console.error("tarjeta", e); return res.sendStatus(500); }
});

// Catálogo por medida en PDF (con fotos): se genera una vez por versión del catálogo y se guarda en el bucket
// privado (catalogos/{medida}-{huella}.pdf); /api/catalogo/{medida}-{huella}.pdf lo entrega (público: es el catálogo).
const MEDIDAS = require("./medidas");
const CATPDF = require("./catalogo-pdf");
async function catalogData(key) {
  const [ps, prs, co] = await Promise.all([db.collection("products").get(), db.collection("promos").get(), db.doc("settings/cotizacion").get()]);
  const promos = PROMOS.activePromos(prs.docs.map(d => ({ id: d.id, ...d.data() })));
  const cat = MEDIDAS.catalog(ps.docs.map(d => ({ id: d.id, ...d.data() })), key, promos);
  if (!cat) return null;
  const company = co.exists ? co.data() : {};
  const hash = crypto.createHash("sha1").update(JSON.stringify(["v2", cat.items.map(g => [g.title, g.min, g.max, g.image, g.colors, g.disc && g.disc.before]), company.nombre, company.telefono, company.web])).digest("hex").slice(0, 12);
  return { cat, company, hash, path: `catalogos/${cat.key}-${hash}.pdf` };
}
// Foto para el catálogo: el JPEG tal cual (el PDF lo muestra sin decodificarlo) o, si es PNG, ya leída
async function fetchJpeg(url, px) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(CATPDF.jpegUrl(url, px), { signal: ctl.signal, headers: { Accept: "image/jpeg,image/png;q=0.9,*/*;q=0.1" } });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (CATPDF.jpegInfo(b)) return b;
    if (b[0] === 0x89 && b[1] === 0x50) return PNG.decode(b);
    return null;
  } catch { return null; } finally { clearTimeout(t); }
}
async function catalogFile(key) {
  const d = await catalogData(key);
  if (!d) return null;
  const file = admin.storage().bucket(MEDIA_BUCKET).file(d.path);
  const [exists] = await file.exists();
  if (!exists) {
    const urls = [...new Set(d.cat.items.map(g => g.image).filter(Boolean))], images = new Map();
    for (let i = 0; i < urls.length; i += 6) await Promise.all(urls.slice(i, i + 6).map(async u => { const b = await fetchJpeg(u); if (b) images.set(u, b); }));
    await file.save(CATPDF.pdf({ cat: d.cat, images, company: d.company }), { resumable: false, contentType: "application/pdf" });
  }
  return { ...d, file };
}
async function catalogLink(key) {
  const f = await catalogFile(key);
  if (!f) throw new Error("Medida desconocida.");
  return { url: `${PUBLIC_URL}/api/catalogo/${f.cat.key}-${f.hash}.pdf`, filename: `Catálogo ${f.company.nombre || "Casa Dorada"} - Cama ${f.cat.label}.pdf`, total: f.cat.total };
}
exports.catalogoPdf = onRequest({ region: REGION, invoker: "public", memory: "512MiB", timeoutSeconds: 120 }, async (req, res) => {
  const [, key, hash] = String(req.path || "").match(/catalogo\/(sencilla|semidoble|doble|queen|king)-([0-9a-f]{12})\.pdf$/) || [];
  if (!key) return res.sendStatus(404);
  try {
    const bucket = admin.storage().bucket(MEDIA_BUCKET);
    let file = bucket.file(`catalogos/${key}-${hash}.pdf`);
    if (!(await file.exists())[0]) file = (await catalogFile(key)).file; // versión vieja: se entrega la actual
    const [buf] = await file.download();
    res.set("Content-Type", "application/pdf"); res.set("Content-Disposition", `inline; filename="Catalogo-Cama-${key}.pdf"`); res.set("Cache-Control", "public, max-age=3600");
    return res.status(200).send(buf);
  } catch (e) { console.error("catálogo", e); return res.sendStatus(500); }
});

// El equipo: action "link" (ver el PDF) o "send" (enviarlo por el chat del cliente, con un texto opcional)
exports.enviarCotizacion = onCall({ region: REGION, invoker: "public", secrets: [WA_TOKEN] }, async req => {
  const me = await requireMember(req);
  const { quoteId, action, text } = req.data || {};
  if (!quoteId) throw new HttpsError("invalid-argument", "Falta la cotización.");
  let link;
  try { link = await quoteLink(String(quoteId)); } catch (e) { throw new HttpsError("not-found", e.message); }
  if (action !== "send") return { url: link.url };
  const q = link.quote;
  if (!q.contactId) throw new HttpsError("failed-precondition", "La cotización no tiene cliente.");
  const cref = db.doc("contacts/" + q.contactId), c = await cref.get();
  if (!c.exists) throw new HttpsError("not-found", "El contacto no existe.");
  const contact = c.data();
  const ch = contact.lastChannel || (contact.phone ? "whatsapp" : "");
  if (!CH.CHANNELS[ch]) throw new HttpsError("failed-precondition", "El contacto no tiene un canal para escribirle.");
  if (!CH.windowOpen(contact, ch, ch === "whatsapp" && await CH.waQrOn())) throw new HttpsError("failed-precondition", "VENTANA_CERRADA");
  const caption = String(text || "").trim() || `Te comparto tu cotización *${q.number}* por *$${Math.round(q.total || 0).toLocaleString("es-CO")}* ✨`;
  try {
    await CH.deliver({ cref, contact, text: caption, document: { url: link.url, filename: link.filename }, channel: ch, msg: { by: req.auth.uid, byName: me.name || "", quoteId: q.id },
      extra: { unread: 0 }, sendWhatsApp: waText(contact) });
  } catch (e) { throw new HttpsError("internal", e.message); }
  const now = Date.now();
  await db.doc("quotes/" + q.id).set({ ...(q.status === "Borrador" ? { status: "Enviada" } : {}), sentAt: now, sentByName: me.name || "", updatedAt: now, updatedBy: me.name || "" }, { merge: true });
  return { ok: true, url: link.url };
});

// Notificaciones push: cada mensaje entrante avisa al equipo en sus dispositivos
const PUSH = require("./notificaciones")({ db });
exports.notificaciones = onCall({ region: REGION, invoker: "public" }, async req => {
  const me = await requireMember(req);
  const { action, subscription, endpoint } = req.data || {};
  try {
    if (action === "key") return { publicKey: (await PUSH.keys()).publicKey };
    if (action === "subscribe") { await PUSH.subscribe(req.auth.uid, me, subscription, req.rawRequest && req.rawRequest.get && req.rawRequest.get("user-agent")); return { ok: true }; }
    if (action === "unsubscribe") { await PUSH.unsubscribe(endpoint); return { ok: true }; }
    if (action === "test") return await PUSH.test(req.auth.uid);
  } catch (e) { console.error("notificaciones", action, e); throw new HttpsError("internal", e.message); }
  throw new HttpsError("invalid-argument", "Acción desconocida.");
});
exports.notificarMensaje = onDocumentCreated({ document: "contacts/{cid}/messages/{mid}", region: REGION }, async event => {
  const m = event.data && event.data.data();
  if (!m || m.dir !== "in") return;
  console.log("push", event.params.cid, await PUSH.onInbound(event.params.cid, m));
});

// Copiloto de ventas: análisis de la conversación, respuestas sugeridas y mejorar el texto del equipo
const COPILOTO = require("./copiloto")({ db, apiKey: () => ANTHROPIC_API_KEY.value() });
exports.copiloto = onCall({ region: REGION, invoker: "public", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: "512MiB" }, async req => {
  await requireMember(req);
  const { action, contactId, text, tone } = req.data || {};
  if (!ANTHROPIC_API_KEY.value()) throw new HttpsError("failed-precondition", "Falta la clave de Claude (ANTHROPIC_API_KEY).");
  try {
    if (action === "mejorar") return { texto: await COPILOTO.mejorar(text, tone) };
    if (!contactId) throw new Error("Falta el contacto.");
    if (action === "analizar") return { ai: await COPILOTO.analizar(String(contactId)) };
    if (action === "sugerir") return { sugerencias: await COPILOTO.sugerir(String(contactId), String(text || "").slice(0, 1000)) };
  } catch (e) { console.error("copiloto", action, e); throw new HttpsError("internal", e.message || "No se pudo completar."); }
  throw new HttpsError("invalid-argument", "Acción desconocida.");
});
// Cada 10 minutos analiza las conversaciones con mensajes nuevos o sin analizar (probabilidad, siguiente paso, riesgo…)
exports.analizarConversaciones = onSchedule({ schedule: "every 10 minutes", timeZone: "America/Bogota", region: REGION, secrets: [ANTHROPIC_API_KEY],
  timeoutSeconds: 540, memory: "512MiB" }, async () => {
  const cfg = await db.doc("settings/asesora").get();
  if (!ANTHROPIC_API_KEY.value() || (cfg.exists && cfg.get("autoAnalisis") === false)) return;
  console.log("análisis automático", await COPILOTO.barrido());
});

// Fotos, audios, videos y documentos que mandan los clientes: se descargan y se guardan para verlos en el chat
const MEDIA_BUCKET = (PROJECT || "crm-casa-dorada") + "-media";
// Transcripción de audios con Speech-to-Text (cuenta de servicio de las funciones, sin claves)
const STT = require("./transcribir")({ project: PROJECT || "crm-casa-dorada", bucketName: MEDIA_BUCKET,
  getToken: async () => (await admin.credential.applicationDefault().getAccessToken()).access_token });
const MEDIA = require("./media")({ db, admin, graph: GRAPH, bucketName: MEDIA_BUCKET, transcribe: (buf, path) => STT.transcribe(buf, path) });
exports.guardarMedia = onDocumentCreated({ document: "contacts/{cid}/messages/{mid}", region: REGION, secrets: [WA_TOKEN], memory: "512MiB", timeoutSeconds: 300 }, async event => {
  const msg = event.data && event.data.data();
  if (!msg || msg.dir !== "in" || !msg.media) return;
  const tgToken = msg.channel === "telegram" ? ((await CH.privateCfg()).telegram || {}).token : "";
  console.log("media", event.params.cid, await MEDIA.saveIncoming({ cid: event.params.cid, mid: event.params.mid, msg, waToken: WA_TOKEN.value(), tgToken }));
});
// Entrega esos archivos solo a personas activas del equipo (la app los pide con su sesión)
exports.media = onRequest({ region: REGION, invoker: "public" }, async (req, res) => {
  try { await MEDIA.serve(req, res); }
  catch (e) { console.error("media", e); res.sendStatus(500); }
});

// Enviar texto por el canal del contacto (o el indicado)
exports.sendMessage = onCall({ region: REGION, invoker: "public", secrets: [WA_TOKEN] }, async req => {
  const me = await requireMember(req);
  const { contactId, text, channel, image } = req.data || {};
  if (!contactId || (!String(text || "").trim() && !image)) throw new HttpsError("invalid-argument", "Falta el contacto o el mensaje.");
  const cref = db.doc("contacts/" + contactId), c = await cref.get();
  if (!c.exists) throw new HttpsError("not-found", "El contacto no existe.");
  const contact = c.data();
  const ch = channel || contact.lastChannel || (contact.phone ? "whatsapp" : "");
  if (!CH.CHANNELS[ch]) throw new HttpsError("failed-precondition", "El contacto no tiene un canal para escribirle.");
  if (!CH.windowOpen(contact, ch, ch === "whatsapp" && await CH.waQrOn())) throw new HttpsError("failed-precondition", "VENTANA_CERRADA");
  const ai = await db.doc("settings/asesora").get();
  const pauseH = ai.exists ? Number(ai.get("pauseHours")) || 12 : 12;
  try {
    return await CH.deliver({ cref, contact, text: String(text || ""), image: image ? String(image) : undefined, channel: ch, msg: { by: req.auth.uid, byName: me.name || "" },
      extra: { unread: 0, aiPausedUntil: Date.now() + pauseH * 3600 * 1000 }, sendWhatsApp: waText(contact) });
  } catch (e) { throw new HttpsError("internal", e.message); }
});

// Telegram: el bot reenvía aquí los mensajes
exports.telegramWebhook = onRequest({ region: REGION, invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") return res.sendStatus(405);
  try { res.sendStatus(await CH.telegramUpdate(req)); }
  catch (e) { console.error("telegram", e); res.sendStatus(500); }
});

// Chat web: lo usa el widget que se pega en la página de la empresa
exports.webchat = onRequest({ region: REGION, invoker: "public" }, async (req, res) => {
  try { await CH.webchat(req, res); }
  catch (e) { console.error("webchat", e); res.status(500).json({ error: "Error del servidor." }); }
});

async function requireAdmin(req) {
  const me = await requireMember(req);
  if (me.role !== "admin") throw new HttpsError("permission-denied", "Solo la administradora puede conectar canales.");
  return me;
}
exports.connectTelegram = onCall({ region: REGION, invoker: "public" }, async req => {
  await requireAdmin(req);
  const token = String((req.data || {}).token || "").trim();
  if (!/^\d+:[\w-]{20,}$/.test(token)) throw new HttpsError("invalid-argument", "Ese no parece un token de Telegram. Debe verse como 123456789:ABC…");
  try { return await CH.connectTelegram(token, `https://${REGION}-${PROJECT}.cloudfunctions.net/telegramWebhook`); }
  catch (e) { throw new HttpsError("failed-precondition", e.message); }
});
exports.connectMeta = onCall({ region: REGION, invoker: "public" }, async req => {
  await requireAdmin(req);
  const { pageToken, igId } = req.data || {};
  if (!pageToken || String(pageToken).length < 20) throw new HttpsError("invalid-argument", "Pega el token de acceso de la página.");
  try { return await CH.connectMeta({ pageToken: String(pageToken).trim(), igId: String(igId || "").trim() }); }
  catch (e) { throw new HttpsError("failed-precondition", e.message); }
});
exports.disconnectChannel = onCall({ region: REGION, invoker: "public" }, async req => {
  await requireAdmin(req);
  const ch = (req.data || {}).channel;
  if (ch === "telegram") {
    const t = ((await CH.privateCfg(true)).telegram || {}).token;
    if (t) await fetch(`https://api.telegram.org/bot${t}/deleteWebhook`).catch(() => {});
    await db.doc("private/channels").set({ telegram: admin.firestore.FieldValue.delete() }, { merge: true });
  } else if (ch === "messenger" || ch === "instagram") {
    await db.doc("private/channels").set({ meta: admin.firestore.FieldValue.delete() }, { merge: true });
    await db.doc("settings/channels").set({ messenger: { on: false }, instagram: { on: false } }, { merge: true });
    return { ok: true };
  } else if (ch !== "web") throw new HttpsError("invalid-argument", "Canal desconocido.");
  await db.doc("settings/channels").set({ [ch]: { on: false } }, { merge: true });
  return { ok: true };
});

// ---------- Automatizaciones y campañas ----------
// Envío común: plantilla de WhatsApp fuera de la ventana, o texto por el canal del contacto
async function autoSend({ cref, contact, text, template, byName, campaign }) {
  const ch = contact.lastChannel || (contact.phone ? "whatsapp" : "web");
  const extra = campaign ? { lastCampaign: campaign } : {};
  const waQr = ch === "whatsapp" && await CH.waQrOn();
  if (template && template.name && ch === "whatsapp" && !CH.windowOpen(contact, ch, waQr)) {
    const to = phoneId(contact.phone);
    if (!to) throw new Error("Sin número de WhatsApp.");
    const params = (template.params || []).map(p => ({ type: "text", text: String(p || "-") }));
    await waSend(cref, { messaging_product: "whatsapp", to, type: "template", template: { name: template.name, language: { code: template.lang || "es" },
      ...(params.length ? { components: [{ type: "body", parameters: params }] } : {}) } }, { text: text || "[Plantilla " + template.name + "]", type: "template", by: "auto", byName, ...(campaign ? { campaign } : {}) }, extra, contact.waLine);
    return;
  }
  if (!text) throw new Error("No hay texto para este canal.");
  if (!CH.windowOpen(contact, ch, waQr)) throw new Error("Ventana de 24 h cerrada.");
  await CH.deliver({ cref, contact, text, channel: ch, msg: { by: "auto", byName, ...(campaign ? { campaign } : {}) }, extra, sendWhatsApp: waText(contact) });
}
const AUTO = require("./automatizaciones")({ db, admin, send: autoSend, waQrOn: () => CH.waQrOn() });
const INT = require("./integraciones")({ db, admin, phoneId });
const AUTO_OPTS = { region: REGION, secrets: [WA_TOKEN] };

exports.autoNuevoContacto = onDocumentCreated({ document: "contacts/{cid}", ...AUTO_OPTS }, async event => {
  const c = event.data && event.data.data();
  if (!c) return;
  console.log("auto nuevo", event.params.cid, await AUTO.onNewContact(event.params.cid, c));
  if (!c.sourceSheet) await INT.emit("contacto.creado", INT.contactOut(event.params.cid, c));
});
exports.autoEtapa = onDocumentUpdated({ document: "contacts/{cid}", ...AUTO_OPTS }, async event => {
  const b = event.data.before.data() || {}, a = event.data.after.data() || {};
  if ((b.stage || "Nuevo") === (a.stage || "Nuevo")) return;
  console.log("auto etapa", event.params.cid, await AUTO.onStageChange(event.params.cid, b, a));
  await INT.emit("etapa.cambiada", { ...INT.contactOut(event.params.cid, a), previousStage: b.stage || "Nuevo" });
});
exports.autoMensaje = onDocumentCreated({ document: "contacts/{cid}/messages/{mid}", ...AUTO_OPTS }, async event => {
  const m = event.data && event.data.data();
  if (!m || m.dir !== "in") return;
  await AUTO.onInbound(event.params.cid, m);
  await INT.emit("mensaje.recibido", { contactId: event.params.cid, text: m.text, channel: m.channel || "whatsapp", ts: m.ts });
});
exports.autoSinRespuesta = onSchedule({ schedule: "every 60 minutes", timeZone: "America/Bogota", ...AUTO_OPTS, timeoutSeconds: 540 }, async () => {
  console.log("auto sin respuesta", await AUTO.sweepNoReply());
  if (WA_PHONE_ID.value()) await waCheck().catch(e => console.error("revisión de WhatsApp", e)); // revisión automática cada hora
});
exports.runCampaign = onCall({ ...AUTO_OPTS, invoker: "public", timeoutSeconds: 540, memory: "512MiB" }, async req => {
  const me = await requireMember(req);
  if (me.role !== "admin") throw new HttpsError("permission-denied", "Solo la administradora puede enviar campañas.");
  const id = String((req.data || {}).id || "");
  if (!id) throw new HttpsError("invalid-argument", "Falta la campaña.");
  try { return await AUTO.runCampaign(id, me.name || ""); }
  catch (e) { throw new HttpsError("failed-precondition", e.message); }
});

// ---------- Integraciones ----------
exports.intCotizacion = onDocumentCreated({ document: "quotes/{id}", region: REGION }, async event => {
  const q = event.data && event.data.data();
  if (q) await INT.emit("cotizacion.creada", { id: event.params.id, number: q.number, contactId: q.contactId, contactName: q.contactName, items: q.items, total: q.total, status: q.status });
});
exports.intPedido = onDocumentCreated({ document: "orders/{id}", region: REGION }, async event => {
  const o = event.data && event.data.data();
  if (o) await INT.emit("pedido.creado", { id: event.params.id, number: o.number, contactId: o.contactId, contactName: o.contactName, items: o.items, total: o.total, status: o.status });
});
exports.integrations = onCall({ region: REGION, invoker: "public" }, async req => {
  const me = await requireMember(req);
  if (me.role !== "admin") throw new HttpsError("permission-denied", "Solo la administradora puede configurar integraciones.");
  try { return await INT.manage((req.data || {}).action, req.data || {}); }
  catch (e) { throw new HttpsError("failed-precondition", e.message); }
});
exports.api = onRequest({ region: REGION, invoker: "public" }, async (req, res) => {
  try { await INT.api(req, res); }
  catch (e) { console.error("api", e); res.status(500).json({ error: "Error del servidor." }); }
});

// ---------- Formularios de captura ----------
const FORMS = require("./formularios")({ db, admin, phoneId, nextAssignee: () => AUTO.nextAssignee() });
exports.forms = onRequest({ region: REGION, invoker: "public" }, async (req, res) => {
  try { await FORMS.handle(req, res); }
  catch (e) { console.error("forms", e); res.status(500).json({ error: "Error del servidor." }); }
});

// ---------- Aplicaciones: Shopify y Siigo ----------
const APPS = require("./apps")({ db, admin, phoneId });
exports.shopifyWebhook = onRequest({ region: REGION, invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") return res.sendStatus(405);
  try { await APPS.shopifyWebhook(req, res); }
  catch (e) { console.error("shopify", e); res.sendStatus(500); } // Shopify reintenta
});
// Descuentos de Shopify al día: se vuelven a leer cada 3 horas (con el acceso de Admin de la tienda)
exports.sincronizarShopify = onSchedule({ schedule: "every 180 minutes", timeZone: "America/Bogota", region: REGION, timeoutSeconds: 300 }, async () => {
  try { console.log("descuentos de Shopify", await APPS.syncDiscounts()); } catch (e) { console.error("descuentos de Shopify", e.message); }
});
exports.apps = onCall({ region: REGION, invoker: "public", timeoutSeconds: 300 }, async req => {
  const me = await requireMember(req);
  const { action } = req.data || {};
  if (action !== "siigoInvoice" && me.role !== "admin") throw new HttpsError("permission-denied", "Solo la administradora puede configurar aplicaciones.");
  try { return await APPS.manage(action, req.data || {}); }
  catch (e) { throw new HttpsError("failed-precondition", e.message); }
});

exports.createTeamUser = onCall({ region: REGION, invoker: "public" }, async req => {
  const me = await requireMember(req);
  if (me.role !== "admin") throw new HttpsError("permission-denied", "Solo la administradora puede agregar personas.");
  const { name, email, password, role } = req.data || {};
  if (!name || !email || !password || String(password).length < 6) throw new HttpsError("invalid-argument", "Faltan datos o la contraseña tiene menos de 6 caracteres.");
  let user;
  try { user = await admin.auth().createUser({ email, password, displayName: name }); }
  catch (e) {
    if (e.code === "auth/email-already-exists") { // ya tuvo cuenta: se reactiva con la contraseña y el nombre nuevos
      user = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(user.uid, { password: String(password), displayName: name, disabled: false });
    }
    else throw new HttpsError("invalid-argument", e.message);
  }
  await db.doc("users/" + user.uid).set({ name, email, role: role === "admin" ? "admin" : "asesor", active: true, createdAt: Date.now() }, { merge: true });
  return { uid: user.uid };
});

exports.setTeamPassword = onCall({ region: REGION, invoker: "public" }, async req => {
  const me = await requireMember(req);
  if (me.role !== "admin") throw new HttpsError("permission-denied", "Solo la administradora puede cambiar contraseñas de otras personas.");
  const { uid, password } = req.data || {};
  if (!uid || !password || String(password).length < 6) throw new HttpsError("invalid-argument", "La contraseña debe tener al menos 6 caracteres.");
  const u = await db.doc("users/" + uid).get();
  if (!u.exists) throw new HttpsError("not-found", "Esa persona no está en el equipo.");
  await admin.auth().updateUser(uid, { password: String(password) });
  return { ok: true };
});

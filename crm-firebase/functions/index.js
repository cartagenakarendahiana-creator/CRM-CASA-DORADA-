// Funciones del CRM Casa Dorada:
// - whatsappWebhook: recibe los mensajes y estados de la API de WhatsApp (Meta)
// - waStatus: revisa con Meta el estado del número, la cuenta y la suscripción (también cada hora)
// - sendWhatsApp: envía texto (ventana de 24 h abierta) o plantillas aprobadas
// - createTeamUser: la administradora crea cuentas para su equipo
// - setTeamPassword: la administradora le pone una contraseña nueva a alguien del equipo
// - asesoraVirtual: la asesora con IA responde los mensajes entrantes (ver asesora.js)
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
  const mref = cref.collection("messages").doc(m.id);
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

async function saveStatus(s) {
  const cid = "wa_" + phoneId(s.recipient_id);
  const ref = db.doc(`contacts/${cid}/messages/${s.id}`);
  const patch = { status: s.status, statusAt: Number(s.timestamp) * 1000 || Date.now() };
  if (s.errors && s.errors[0]) patch.error = s.errors[0].title || s.errors[0].message || "";
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
  return out.messages && out.messages[0] && out.messages[0].id;
}
// WhatsApp por código QR: el puente (carpeta whatsapp-qr) escucha waOutbox y envía desde el celular vinculado
async function waQueue(payload, cid) {
  if (payload.type !== "text" && payload.type !== "image") throw new Error("Con WhatsApp por QR solo se envían textos y fotos, no plantillas.");
  const ref = db.collection("waOutbox").doc();
  await ref.set({ cid: cid || "wa_" + payload.to, to: payload.to || "", status: "pendiente", createdAt: Date.now(),
    ...(payload.type === "image" ? { image: payload.image.link, text: payload.image.caption || "" } : { text: payload.text.body }) });
  return ref.id;
}
// Texto, o foto con pie de foto (image = enlace https)
const waText = contact => async (body, cid, image) => {
  const to = phoneId(contact.phone) || (contact.waJid && cid ? String((contact.channels || {}).whatsapp || "") : "");
  if (!to) throw new Error("El contacto no tiene WhatsApp.");
  return waPost(image ? { messaging_product: "whatsapp", to, type: "image", image: { link: image, ...(body ? { caption: body.slice(0, 1024) } : {}) } }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4096) } }, contact.waLine, cid);
};
// Envía por la API de WhatsApp y registra el mensaje saliente en el contacto
async function waSend(cref, payload, msg, extra = {}, line) {
  const id = await waPost(payload, line, cref.id);
  const now = Date.now();
  await cref.collection("messages").doc(id || db.collection("x").doc().id).set({ dir: "out", ts: now, channel: "whatsapp", ...msg }, { merge: true }); // merge: el estado puede haber llegado antes
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
    send: ({ cref, contact, text, byName, image }) => CH.deliver({ cref, contact, text, image, channel: m.channel || contact.lastChannel,
      msg: { by: "asesora", byName, ai: true }, sendWhatsApp: waText(contact) }) });
  console.log("asesora", event.params.cid, result);
});

// Fotos, audios, videos y documentos que mandan los clientes: se descargan y se guardan para verlos en el chat
const MEDIA = require("./media")({ db, admin, graph: GRAPH, bucketName: (PROJECT || "crm-casa-dorada") + "-media" });
exports.guardarMedia = onDocumentCreated({ document: "contacts/{cid}/messages/{mid}", region: REGION, secrets: [WA_TOKEN], memory: "512MiB", timeoutSeconds: 120 }, async event => {
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
    if (e.code === "auth/email-already-exists") user = await admin.auth().getUserByEmail(email);
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

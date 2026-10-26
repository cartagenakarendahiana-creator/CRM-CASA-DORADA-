// Canales de mensajería además de WhatsApp: Telegram, Messenger, Instagram y el chat web.
// Los tokens viven en private/channels (las reglas impiden leerlo desde la app);
// lo público (si está conectado, nombre del bot, colores del chat web) vive en settings/channels.
const crypto = require("crypto");
const { toTelegramHtml, stripFormat } = require("./ficha");

const CHANNELS = {
  whatsapp: { prefix: "wa_", label: "WhatsApp", window: true },
  telegram: { prefix: "tg_", label: "Telegram", window: false },
  messenger: { prefix: "fb_", label: "Messenger", window: true },
  instagram: { prefix: "ig_", label: "Instagram", window: true },
  web: { prefix: "web_", label: "Chat web", window: false },
};
const DAY = 24 * 3600 * 1000;

module.exports = function canales({ db, admin, GRAPH, fetchFn = (...a) => fetch(...a) }) {
  let cache = null, cacheAt = 0;
  async function privateCfg(fresh) {
    if (!fresh && cache && Date.now() - cacheAt < 60000) return cache;
    const s = await db.doc("private/channels").get();
    cache = s.exists ? s.data() : {}; cacheAt = Date.now();
    return cache;
  }
  const tgSecret = token => crypto.createHmac("sha256", "casa-dorada-tg").update(String(token)).digest("hex").slice(0, 48);

  // Guarda un mensaje entrante de cualquier canal y crea o actualiza el contacto
  async function ingest({ channel, extId, msgId, text, type = "text", ts = Date.now(), name = "", extra = {}, media = null }) {
    const ch = CHANNELS[channel];
    const cid = ch.prefix + String(extId).replace(/[^\w-]/g, "");
    const cref = db.doc("contacts/" + cid);
    const mref = cref.collection("messages").doc(String(msgId || db.collection("x").doc().id).replace(/[\/]/g, "_"));
    let created = false;
    await db.runTransaction(async t => {
      const [snap, msnap] = await Promise.all([t.get(cref), t.get(mref)]);
      if (msnap.exists) return; // reintentos del proveedor
      const patch = { lastInboundAt: ts, lastMessage: String(text).slice(0, 200), lastMessageDir: "in", lastChannel: channel,
        ["channels." + channel]: String(extId), unread: admin.firestore.FieldValue.increment(1), updatedAt: Date.now(), updatedBy: ch.label, ...extra };
      if (!snap.exists) {
        created = true;
        Object.assign(patch, { name: name || "", segment: ch.label, type: "Prospecto", stage: "Nuevo", createdAt: ts, stageAt: ts, source: ch.label });
        delete patch["channels." + channel];
        patch.channels = { [channel]: String(extId) };
        t.set(cref, patch, { merge: true });
      } else {
        if (!snap.get("name") && name) patch.name = name;
        t.update(cref, patch);
      }
      t.set(mref, { dir: "in", text: String(text), type, ts, channel, extId: String(msgId || ""), ...(media ? { media } : {}) });
    });
    return { cid, created };
  }

  // Envía texto (o una foto o un documento PDF con su texto como pie) por el canal del contacto y lo registra
  // document: { url (https), filename }
  async function deliver({ cref, contact, text, msg = {}, extra = {}, channel, sendWhatsApp, image, document }) {
    const ch = channel || contact.lastChannel || (contact.phone ? "whatsapp" : null);
    if (!CHANNELS[ch]) throw new Error("El contacto no tiene un canal para escribirle.");
    if (image && !/^https:\/\/\S+$/.test(image)) throw new Error("La foto debe ser un enlace https.");
    if (document && !/^https:\/\/\S+$/.test(document.url || "")) throw new Error("El documento debe ser un enlace https.");
    if (document) image = undefined;
    const extId = (contact.channels || {})[ch];
    const body = String(text || "").slice(0, image ? 1000 : 4000);
    let id = null;
    if (ch === "whatsapp") id = await sendWhatsApp(body, cref.id, image, document);
    else if (ch === "telegram") {
      const cfg = (await privateCfg()).telegram || {};
      if (!cfg.token) throw new Error("Telegram no está conectado.");
      const r = await fetchFn(`https://api.telegram.org/bot${cfg.token}/${document ? "sendDocument" : image ? "sendPhoto" : "sendMessage"}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(document ? { chat_id: extId, document: document.url, caption: toTelegramHtml(body), parse_mode: "HTML" }
          : image ? { chat_id: extId, photo: image, caption: toTelegramHtml(body), parse_mode: "HTML" } : { chat_id: extId, text: toTelegramHtml(body), parse_mode: "HTML" }) });
      const out = await r.json().catch(() => ({}));
      if (!out.ok) throw new Error(out.description || "Telegram rechazó el mensaje.");
      id = "tg" + out.result.message_id;
    } else if (ch === "messenger" || ch === "instagram") {
      const cfg = (await privateCfg()).meta || {};
      if (!cfg.pageToken) throw new Error("Messenger e Instagram no están conectados.");
      const post = async message => {
        const r = await fetchFn(`${GRAPH}/me/messages?access_token=${encodeURIComponent(cfg.pageToken)}`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: extId }, messaging_type: "RESPONSE", message }) });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((out.error && out.error.message) || "Meta rechazó el mensaje.");
        return out.message_id;
      };
      if (image) id = await post({ attachment: { type: "image", payload: { url: image, is_reusable: true } } }); // Meta no admite pie de foto: el texto va aparte
      if (document && ch === "messenger") id = await post({ attachment: { type: "file", payload: { url: document.url, is_reusable: true } } });
      const txt = stripFormat(body) + (document && ch === "instagram" ? "\n\n" + document.url : ""); // Instagram no recibe archivos: va el enlace
      if (txt.trim()) id = await post({ text: txt.slice(0, 1000) }); // Messenger e Instagram no muestran *negrita*
    }
    // web: no hay envío externo, el widget lee el mensaje
    const now = Date.now(), shown = document ? "📄 " + (document.filename || "Documento") : image ? "📷 " + (body || "Foto") : body;
    const docId = String(id || db.collection("x").doc().id).replace(/[\/]/g, "_");
    await cref.collection("messages").doc(docId).set({ dir: "out", ts: now, text: body, type: document ? "document" : image ? "image" : "text", channel: ch, ...(image ? { image } : {}),
      ...(document ? { document: { url: document.url, filename: document.filename || "documento.pdf" } } : {}), ...msg }, { merge: true });
    await cref.set({ lastOutboundAt: now, lastOutboundBy: msg.byName || "", lastMessage: shown.slice(0, 200), lastMessageDir: "out", updatedAt: now, updatedBy: msg.byName || "", ...extra }, { merge: true });
    return { id: docId, channel: ch };
  }

  // waQr: WhatsApp conectado por código QR (sin la regla de 24 h de la API oficial)
  const windowOpen = (contact, ch, waQr) => !CHANNELS[ch] || !CHANNELS[ch].window || (ch === "whatsapp" && !!waQr) || Date.now() - (contact.lastInboundAt || 0) < DAY;
  let qrCache = null, qrAt = 0;
  async function waQrOn() {
    if (qrCache === null || Date.now() - qrAt > 30000) { qrCache = !!((((await db.doc("settings/channels").get()).data() || {}).waqr || {}).on); qrAt = Date.now(); }
    return qrCache;
  }

  // ---------- Telegram ----------
  async function telegramUpdate(req) {
    const cfg = (await privateCfg()).telegram || {};
    if (!cfg.token || req.get("x-telegram-bot-api-secret-token") !== tgSecret(cfg.token)) return 401;
    const m = (req.body || {}).message || (req.body || {}).edited_message;
    if (!m || !m.chat || m.chat.type !== "private") return 200;
    const name = [m.from && m.from.first_name, m.from && m.from.last_name].filter(Boolean).join(" ");
    const text = m.text || (m.photo ? "[Imagen] " + (m.caption || "") : m.voice ? "[Audio]" : m.document ? "[Documento] " + (m.document.file_name || "")
      : m.sticker ? "[Sticker] " + (m.sticker.emoji || "") : m.location ? "[Ubicación]" : m.contact ? "[Contacto] " + (m.contact.phone_number || "") : "[Mensaje]");
    const extra = m.contact && m.contact.phone_number ? { phone: "+" + String(m.contact.phone_number).replace(/\D/g, "") } : {};
    // Archivo adjunto (la foto más grande, nota de voz, audio, video, documento o sticker): lo descarga la función guardarMedia
    const f = m.photo ? { kind: "image", fileId: m.photo[m.photo.length - 1].file_id, mime: "image/jpeg" } : m.voice ? { kind: "audio", fileId: m.voice.file_id, mime: m.voice.mime_type || "audio/ogg" }
      : m.audio ? { kind: "audio", fileId: m.audio.file_id, mime: m.audio.mime_type || "", filename: m.audio.file_name || "" } : m.video ? { kind: "video", fileId: m.video.file_id, mime: m.video.mime_type || "video/mp4" }
      : m.document ? { kind: "document", fileId: m.document.file_id, mime: m.document.mime_type || "", filename: m.document.file_name || "" }
      : m.sticker && !m.sticker.is_animated && !m.sticker.is_video ? { kind: "image", fileId: m.sticker.file_id, mime: "image/webp" } : null;
    await ingest({ channel: "telegram", extId: m.chat.id, msgId: "tg_in_" + m.message_id, text: text.trim(), ts: (m.date || 0) * 1000 || Date.now(), name, extra,
      type: f ? f.kind : "text", media: f });
    return 200;
  }
  async function connectTelegram(token, webhookUrl) {
    const me = await (await fetchFn(`https://api.telegram.org/bot${token}/getMe`)).json().catch(() => ({}));
    if (!me.ok) throw new Error("El token de Telegram no es válido. Cópialo completo desde @BotFather.");
    const set = await (await fetchFn(`https://api.telegram.org/bot${token}/setWebhook`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, secret_token: tgSecret(token), allowed_updates: ["message", "edited_message"] }) })).json().catch(() => ({}));
    if (!set.ok) throw new Error("Telegram no aceptó la conexión: " + (set.description || ""));
    await db.doc("private/channels").set({ telegram: { token } }, { merge: true });
    await db.doc("settings/channels").set({ telegram: { on: true, username: me.result.username, name: me.result.first_name, at: Date.now() } }, { merge: true });
    cache = null;
    return { username: me.result.username };
  }

  // ---------- Messenger e Instagram (llegan por el mismo webhook de Meta) ----------
  async function metaProfile(id, channel) {
    try {
      const cfg = (await privateCfg()).meta || {};
      const fields = channel === "instagram" ? "name,username" : "first_name,last_name";
      const p = await (await fetchFn(`${GRAPH}/${id}?fields=${fields}&access_token=${encodeURIComponent(cfg.pageToken || "")}`)).json();
      return p.name || p.username || [p.first_name, p.last_name].filter(Boolean).join(" ") || "";
    } catch { return ""; }
  }
  async function metaEvents(body) {
    const channel = body.object === "instagram" ? "instagram" : "messenger";
    const cfg = (await privateCfg()).meta || {};
    const own = new Set([cfg.pageId, cfg.igId].filter(Boolean).map(String));
    for (const entry of body.entry || []) {
      for (const ev of entry.messaging || []) {
        const m = ev.message;
        if (!m || m.is_echo || !ev.sender || own.has(String(ev.sender.id))) continue;
        const att = (m.attachments || [])[0];
        const text = m.text || (att ? "[" + ({ image: "Imagen", video: "Video", audio: "Audio", file: "Documento" }[att.type] || "Adjunto") + "]" : "[Mensaje]");
        const exists = (await db.doc("contacts/" + CHANNELS[channel].prefix + ev.sender.id).get()).exists;
        const name = exists ? "" : await metaProfile(ev.sender.id, channel);
        const kind = att && { image: "image", video: "video", audio: "audio", file: "document" }[att.type];
        await ingest({ channel, extId: ev.sender.id, msgId: m.mid, text, ts: ev.timestamp || Date.now(), name,
          type: kind || "text", media: kind && att.payload && att.payload.url ? { kind, url: att.payload.url } : null });
      }
    }
  }
  async function connectMeta({ pageToken, igId }) {
    const page = await (await fetchFn(`${GRAPH}/me?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(pageToken)}`)).json().catch(() => ({}));
    if (!page.id) throw new Error("El token de la página no es válido: " + ((page.error && page.error.message) || ""));
    const ig = igId || (page.instagram_business_account && page.instagram_business_account.id) || "";
    const sub = await (await fetchFn(`${GRAPH}/${page.id}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(pageToken)}`, { method: "POST" })).json().catch(() => ({}));
    await db.doc("private/channels").set({ meta: { pageToken, pageId: page.id, igId: ig } }, { merge: true });
    await db.doc("settings/channels").set({ messenger: { on: true, pageName: page.name, at: Date.now() }, instagram: { on: !!ig, at: Date.now() } }, { merge: true });
    cache = null;
    return { pageName: page.name, instagram: !!ig, subscribed: !!sub.success };
  }

  // ---------- Chat web ----------
  async function webchat(req, res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    const pub = ((await db.doc("settings/channels").get()).data() || {}).web || {};
    if (req.method === "GET" && req.query.cfg) {
      return res.json({ on: !!pub.on, title: pub.title || "Casa Dorada", greeting: pub.greeting || "¡Hola! ¿En qué te podemos ayudar?", color: pub.color || "#0f7a4c", askName: pub.askName !== false });
    }
    if (!pub.on) return res.status(403).json({ error: "El chat no está activo." });
    const sid = String((req.method === "GET" ? req.query.sid : (req.body || {}).sid) || "");
    if (!/^[a-z0-9]{16,40}$/.test(sid)) return res.status(400).json({ error: "Sesión inválida." });
    const cref = db.doc("contacts/web_" + sid);
    if (req.method === "GET") {
      const after = Number(req.query.after) || 0;
      const snap = await cref.collection("messages").where("ts", ">", after).orderBy("ts").limit(50).get();
      const msgs = snap.docs.map(d => d.data()).filter(m => m.dir === "in" || m.dir === "out").map(m => ({ dir: m.dir, text: m.text, ts: m.ts, by: m.dir === "out" ? (m.byName || "").replace(/ · IA$/, "") : "", ...(m.image ? { image: m.image } : {}), ...(m.document ? { document: m.document } : {}) }));
      return res.json({ msgs });
    }
    if (req.method !== "POST") return res.sendStatus(405);
    const b = req.body || {};
    const text = String(b.text || "").trim().slice(0, 1000);
    if (!text) return res.status(400).json({ error: "Mensaje vacío." });
    // Límite simple contra abuso: 20 mensajes por minuto por visitante
    const cs = await cref.get(), c = cs.exists ? cs.data() : {};
    const win = Math.floor(Date.now() / 60000);
    if (c.webRate && c.webRate.w === win && c.webRate.n >= 20) return res.status(429).json({ error: "Demasiados mensajes, espera un momento." });
    const extra = { webRate: { w: win, n: c.webRate && c.webRate.w === win ? c.webRate.n + 1 : 1 } };
    const name = String(b.name || "").trim().slice(0, 80);
    const phone = String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 20);
    if (phone && !c.phone) extra.phone = phone;
    if (b.page) extra.webPage = String(b.page).slice(0, 300);
    if (name && c.name !== name && !c.name) extra.name = name;
    const ts = Date.now();
    await ingest({ channel: "web", extId: sid, msgId: "web_in_" + ts + "_" + crypto.randomBytes(3).toString("hex"), text, ts, name, extra });
    return res.json({ ok: true, ts });
  }

  return { CHANNELS, ingest, deliver, windowOpen, waQrOn, telegramUpdate, connectTelegram, metaEvents, connectMeta, webchat, privateCfg, tgSecret };
};
module.exports.CHANNELS = CHANNELS;

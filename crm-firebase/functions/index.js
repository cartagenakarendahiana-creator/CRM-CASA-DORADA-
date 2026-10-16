// Funciones del CRM Casa Dorada:
// - whatsappWebhook: recibe los mensajes y estados de la API de WhatsApp (Meta)
// - sendWhatsApp: envía texto (ventana de 24 h abierta) o plantillas aprobadas
// - createTeamUser: la administradora crea cuentas para su equipo
const crypto = require("crypto");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
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

const DAY = 24 * 3600 * 1000;

function phoneId(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 10 && d[0] === "3") d = "57" + d;
  return d;
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

exports.whatsappWebhook = onRequest({ region: REGION, secrets: [WA_VERIFY_TOKEN, WA_APP_SECRET] }, async (req, res) => {
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
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const names = {};
      (v.contacts || []).forEach(c => { names[c.wa_id] = c.profile && c.profile.name; });
      for (const m of v.messages || []) await saveInbound(m, names[m.from]);
      for (const s of v.statuses || []) await saveStatus(s);
    }
  }
}
exports._handleWebhook = handleWebhook; // para pruebas

async function saveInbound(m, profileName) {
  const pid = phoneId(m.from), cid = "wa_" + pid;
  const ts = Number(m.timestamp) * 1000 || Date.now();
  const text = textOf(m);
  const cref = db.doc("contacts/" + cid);
  const mref = cref.collection("messages").doc(m.id);
  await db.runTransaction(async t => {
    const [snap, msnap] = await Promise.all([t.get(cref), t.get(mref)]);
    if (msnap.exists) return; // Meta puede reenviar el mismo mensaje
    const patch = { phone: "+" + pid, lastInboundAt: ts, lastMessage: text.slice(0, 200), lastMessageDir: "in",
      unread: admin.firestore.FieldValue.increment(1), updatedAt: Date.now(), updatedBy: "WhatsApp" };
    if (!snap.exists) Object.assign(patch, { name: profileName || "", segment: "WhatsApp", type: "Prospecto", stage: "Nuevo",
      createdAt: ts, stageAt: ts, source: "WhatsApp" });
    else if (!snap.get("name") && profileName) patch.name = profileName;
    t.set(cref, patch, { merge: true });
    t.set(mref, { dir: "in", text, type: m.type, ts, waId: m.id });
  });
}

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

exports.sendWhatsApp = onCall({ region: REGION, secrets: [WA_TOKEN] }, async req => {
  const me = await requireMember(req);
  const { contactId, text, template, preview } = req.data || {};
  if (!contactId) throw new HttpsError("invalid-argument", "Falta el contacto.");
  const cref = db.doc("contacts/" + contactId), c = await cref.get();
  if (!c.exists) throw new HttpsError("not-found", "El contacto no existe.");
  const to = phoneId(c.get("phone"));
  if (!to) throw new HttpsError("failed-precondition", "El contacto no tiene WhatsApp.");
  const phoneNumberId = WA_PHONE_ID.value();
  if (!phoneNumberId) throw new HttpsError("failed-precondition", "Falta configurar WA_PHONE_ID.");

  let payload, shown;
  if (text) {
    const open = Date.now() - (c.get("lastInboundAt") || 0) < DAY;
    if (!open) throw new HttpsError("failed-precondition", "VENTANA_CERRADA");
    payload = { messaging_product: "whatsapp", to, type: "text", text: { body: String(text).slice(0, 4096) } };
    shown = String(text);
  } else if (template && template.name) {
    const params = (template.params || []).map(p => ({ type: "text", text: String(p || "-") }));
    payload = { messaging_product: "whatsapp", to, type: "template",
      template: { name: template.name, language: { code: template.lang || "es" }, ...(params.length ? { components: [{ type: "body", parameters: params }] } : {}) } };
    shown = preview || "[Plantilla " + template.name + "]";
  } else throw new HttpsError("invalid-argument", "Falta el mensaje.");

  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST", headers: { Authorization: "Bearer " + WA_TOKEN.value(), "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpsError("internal", (out.error && (out.error.error_user_msg || out.error.message)) || "WhatsApp rechazó el mensaje.");
  const id = out.messages && out.messages[0] && out.messages[0].id;
  const now = Date.now();
  await cref.collection("messages").doc(id || db.collection("x").doc().id).set({ dir: "out", text: shown, ts: now, by: req.auth.uid, byName: me.name || "",
    type: text ? "text" : "template" }, { merge: true }); // merge: el estado puede haber llegado antes
  await cref.set({ lastOutboundAt: now, lastOutboundBy: me.name || "", lastMessage: shown.slice(0, 200), lastMessageDir: "out", unread: 0, updatedAt: now, updatedBy: me.name || "" }, { merge: true });
  return { id };
});

exports.createTeamUser = onCall({ region: REGION }, async req => {
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

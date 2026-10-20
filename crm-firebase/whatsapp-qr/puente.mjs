// Puente de WhatsApp por código QR para House Chat (como WhatsApp Web, sin la API de Meta).
// Corre en un servidor pequeño encendido 24/7 (ver arranque.sh y la guía de instalación).
//   - Mensajes que llegan al celular vinculado → contacts/{cid} y contacts/{cid}/messages (igual que el webhook oficial)
//   - Mensajes que escribes desde el celular → también quedan en el historial
//   - waOutbox (lo llenan las funciones al responder desde el CRM o la asesora) → se envían con pausas
//   - waqr/state: estado y código QR (solo la administradora lo ve); waqr/cmd: órdenes desde la app (vincular, desvincular)
//   - settings/channels.waqr: { on, phone, name } para que el equipo sepa que WhatsApp está conectado
// Aviso: WhatsApp no permite oficialmente esta forma de conexión y puede bloquear el número.
import fs from "node:fs";
import admin from "firebase-admin";
import QRCode from "qrcode";
import pino from "pino";
import * as Bmod from "baileys";

const B = Bmod.makeWASocket ? Bmod : (Bmod.default && Bmod.default.makeWASocket ? Bmod.default : Bmod);
const makeWASocket = B.makeWASocket || B.default;
const { useMultiFileAuthState, DisconnectReason = {}, fetchLatestBaileysVersion, Browsers } = B;

const SESSION = process.env.WA_SESSION_DIR || "./sesion";
const STARTED = Date.now();
const DAY = 24 * 3600 * 1000;
const log = (...a) => console.log(new Date().toISOString(), ...a);

admin.initializeApp(process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : undefined);
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const stateRef = db.doc("waqr/state");

let sock = null, connected = false, pairing = false, me = null;
const sentByUs = new Map(); // id de WhatsApp → { cid, mid } de lo que envió el CRM (para estados y para no duplicar)

const setState = patch => stateRef.set({ ...patch, seenAt: Date.now() }, { merge: true }).catch(e => log("estado", e.message));
const setPublic = patch => db.doc("settings/channels").set({ waqr: { ...patch, at: Date.now() } }, { merge: true });
const num = v => Number(v && typeof v === "object" && "low" in v ? v.low : v) || 0;
const digitsOf = jid => String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
const isPn = jid => /@s\.whatsapp\.net$/.test(String(jid || ""));
const hasSession = () => { try { return !!JSON.parse(fs.readFileSync(SESSION + "/creds.json", "utf8")).me; } catch { return false; } };
const newId = () => "3EB0" + [...Array(18)].map(() => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");

// ---------- Texto legible de un mensaje ----------
function unwrap(m) {
  let x = m || {};
  for (let i = 0; i < 5; i++) {
    const inner = x.ephemeralMessage || x.viewOnceMessage || x.viewOnceMessageV2 || x.viewOnceMessageV2Extension || x.documentWithCaptionMessage || x.editedMessage;
    if (!inner || !inner.message) break;
    x = inner.message;
  }
  return x;
}
export function textOf(raw) {
  const m = unwrap(raw);
  const cap = c => (c ? " " + c : "");
  if (m.conversation) return { text: m.conversation, type: "text" };
  if (m.extendedTextMessage) return { text: m.extendedTextMessage.text || "", type: "text" };
  if (m.imageMessage) return { text: "[Imagen]" + cap(m.imageMessage.caption), type: "image" };
  if (m.videoMessage) return { text: "[Video]" + cap(m.videoMessage.caption), type: "video" };
  if (m.audioMessage) return { text: m.audioMessage.ptt ? "[Nota de voz]" : "[Audio]", type: "audio" };
  if (m.documentMessage) return { text: "[Documento] " + (m.documentMessage.fileName || "") + cap(m.documentMessage.caption), type: "document" };
  if (m.stickerMessage) return { text: "[Sticker]", type: "sticker" };
  if (m.locationMessage) return { text: "[Ubicación] " + (m.locationMessage.name || `${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}`), type: "location" };
  if (m.liveLocationMessage) return { text: "[Ubicación en tiempo real]", type: "location" };
  if (m.contactMessage || m.contactsArrayMessage) return { text: "[Contacto compartido] " + ((m.contactMessage && m.contactMessage.displayName) || ""), type: "contacts" };
  if (m.reactionMessage) return m.reactionMessage.text ? { text: "[Reacción] " + m.reactionMessage.text, type: "reaction" } : null;
  if (m.buttonsResponseMessage) return { text: m.buttonsResponseMessage.selectedDisplayText || "[respuesta]", type: "button" };
  if (m.listResponseMessage) return { text: m.listResponseMessage.title || "[respuesta]", type: "interactive" };
  if (m.templateButtonReplyMessage) return { text: m.templateButtonReplyMessage.selectedDisplayText || "[respuesta]", type: "button" };
  if (m.pollCreationMessage || m.pollCreationMessageV3) return { text: "[Encuesta] " + ((m.pollCreationMessage || m.pollCreationMessageV3).name || ""), type: "poll" };
  return null; // mensajes internos de WhatsApp (claves, borrados, etc.)
}

// ¿A quién corresponde el chat? Con los identificadores nuevos de WhatsApp (@lid) se busca el número real
async function peerOf(key) {
  const jid = key.remoteJid;
  let pn = isPn(jid) ? jid : [key.remoteJidAlt, key.senderPn].find(isPn) || null;
  if (!pn && /@lid$/.test(jid)) {
    try { const m = sock.signalRepository && sock.signalRepository.lidMapping; const r = m && m.getPNForLID ? await m.getPNForLID(jid) : null; if (isPn(r)) pn = r; } catch {}
  }
  const d = digitsOf(pn || jid);
  return { jid: pn || jid, cid: pn ? "wa_" + d : "wa_lid" + d, phone: pn ? "+" + d : "", ext: d };
}

let pauseCache = { v: 12, at: 0 };
async function pauseHours() {
  if (Date.now() - pauseCache.at > 300000) { const s = await db.doc("settings/asesora").get(); pauseCache = { v: (s.exists && Number(s.get("pauseHours"))) || 12, at: Date.now() }; }
  return pauseCache.v;
}

export async function saveMessage(m) {
  const jid = m.key && m.key.remoteJid;
  if (!jid || /@(g\.us|broadcast|newsletter)$/.test(jid) || jid === "status@broadcast") return "omitido";
  if (m.key.fromMe && sentByUs.has(m.key.id)) return "eco";
  const t = textOf(m.message);
  if (!t) return "sin-texto";
  const ts = num(m.messageTimestamp) * 1000 || Date.now();
  if (ts < STARTED - 10 * 60000) return "antiguo"; // historial que WhatsApp sincroniza al conectar
  const p = await peerOf(m.key);
  const cref = db.doc("contacts/" + p.cid), mref = cref.collection("messages").doc(String(m.key.id).replace(/\//g, "_"));
  const out = !!m.key.fromMe, pause = out ? await pauseHours() : 0;
  return db.runTransaction(async tx => {
    const [snap, msnap] = await Promise.all([tx.get(cref), tx.get(mref)]);
    if (msnap.exists) return "repetido";
    const patch = { lastMessage: t.text.slice(0, 200), lastMessageDir: out ? "out" : "in", lastChannel: "whatsapp", channels: { whatsapp: p.ext }, waJid: p.jid,
      updatedAt: Date.now(), updatedBy: "WhatsApp" };
    if (p.phone) patch.phone = p.phone;
    if (out) Object.assign(patch, { lastOutboundAt: ts, lastOutboundBy: "Celular", unread: 0, aiPausedUntil: Date.now() + pause * 3600 * 1000 });
    else Object.assign(patch, { lastInboundAt: ts, unread: FV.increment(1) });
    if (!snap.exists) Object.assign(patch, { name: out ? "" : m.pushName || "", segment: "WhatsApp", type: "Prospecto", stage: "Nuevo", createdAt: ts, stageAt: ts, source: "WhatsApp" });
    else if (!out && !snap.get("name") && m.pushName) patch.name = m.pushName;
    tx.set(cref, patch, { merge: true });
    tx.set(mref, out ? { dir: "out", text: t.text, type: t.type, ts, waId: m.key.id, channel: "whatsapp", via: "qr", by: "celular", byName: "Desde el celular", status: "sent" }
      : { dir: "in", text: t.text, type: t.type, ts, waId: m.key.id, channel: "whatsapp", via: "qr" });
    return out ? "saliente" : "entrante";
  });
}

// ---------- Cola de envío (waOutbox) ----------
const STATUS = { 1: "sent", 2: "sent", 3: "delivered", 4: "read", 5: "read" };
let queue = Promise.resolve(), queued = new Set();
const sleep = ms => new Promise(r => setTimeout(r, ms));
export const gap = () => 2500 + Math.floor(Math.random() * 3500); // pausa entre mensajes, para no parecer un robot

async function sendOne(doc) {
  const ref = doc.ref, fresh = await ref.get(), o = fresh.data() || {};
  if (o.status !== "pendiente") return; // ya se envió (la lista de la cola puede venir atrasada)
  if (Date.now() - (o.createdAt || 0) > DAY) { await fail(ref, o, "No se envió: WhatsApp estuvo desconectado más de 24 horas."); return; }
  const ws = sock;
  if (!ws || !connected) { queued.delete(doc.id); return; } // sigue en la cola hasta que vuelva la conexión
  const c = (await db.doc("contacts/" + o.cid).get()).data() || {};
  const jid = c.waJid || (o.to ? o.to + "@s.whatsapp.net" : "");
  if (!jid) { await fail(ref, o, "El contacto no tiene número de WhatsApp."); return; }
  try {
    await ws.sendPresenceUpdate("composing", jid).catch(() => {});
    await sleep(Math.min(4000, 800 + String(o.text).length * 25));
    const id = newId(); // se registra antes de enviar: WhatsApp devuelve el eco del mensaje enseguida
    sentByUs.set(id, { cid: o.cid, mid: doc.id }); if (sentByUs.size > 5000) sentByUs.delete(sentByUs.keys().next().value);
    const sent = await ws.sendMessage(jid, { text: String(o.text) }, { messageId: id });
    const wid = (sent && sent.key && sent.key.id) || id;
    if (wid !== id) sentByUs.set(wid, { cid: o.cid, mid: doc.id });
    await ref.set({ status: "enviado", sentAt: Date.now(), waKey: wid || "" }, { merge: true });
    await db.doc(`contacts/${o.cid}/messages/${doc.id}`).set({ status: "sent", statusAt: Date.now(), waId: wid || "" }, { merge: true });
    log("enviado", o.cid);
  } catch (e) { await fail(ref, o, "WhatsApp no lo envió: " + (e.message || e)); }
}
async function fail(ref, o, error) {
  await ref.set({ status: "error", error, at: Date.now() }, { merge: true });
  await db.doc(`contacts/${o.cid}/messages/${ref.id}`).set({ status: "failed", error, statusAt: Date.now() }, { merge: true });
  log("error", o.cid, error);
}
function drain(docs) {
  for (const d of docs) {
    if (queued.has(d.id)) continue;
    queued.add(d.id);
    queue = queue.then(async () => { if (!connected || !sock) { queued.delete(d.id); return; } await sendOne(d); await sleep(gap()); })
      .catch(e => log("cola", e.message)).finally(() => setTimeout(() => queued.delete(d.id), 60000));
  }
}
let outboxDocs = [];
db.collection("waOutbox").where("status", "==", "pendiente").onSnapshot(s => { outboxDocs = s.docs; if (connected) drain(s.docs); }, e => log("waOutbox", e.message));

// ---------- Conexión con WhatsApp ----------
async function start() {
  if (sock || !makeWASocket) return;
  const { state, saveCreds } = await useMultiFileAuthState(SESSION);
  let version;
  try { version = fetchLatestBaileysVersion ? (await fetchLatestBaileysVersion()).version : undefined; } catch {}
  pairing = !state.creds.me;
  await setState({ status: pairing ? "iniciando" : "conectando", qr: null, error: "" });
  const s = makeWASocket({ auth: state, version, logger: pino({ level: "warn" }), printQRInTerminal: false, markOnlineOnConnect: false,
    syncFullHistory: false, shouldSyncHistoryMessage: () => false, browser: Browsers && Browsers.macOS ? Browsers.macOS("Desktop") : ["House Chat", "Chrome", "1.0"] });
  sock = s;
  s.ev.on("creds.update", saveCreds);
  s.ev.on("connection.update", async u => {
    if (u.qr) {
      const qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 300 });
      await setState({ status: "esperando_qr", qr, qrAt: Date.now() });
      log("nuevo código QR");
    }
    if (u.connection === "open") {
      connected = true; pairing = false;
      me = { phone: "+" + digitsOf(s.user && s.user.id), name: (s.user && (s.user.name || s.user.verifiedName)) || "" };
      await setState({ status: "conectado", qr: null, error: "", phone: me.phone, name: me.name, connectedAt: Date.now() });
      await setPublic({ on: true, phone: me.phone, name: me.name });
      log("conectado", me.phone);
      drain(outboxDocs);
    }
    if (u.connection === "close") {
      if (sock !== s) return; // socket viejo (reinicio o desvinculación)
      connected = false; sock = null;
      const code = u.lastDisconnect && u.lastDisconnect.error && u.lastDisconnect.error.output && u.lastDisconnect.error.output.statusCode;
      log("desconectado", code);
      if (code === (DisconnectReason.loggedOut || 401)) return unlink("Se cerró la sesión desde el celular. Vuelve a vincular.");
      if (pairing && !hasSession()) { await setState({ status: "sin_vincular", qr: null, error: "El código QR venció. Toca «Mostrar código QR» otra vez." }); return; }
      await setState({ status: "reconectando", qr: null });
      setTimeout(() => start().catch(e => log("inicio", e.message)), code === (DisconnectReason.restartRequired || 515) ? 500 : 5000);
    }
  });
  s.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages || []) { try { const r = await saveMessage(m); if (r === "entrante" || r === "saliente") log(r, m.key.remoteJid); } catch (e) { log("guardar", e.message); } }
  });
  s.ev.on("messages.update", async ups => {
    for (const { key, update } of ups || []) {
      const ref = key && sentByUs.get(key.id), st = update && STATUS[update.status];
      if (ref && st) await db.doc(`contacts/${ref.cid}/messages/${ref.mid}`).set({ status: st, statusAt: Date.now() }, { merge: true }).catch(() => {});
    }
  });
}

async function unlink(why) {
  connected = false;
  const s0 = sock; sock = null;
  try { if (s0) await s0.logout(); } catch {}
  fs.rmSync(SESSION, { recursive: true, force: true });
  await setState({ status: "sin_vincular", qr: null, phone: "", name: "", error: why || "" });
  await setPublic({ on: false, phone: "", name: "" });
  log("desvinculado", why || "");
}

// Órdenes desde la app: { action: "vincular" | "desvincular" | "reiniciar", at }
let lastCmd = Date.now() - 2 * 60000;
db.doc("waqr/cmd").onSnapshot(async s => {
  const c = s.data();
  if (!c || !c.at || c.at <= lastCmd) return;
  lastCmd = c.at;
  log("orden", c.action);
  try {
    if (c.action === "vincular" && !connected && !sock) await start();
    else if (c.action === "desvincular") await unlink("Desvinculado desde House Chat.");
    else if (c.action === "reiniciar") { const s0 = sock; sock = null; connected = false; try { s0 && s0.end(new Error("reinicio")); } catch {} await start(); }
  } catch (e) { await setState({ error: String(e.message || e) }); }
}, e => log("waqr/cmd", e.message));

setInterval(() => { setState({}); if (connected) drain(outboxDocs); }, 60000); // latido: la app sabe que el servidor está encendido; y reintenta la cola

if (process.env.PUENTE_SIN_INICIO !== "1") {
  if (hasSession()) start().catch(e => log("inicio", e.message));
  else { await setState({ status: "sin_vincular", qr: null }); await setPublic({ on: false }); }
  log("puente listo", hasSession() ? "(con sesión guardada)" : "(sin vincular)");
}
export const _test = { get sock() { return sock; }, set sock(v) { sock = v; }, set connected(v) { connected = v; }, drain, sentByUs, start, unlink };

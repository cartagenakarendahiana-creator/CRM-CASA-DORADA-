// Notificaciones push (Web Push estándar, sin servicios externos): avisan al equipo cada vez que un cliente escribe,
// aunque House Chat esté cerrado (en iPhone/iPad: con House Chat agregado a la pantalla de inicio).
// - Las llaves VAPID se crean solas la primera vez y viven en private/webpush (las reglas impiden leerlas desde la app).
// - Cada dispositivo suscrito queda en pushSubs/{sha256(endpoint)}: { uid, name, endpoint, p256dh, auth, ua, createdAt }.
// - El contenido va cifrado de punta a punta (RFC 8291, aes128gcm) y firmado con VAPID (RFC 8292).
const crypto = require("crypto");

const b64u = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
const SUBJECT = "https://housechat.web.app";

// Cifra el contenido para un dispositivo (aes128gcm, un solo registro)
function encrypt(payload, p256dh, authSecret, { salt = crypto.randomBytes(16), ecdh } = {}) {
  const uaPublic = unb64u(p256dh), auth = unb64u(authSecret);
  if (uaPublic.length !== 65 || auth.length !== 16) throw new Error("Suscripción inválida.");
  const as = ecdh || crypto.createECDH("prime256v1");
  if (!ecdh) as.generateKeys();
  const asPublic = as.getPublicKey();
  const shared = as.computeSecret(uaPublic);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "latin1")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "latin1")).subarray(0, 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// Firma VAPID (JWT ES256) para el servidor de notificaciones del navegador
function vapidHeader(endpoint, keys, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: SUBJECT }));
  const key = crypto.createPrivateKey({ key: keys.privateJwk, format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + claims), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${keys.publicKey}`;
}

module.exports = function notificaciones({ db, fetchFn = (...a) => fetch(...a) }) {
  let cached = null;
  async function keys() {
    if (cached) return cached;
    const ref = db.doc("private/webpush");
    cached = await db.runTransaction(async t => {
      const s = await t.get(ref);
      if (s.exists && s.get("publicKey")) return s.data();
      const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const jwk = privateKey.export({ format: "jwk" }), pub = publicKey.export({ format: "jwk" });
      const k = { privateJwk: jwk, publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])), createdAt: Date.now() };
      t.set(ref, k);
      return k;
    });
    return cached;
  }
  const subId = endpoint => crypto.createHash("sha256").update(String(endpoint)).digest("hex");

  async function subscribe(uid, user, sub, ua) {
    const endpoint = String((sub && sub.endpoint) || "");
    if (!/^https:\/\//.test(endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error("Suscripción inválida.");
    await db.doc("pushSubs/" + subId(endpoint)).set({ uid, name: user.name || "", endpoint, p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth),
      ua: String(ua || "").slice(0, 200), createdAt: Date.now() }, { merge: true });
    return subId(endpoint);
  }
  async function unsubscribe(endpoint) { if (endpoint) await db.doc("pushSubs/" + subId(endpoint)).delete(); }

  // Envía a un dispositivo; si el navegador dice que la suscripción ya no existe (404/410), se borra
  async function sendOne(doc, payload) {
    const s = doc.data ? doc.data() : doc;
    const k = await keys();
    const r = await fetchFn(s.endpoint, { method: "POST", headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
      TTL: "86400", Urgency: "high", Authorization: vapidHeader(s.endpoint, k) }, body: encrypt(JSON.stringify(payload), s.p256dh, s.auth) });
    if (r.status === 404 || r.status === 410) { await db.doc("pushSubs/" + subId(s.endpoint)).delete(); return "vencida"; }
    if (!r.ok) { const t = await (r.text ? r.text() : "").catch(() => ""); throw new Error(`push ${r.status} ${String(t).slice(0, 120)}`); }
    return "ok";
  }
  async function sendTo(uids, payload) {
    if (!uids.length) return { enviadas: 0 };
    const subs = (await db.collection("pushSubs").get()).docs.filter(d => uids.includes(d.get("uid")));
    const res = await Promise.all(subs.map(d => sendOne(d, payload).catch(e => { console.error("push", e.message); return "error"; })));
    return { enviadas: res.filter(x => x === "ok").length, vencidas: res.filter(x => x === "vencida").length, errores: res.filter(x => x === "error").length };
  }

  // Mensaje entrante → avisa al responsable del contacto y a las administradoras (o a todo el equipo si no tiene responsable)
  async function onInbound(cid, msg) {
    if (!msg || msg.dir !== "in" || msg.type === "reaction") return { enviadas: 0 };
    const [c, us] = await Promise.all([db.doc("contacts/" + cid).get(), db.collection("users").get()]);
    const contact = c.exists ? c.data() : {};
    const team = us.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.active !== false);
    const owner = contact.owner && team.find(u => u.name === contact.owner);
    const uids = (owner ? team.filter(u => u.uid === owner.uid || u.role === "admin") : team).map(u => u.uid);
    const name = contact.name || contact.company || contact.phone || "Cliente";
    const ch = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", telegram: "Telegram", web: "Chat web" }[msg.channel || contact.lastChannel || "whatsapp"] || "";
    const kind = msg.media && msg.media.kind;
    const text = String(msg.text || "").replace(/^\[(Imagen|Audio|Nota de voz|Video|Documento|Sticker)\]\s*/, "").trim();
    const body = kind === "audio" ? "🎤 Nota de voz" : kind === "image" ? "📷 Foto" + (text ? ": " + text : "") : kind === "video" ? "🎬 Video"
      : kind === "document" ? "📄 Documento" : kind === "sticker" ? "Sticker" : text || "Mensaje nuevo";
    return sendTo(uids, { title: name + (ch ? " · " + ch : ""), body: body.slice(0, 180), tag: "c_" + cid, url: "/#conv/" + cid, ts: msg.ts || Date.now() });
  }
  async function test(uid) { return sendTo([uid], { title: "House Chat", body: "¡Listo! Así te avisaremos cuando un cliente te escriba ✅", tag: "prueba", url: "/#hoy" }); }

  return { keys, subscribe, unsubscribe, onInbound, test, sendTo, subId };
};
module.exports.encrypt = encrypt;
module.exports.vapidHeader = vapidHeader;
module.exports.b64u = b64u;
module.exports.unb64u = unb64u;

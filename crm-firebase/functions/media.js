// Fotos, audios, videos, documentos y stickers que envían los clientes.
// Los canales solo mandan un identificador o un enlace temporal: aquí se descarga el archivo y se guarda
// en el bucket privado {proyecto}-media. Nadie lo puede abrir con un enlace: la app lo pide a /api/media
// con la sesión de una persona activa del equipo, y la asesora lo lee directamente desde el servidor.
// Cada mensaje entrante con archivo trae media: { kind, id | fileId | url, mime, filename }; al guardarlo queda mediaPath.
const crypto = require("crypto");

const MAX_BYTES = 25 * 1024 * 1024;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "audio/aac": "aac", "audio/amr": "amr", "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf" };
const PATH_RE = /^media\/[\w-]+\/[0-9a-f]{32}\.[a-z0-9]{1,5}$/;
const extOf = (mime, filename) => EXT[String(mime || "").split(";")[0].trim()] || (String(filename || "").match(/\.([a-z0-9]{1,5})$/i) || [])[1] || "bin";

module.exports = function media({ db, admin, fetchFn = (...a) => fetch(...a), bucketName, graph }) {
  async function download(url, headers = {}) {
    const r = await fetchFn(url, { headers });
    if (!r.ok) throw new Error("No se pudo descargar el archivo (" + r.status + ")");
    const len = Number(r.headers && r.headers.get && r.headers.get("content-length")) || 0;
    if (len > MAX_BYTES) throw new Error("El archivo pesa más de 25 MB.");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error("El archivo pesa más de 25 MB.");
    return { buf, mime: (r.headers && r.headers.get && r.headers.get("content-type")) || "" };
  }
  async function store(cid, buf, mime, filename) {
    const name = `media/${cid}/${crypto.randomBytes(16).toString("hex")}.${extOf(mime, filename)}`;
    await admin.storage().bucket(bucketName).file(name).save(buf, { resumable: false, contentType: mime || "application/octet-stream",
      metadata: { cacheControl: "public, max-age=31536000", ...(filename ? { contentDisposition: `inline; filename="${String(filename).replace(/["\\\r\n]/g, "")}"` } : {}) } });
    return name;
  }
  async function read(path) {
    if (!PATH_RE.test(String(path || ""))) throw new Error("Ruta de archivo inválida.");
    const f = admin.storage().bucket(bucketName).file(path);
    const [[buf], [meta]] = await Promise.all([f.download(), f.getMetadata()]);
    return { buf, mime: meta.contentType || "application/octet-stream" };
  }
  // GET /api/media?p=media/… con "Authorization: Bearer <token de Firebase>" de una persona activa del equipo
  async function serve(req, res) {
    if (req.method !== "GET") return res.sendStatus(405);
    const tok = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    let uid;
    try { uid = (await admin.auth().verifyIdToken(tok)).uid; } catch { return res.sendStatus(401); }
    const u = await db.doc("users/" + uid).get();
    if (!u.exists || u.get("active") === false) return res.sendStatus(403);
    const p = String(req.query.p || "");
    if (!PATH_RE.test(p)) return res.sendStatus(400);
    try {
      const f = await read(p);
      res.set("Content-Type", f.mime); res.set("Cache-Control", "private, max-age=86400");
      return res.status(200).send(f.buf);
    } catch (e) { return res.sendStatus(e && e.code === 404 ? 404 : 500); }
  }
  // WhatsApp: primero se pide el enlace del archivo con el token y luego se descarga con el mismo token
  async function fromWhatsApp(md, token) {
    const r = await fetchFn(`${graph}/${md.id}`, { headers: { Authorization: "Bearer " + token } });
    const info = await r.json().catch(() => ({}));
    if (!r.ok || !info.url) throw new Error((info.error && info.error.message) || "WhatsApp no entregó el archivo.");
    const f = await download(info.url, { Authorization: "Bearer " + token });
    return { ...f, mime: info.mime_type || md.mime || f.mime };
  }
  async function fromTelegram(md, token) {
    const r = await (await fetchFn(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(md.fileId)}`)).json().catch(() => ({}));
    if (!r.ok || !r.result || !r.result.file_path) throw new Error("Telegram no entregó el archivo.");
    const f = await download(`https://api.telegram.org/file/bot${token}/${r.result.file_path}`);
    return { ...f, mime: md.mime || f.mime };
  }

  // Disparado al crear un mensaje entrante con archivo
  async function saveIncoming({ cid, mid, msg, waToken, tgToken }) {
    const md = msg && msg.media;
    if (!md || msg.dir !== "in" || msg.mediaPath) return "sin-archivo";
    const mref = db.doc(`contacts/${cid}/messages/${mid}`);
    try {
      const ch = msg.channel || "whatsapp";
      const f = ch === "whatsapp" ? await fromWhatsApp(md, waToken) : ch === "telegram" ? await fromTelegram(md, tgToken)
        : md.url ? await download(md.url) : null;
      if (!f) return "sin-origen";
      const path = await store(cid, f.buf, f.mime, md.filename);
      await mref.set({ mediaPath: path, mediaMime: String(f.mime || "").split(";")[0], mediaAt: Date.now() }, { merge: true });
      return "guardado";
    } catch (e) {
      await mref.set({ mediaError: String(e.message || e).slice(0, 200) }, { merge: true });
      return "error";
    }
  }
  return { saveIncoming, store, read, serve, extOf, PATH_RE };
};
module.exports.extOf = extOf;

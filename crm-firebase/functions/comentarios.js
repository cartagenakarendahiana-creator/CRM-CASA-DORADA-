// Comentarios de Facebook e Instagram → respuesta pública + mensaje privado (DM) automático.
// Las reglas viven en settings/comentarios: { on, rules: [{ id, name, on, channels, keywords, posts, reply, dm }] }
//  - keywords: "precio, info" (vacío = cualquier comentario); posts: [ids] (vacío = todas las publicaciones)
//  - reply: respuestas públicas, una por línea (se elige una al azar para no repetir siempre lo mismo)
//  - dm: el mensaje privado; cuando la persona responde, la conversación entra a House Chat y Sofía sigue
// Cada comentario queda en la colección comentarios; comentLeads/{canal}_{persona} recuerda a quién ya se le escribió
// por cada publicación (un solo DM por persona y publicación) y sirve para ligar el chat que llega después.
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const clip = (s, n) => String(s || "").slice(0, n);

// Comentarios nuevos de un webhook de Meta: [{ channel, commentId, postId, text, fromId, fromName, parentId, ts }]
function parse(body) {
  const out = [];
  for (const entry of (body && body.entry) || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (body.object === "page" && ch.field === "feed" && v.item === "comment" && v.verb === "add")
        out.push({ channel: "messenger", commentId: v.comment_id, postId: v.post_id, text: v.message || "", fromId: v.from && v.from.id, fromName: (v.from && v.from.name) || "",
          parentId: v.parent_id && v.parent_id !== v.post_id ? v.parent_id : "", ts: (v.created_time || 0) * 1000 || Date.now() });
      else if (body.object === "instagram" && ch.field === "comments" && v.id)
        out.push({ channel: "instagram", commentId: v.id, postId: (v.media && v.media.id) || "", text: v.text || "", fromId: v.from && v.from.id, fromName: (v.from && v.from.username) || "",
          parentId: v.parent_id || "", ts: Date.now() });
    }
  }
  return out.filter(c => c.commentId && c.fromId);
}

// Primera regla activa que aplica al comentario
function match(rules, c) {
  const t = norm(c.text);
  return (rules || []).find(r => {
    if (!r || r.on === false || !(r.reply || r.dm)) return false;
    if (r.channels && r.channels.length && !r.channels.includes(c.channel)) return false;
    if (r.posts && r.posts.length && !r.posts.includes(String(c.postId))) return false;
    const kw = String(r.keywords || "").split(/[,;\n]/).map(norm).filter(Boolean);
    // Palabras cortas ("info", "que") deben ir completas; las largas basta con que aparezcan ("precio" en "precios")
    const hit = k => (k.length < 5 ? new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(t) : t.includes(k));
    return !kw.length || kw.some(hit);
  }) || null;
}

// {nombre} → primer nombre (en Instagram llega el usuario, que no es un nombre: se omite)
function fill(text, c) {
  const first = c.channel === "messenger" ? String(c.fromName || "").trim().split(/\s+/)[0] || "" : "";
  return String(text || "").replace(/\s*\{nombre\}/gi, first ? " " + first : "").replace(/^\s+/, "").replace(/ +([,!.?])/g, "$1").trim();
}
const pick = (lines, rnd = Math.random) => { const l = String(lines || "").split("\n").map(s => s.trim()).filter(Boolean); return l.length ? l[Math.floor(rnd() * l.length)] : ""; };

module.exports = function comentarios({ db, admin, GRAPH, privateCfg, fetchFn = (...a) => fetch(...a), rnd = Math.random }) {
  async function graph(path, token, body, form) {
    const r = await fetchFn(`${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
      body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error((j.error && (j.error.error_user_msg || j.error.message)) || "Meta respondió " + r.status);
    return j;
  }
  // Publicación comentada (texto, enlace y miniatura) para mostrarla en House Chat; se guarda en memoria un rato
  const posts = new Map();
  async function postInfo(c, token) {
    const k = c.channel + c.postId;
    if (posts.has(k)) return posts.get(k);
    let p = {};
    try {
      const j = c.channel === "instagram" ? await graph(`${c.postId}?fields=permalink,caption,thumbnail_url,media_url,media_type`, token)
        : await graph(`${c.postId}?fields=permalink_url,message,full_picture`, token);
      p = { url: clip(j.permalink || j.permalink_url, 500), caption: clip(j.caption || j.message, 200), thumb: clip(j.thumbnail_url || (j.media_type !== "VIDEO" && j.media_url) || j.full_picture, 600) };
    } catch { /* sin permiso para leer la publicación: no es grave */ }
    if (posts.size > 200) posts.clear();
    posts.set(k, p);
    return p;
  }

  async function handleOne(c, cfg, settings) {
    const own = new Set([cfg.pageId, cfg.igId].filter(Boolean).map(String));
    if (own.has(String(c.fromId)) || c.parentId) return null; // comentarios de la propia página y respuestas dentro de un hilo
    const logRef = db.doc(`comentarios/${c.channel}_${String(c.commentId).replace(/\//g, "_")}`);
    const base = { channel: c.channel, commentId: String(c.commentId), postId: String(c.postId || ""), text: clip(c.text, 1000), fromId: String(c.fromId), fromName: clip(c.fromName, 120), at: c.ts };
    try { await logRef.create({ ...base, status: "recibido" }); } catch { return null; } // Meta reintenta: ya se atendió
    const rule = settings.on === false ? null : match(settings.rules, c);
    const post = cfg.pageToken ? await postInfo(c, cfg.pageToken) : {};
    if (!rule || !cfg.pageToken) { await logRef.set({ status: !cfg.pageToken ? "sin conexión" : "sin regla", post }, { merge: true }); return { status: "sin regla" }; }
    const leadRef = db.doc(`comentLeads/${c.channel}_${c.fromId}`);
    const lead = (await leadRef.get()).data() || {};
    const already = !!(lead.posts && lead.posts[c.postId]);
    const res = { status: "respondido", rule: rule.id || "", ruleName: clip(rule.name, 80), post };
    const reply = fill(pick(rule.reply, rnd), c);
    if (reply) {
      try { await graph(`${c.commentId}/${c.channel === "instagram" ? "replies" : "comments"}`, cfg.pageToken, { message: reply }, true); res.reply = reply; }
      catch (e) { res.replyError = clip(e.message, 300); }
    }
    const dm = fill(rule.dm, c);
    if (dm && !already) {
      // Respuesta privada: Meta deja un solo mensaje por comentario, dentro de los 7 días siguientes
      try { await graph(`${cfg.pageId || "me"}/messages`, cfg.pageToken, { recipient: { comment_id: c.commentId }, message: { text: dm.slice(0, 1000) } }); res.dm = dm; }
      catch (e) { res.dmError = clip(e.message, 300); }
    } else if (dm) res.dmSkipped = "Ya se le había escrito por esta publicación";
    if (!res.reply && !res.dm) res.status = res.replyError || res.dmError ? "error" : "repetido";
    await logRef.set(res, { merge: true });
    if (res.dm || res.reply) await leadRef.set({ channel: c.channel, name: base.fromName, lastComment: base.text, lastPost: base.postId, at: Date.now(),
      ...(res.dm ? { dm: res.dm, dmAt: Date.now(), commentId: base.commentId, comment: base.text, post } : {}), posts: { [c.postId]: Date.now() } }, { merge: true });
    if (res.rule) await db.doc("settings/comentarios").set({ stats: { [res.rule]: { n: admin.firestore.FieldValue.increment(1), dm: admin.firestore.FieldValue.increment(res.dm ? 1 : 0) } } }, { merge: true }).catch(() => {});
    return res;
  }

  async function handle(body) {
    const list = parse(body);
    if (!list.length) return [];
    const [cfg, s] = await Promise.all([privateCfg().then(p => p.meta || {}), db.doc("settings/comentarios").get()]);
    const settings = s.exists ? s.data() : {};
    const out = [];
    for (const c of list) {
      try { out.push(await handleOne(c, cfg, settings)); } catch (e) { console.error("comentario", c.commentId, e); }
    }
    return out;
  }
  return { handle };
};
module.exports.parse = parse;
module.exports.match = match;
module.exports.fill = fill;

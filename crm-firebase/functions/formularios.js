// Formularios de captura: páginas públicas (o incrustadas en tu web) que crean contactos en el CRM.
// forms/{id}: { name, title, intro, fields: [{ key, label, type, required }], segment, pipeline, stage, owner ("rotar" | nombre | ""), tags, thanks, color, on, count }
const crypto = require("crypto");
const BASE = { name: "name", phone: "phone", email: "email", company: "company", city: "city" };

module.exports = function formularios({ db, admin, phoneId, nextAssignee }) {
  const pub = f => ({ title: f.title || f.name || "Contáctanos", intro: f.intro || "", color: f.color || "#0f7a4c", button: f.button || "Enviar",
    thanks: f.thanks || "¡Gracias! Te contactaremos muy pronto.", fields: (f.fields || []).map(x => ({ key: x.key, label: x.label, type: x.type || "text", required: !!x.required, options: x.options || [] })) });

  async function handle(req, res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    const id = String((req.method === "GET" ? req.query.id : (req.body || {}).id) || "");
    if (!/^[\w-]{4,40}$/.test(id)) return res.status(400).json({ error: "Formulario inválido." });
    const fref = db.doc("forms/" + id), fs = await fref.get();
    if (!fs.exists || fs.get("on") === false) return res.status(404).json({ error: "Este formulario no está disponible." });
    const f = fs.data();
    if (req.method === "GET") return res.json(pub(f));
    if (req.method !== "POST") return res.sendStatus(405);
    const b = req.body || {}, v = b.values || {};
    if (b.website) return res.json({ ok: true }); // trampa para robots (campo oculto)
    const data = {}, answers = [];
    for (const fld of f.fields || []) {
      const raw = String(v[fld.key] ?? "").trim().slice(0, 1000);
      if (fld.required && !raw) return res.status(400).json({ error: `Falta: ${fld.label}` });
      if (!raw) continue;
      if (BASE[fld.key]) data[BASE[fld.key]] = raw.slice(0, 200);
      else answers.push(`${fld.label}: ${raw}`);
    }
    if (data.phone) { const p = phoneId(data.phone); if (p.length < 7) return res.status(400).json({ error: "Revisa el número de celular." }); data.phone = "+" + p; }
    if (data.email) { data.email = data.email.toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return res.status(400).json({ error: "Revisa el correo." }); }
    if (!data.name && !data.phone && !data.email) return res.status(400).json({ error: "Escribe al menos tu nombre y cómo contactarte." });
    // Límite por formulario: 30 envíos por minuto
    const win = Math.floor(Date.now() / 60000);
    const ok = await db.runTransaction(async t => {
      const s = await t.get(fref), r = s.get("rate") || {};
      const n = r.w === win ? r.n + 1 : 1;
      if (n > 30) return false;
      t.update(fref, { rate: { w: win, n }, count: admin.firestore.FieldValue.increment(1), lastAt: Date.now() });
      return true;
    });
    if (!ok) return res.status(429).json({ error: "Demasiados envíos, intenta en un minuto." });
    const now = Date.now();
    let cid = data.phone ? "wa_" + phoneId(data.phone) : null;
    if (!cid && data.email) { const q = await db.collection("contacts").where("email", "==", data.email).limit(1).get(); if (q.docs.length) cid = q.docs[0].id; }
    const ref = cid ? db.doc("contacts/" + cid) : db.collection("contacts").doc();
    const ex = await ref.get();
    const patch = { ...data, formId: id, lastFormAt: now, updatedAt: now, updatedBy: "Formulario" };
    if (f.tags && f.tags.length) patch.tags = admin.firestore.FieldValue.arrayUnion(...f.tags);
    if (!ex.exists) {
      const owner = f.owner === "rotar" ? await nextAssignee() : f.owner || "";
      Object.assign(patch, { type: "Prospecto", segment: f.segment || "Formulario", pipeline: f.pipeline || "ventas", stage: f.stage || "Nuevo", stageAt: now,
        source: "Formulario: " + (f.name || id), createdAt: now, unread: 1, ...(owner ? { owner } : {}),
        nextDate: new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), nextAction: "Contactar: llenó el formulario " + (f.name || "") });
    } else {
      // Ya existía: no cambia su etapa, pero queda la tarea de atenderlo
      Object.assign(patch, { nextDate: new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), nextAction: "Volvió a llenar el formulario " + (f.name || "") });
      if (ex.get("name")) delete patch.name;
    }
    await ref.set(patch, { merge: true });
    await ref.collection("messages").add({ dir: "note", ts: now, by: "form", byName: "Formulario",
      text: `📝 Llenó el formulario «${f.name || id}»${b.page ? " desde " + String(b.page).slice(0, 200) : ""}.` + (answers.length ? "\n" + answers.join("\n") : "") });
    return res.json({ ok: true, thanks: pub(f).thanks, id: crypto.createHash("sha1").update(ref.id).digest("hex").slice(0, 8) });
  }
  return { handle };
};

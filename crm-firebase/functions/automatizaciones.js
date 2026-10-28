// Automatizaciones ("cuando pase X, haz Y") y campañas segmentadas.
// Reglas en automations/{id}: { name, on, trigger: {type, stage?, days?, keywords?, channel?}, actions: [{type, ...}], runs, lastRunAt }
//   Disparadores: nuevo_contacto · etapa · palabra · sin_respuesta
//   Acciones: asignar (owner o "rotar"), etapa, mensaje (texto o plantilla), seguimiento (días + qué hacer), etiqueta, temperatura
// Campañas en campaigns/{id}: { name, filter, text, template, status, counts } y campaigns/{id}/recipients/{contactId}
const DAY = 24 * 3600 * 1000;
const BY = "Automatización";
const SEG = require("./segmentos");
const OPT_OUT = /^(salir|stop|baja|darme de baja|no mas mensajes|no me escriban mas|no quiero (mas )?mensajes|cancelar suscripcion|unsubscribe)[.! ]*$/;
// Difusiones goteadas: un mensaje cada 45 a 90 segundos, máximo el 20% de la lista en la primera hora, solo de 8 a. m. a 8 p. m.,
// y se pausa sola si fallan 5 envíos seguidos. Cada contacto se valida al momento de su envío.
const hourBogota = ms => Number(new Date(ms).toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false })) % 24;

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const isoDay = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const firstName = s => String(s || "").trim().split(/\s+/)[0] || "";
function fill(text, c, empresa) {
  return String(text || "").replace(/\{(\w+)\}/g, (m, k) => ({ nombre: firstName(c.name) || c.company || "", empresa: empresa || "Casa Dorada",
    asesor: firstName(c.owner), producto: (c.chosenProduct && c.chosenProduct.name) || "", busca: c.looking || "" }[k] ?? m));
}
const chOf = c => c.lastChannel || (c.phone ? "whatsapp" : "web");

// ¿El contacto cumple el filtro de una campaña? (también lo usa la app para contar destinatarios)
function matches(c, f = {}) {
  if (c.archived || c.optOut) return false;
  if (f.segment && c.segment !== f.segment) return false;
  if (f.stage && (c.stage || "Nuevo") !== f.stage) return false;
  if (f.type && c.type !== f.type) return false;
  if (f.temperature && c.temperature !== f.temperature) return false;
  if (f.owner && c.owner !== f.owner) return false;
  if (f.channel && chOf(c) !== f.channel) return false;
  if (f.tag && !(c.tags || []).includes(f.tag)) return false;
  if (f.quietDays) { const last = Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0); if (Date.now() - last < f.quietDays * DAY) return false; }
  return true;
}

module.exports = function automatizaciones({ db, admin, send, waQrOn = async () => false }) {
  // send({ cref, contact, text, template, byName }) → envía por el canal del contacto (lo arma index.js)
  async function rules(type) {
    const s = await db.collection("automations").where("on", "==", true).get();
    return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.trigger && r.trigger.type === type);
  }
  async function nextAssignee() {
    const users = (await db.collection("users").get()).docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.active !== false && u.role !== "admin").sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const pool = users.length ? users : (await db.collection("users").get()).docs.map(d => d.data()).filter(u => u.active !== false);
    if (!pool.length) return "";
    const ref = db.doc("counters/assign");
    const n = await db.runTransaction(async t => { const s = await t.get(ref); const v = (s.exists ? s.get("n") || 0 : 0); t.set(ref, { n: v + 1 }); return v; });
    return pool[n % pool.length].name || "";
  }

  async function runActions(rule, cref, contact, empresa) {
    const patch = {}, done = [];
    for (const a of rule.actions || []) {
      try {
        if (a.type === "asignar") {
          const who = a.owner === "rotar" ? await nextAssignee() : a.owner;
          if (who && (!contact.owner || a.force)) { patch.owner = who; done.push("asignó a " + who); }
        } else if (a.type === "etapa" && a.stage && contact.stage !== a.stage) {
          Object.assign(patch, { stage: a.stage, stageAt: Date.now() }); if (a.stage === "Ganado") patch.type = "Cliente"; done.push("movió a " + a.stage);
        } else if (a.type === "seguimiento") {
          patch.nextDate = isoDay(Date.now() + (Number(a.days) || 0) * DAY); patch.nextAction = a.text || "Seguimiento"; done.push(`agendó seguimiento el ${patch.nextDate}`);
        } else if (a.type === "etiqueta" && a.tag) {
          patch.tags = admin.firestore.FieldValue.arrayUnion(a.tag); done.push("etiquetó " + a.tag);
        } else if (a.type === "temperatura" && a.value) {
          patch.temperature = a.value; done.push("temperatura " + a.value);
        } else if (a.type === "mensaje" && (a.text || a.template)) {
          await send({ cref, contact: { ...contact, ...patch }, text: fill(a.text, { ...contact, ...patch }, empresa), template: a.template, byName: BY });
          done.push("envió mensaje");
        }
      } catch (e) { done.push(`no pudo (${a.type}): ${e.message}`); }
    }
    if (Object.keys(patch).length) await cref.set({ ...patch, updatedAt: Date.now(), updatedBy: BY }, { merge: true });
    await cref.collection("messages").add({ dir: "note", text: `⚙️ ${rule.name || "Automatización"}: ${done.join("; ") || "sin cambios"}.`, ts: Date.now(), by: "auto", byName: BY });
    await db.doc("automations/" + rule.id).set({ runs: admin.firestore.FieldValue.increment(1), lastRunAt: Date.now() }, { merge: true });
    return done;
  }
  const empresaOf = async () => ((await db.doc("settings/asesora").get()).data() || {}).empresa || "Casa Dorada";

  // ---------- Disparadores ----------
  async function onNewContact(cid, contact) {
    if (contact.sourceSheet) return 0; // los importados del Excel no disparan reglas
    const rs = (await rules("nuevo_contacto")).filter(r => !r.trigger.channel || r.trigger.channel === chOf(contact));
    if (!rs.length) return 0;
    const cref = db.doc("contacts/" + cid), empresa = await empresaOf();
    for (const r of rs) { const fresh = (await cref.get()).data() || contact; await runActions(r, cref, fresh, empresa); }
    return rs.length;
  }
  async function onStageChange(cid, before, after) {
    if ((before.stage || "Nuevo") === (after.stage || "Nuevo") || after.updatedBy === BY) return 0;
    const rs = (await rules("etapa")).filter(r => r.trigger.stage === after.stage);
    const cref = db.doc("contacts/" + cid), empresa = await empresaOf();
    for (const r of rs) await runActions(r, cref, (await cref.get()).data(), empresa);
    return rs.length;
  }
  async function onInbound(cid, msg) {
    const t = norm(msg.text);
    // Permisos de contacto: "SALIR", "STOP", "no me escriban más" → no vuelve a recibir difusiones ni recordatorios
    if (OPT_OUT.test(t.trim())) {
      await db.doc("contacts/" + cid).set({ optOut: true, optOutAt: Date.now() }, { merge: true });
      await db.collection("contacts/" + cid + "/messages").add({ dir: "note", ts: Date.now() + 1, by: "auto", byName: BY, text: "🚫 El cliente pidió no recibir más mensajes: no le llegarán difusiones ni recordatorios automáticos." });
    }
    const rs = (await rules("palabra")).filter(r => (r.trigger.keywords || []).some(k => k && t.includes(norm(k))));
    if (!rs.length) return 0;
    const cref = db.doc("contacts/" + cid), empresa = await empresaOf();
    for (const r of rs) await runActions(r, cref, (await cref.get()).data(), empresa);
    return rs.length;
  }
  // Cada hora: clientes a los que escribimos y no han respondido en N días
  async function sweepNoReply(now = Date.now()) {
    const rs = await rules("sin_respuesta");
    if (!rs.length) return 0;
    const empresa = await empresaOf();
    let n = 0;
    for (const r of rs) {
      const days = Math.max(1, Number(r.trigger.days) || 3), cutoff = now - days * DAY;
      const snap = await db.collection("contacts").where("lastOutboundAt", "<=", cutoff).orderBy("lastOutboundAt", "desc").limit(300).get();
      for (const d of snap.docs) {
        const c = d.data();
        if ((c.lastInboundAt || 0) > (c.lastOutboundAt || 0) || ["Ganado", "Perdido"].includes(c.stage) || c.archived) continue;
        if ((c.autoDone || {})[r.id] === c.lastOutboundAt) continue; // ya se hizo para este último mensaje
        await db.doc("contacts/" + d.id).set({ autoDone: { [r.id]: c.lastOutboundAt } }, { merge: true });
        await runActions(r, db.doc("contacts/" + d.id), c, empresa); n++;
      }
    }
    return n;
  }

  // ---------- Campañas ----------
  // Prepara la difusión: arma la lista de destinatarios (pendientes) y la deja en curso; el goteo la envía de a uno
  async function runCampaign(id, by) {
    const cref = db.doc("campaigns/" + id), camp = (await cref.get()).data();
    if (!camp) throw new Error("La campaña no existe.");
    if (["enviando", "enviada", "pausada"].includes(camp.status)) throw new Error("Esta campaña ya se envió o está en curso.");
    let all = (await db.collection("contacts").get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => matches(c, camp.filter));
    if (camp.filter && camp.filter.segmentId) { // difusión a un segmento (manual o dinámico)
      const seg = (await db.doc("segments/" + camp.filter.segmentId).get()).data();
      if (!seg) throw new Error("El segmento de esta campaña ya no existe.");
      const stats = SEG.orderStats((await db.collection("orders").get()).docs.map(d => d.data()));
      all = all.filter(c => SEG.inSegment(c, seg, stats));
    }
    if (!all.length) throw new Error("Ningún contacto cumple el filtro de esta campaña.");
    for (const c of all) await cref.collection("recipients").doc(c.id).set({ status: "pendiente", name: c.name || "", channel: chOf(c), order: Math.random() });
    const counts = { total: all.length, sent: 0, failed: 0, skipped: 0 };
    await cref.set({ status: "enviando", startedAt: Date.now(), startedBy: by, counts, nextAt: 0, fails: 0 }, { merge: true });
    return counts;
  }
  async function pauseCampaign(id, pause, by) {
    const cref = db.doc("campaigns/" + id), camp = (await cref.get()).data();
    if (!camp) throw new Error("La campaña no existe.");
    if (pause && camp.status !== "enviando") throw new Error("La campaña no está en curso.");
    if (!pause && camp.status !== "pausada") throw new Error("La campaña no está pausada.");
    await cref.set(pause ? { status: "pausada", pausedReason: "Pausada por " + (by || "el equipo"), pausedAt: Date.now() } : { status: "enviando", pausedReason: "", fails: 0, nextAt: 0 }, { merge: true });
    return { ok: true };
  }
  // Un envío de una difusión
  async function sendOne(cref, camp, rdoc, empresa, waQr) {
    const rref = rdoc.ref, cid = rdoc.id, contactRef = db.doc("contacts/" + cid);
    const c = (await contactRef.get()).data();
    const skip = async reason => { await rref.set({ status: "omitido", reason, at: Date.now() }, { merge: true }); return "omitido"; };
    if (!c || c.archived) return skip("El contacto ya no existe");
    if (c.optOut) return skip("Pidió no recibir mensajes");
    const ch = chOf(c);
    const windowOpen = ["telegram", "web"].includes(ch) || (ch === "whatsapp" && waQr) || Date.now() - (c.lastInboundAt || 0) < DAY;
    const useTpl = ch === "whatsapp" && !windowOpen;
    if (useTpl && !(camp.template && camp.template.name)) return skip("Ventana cerrada y sin plantilla");
    if (useTpl && (c.lastCampaignAt || 0) > Date.now() - 3 * DAY) return skip("Recibió otra difusión hace menos de 3 días");
    if (!useTpl && !windowOpen) return skip("Ventana de 24 h cerrada");
    if (!useTpl && !camp.text) return skip("Sin texto para este canal");
    const text = fill(camp.text, c, empresa);
    const tpl = useTpl ? { ...camp.template, params: (camp.template.params || []).map(p => fill(p, c, empresa)) } : null;
    try {
      await send({ cref: contactRef, contact: c, text, template: tpl, byName: "Campaña · " + (camp.name || ""), campaign: cref.id });
      await contactRef.set({ lastCampaignAt: Date.now() }, { merge: true });
      await rref.set({ status: "enviado", at: Date.now() }, { merge: true });
      return "enviado";
    } catch (e) {
      await rref.set({ status: "falló", reason: String(e.message || e).slice(0, 200), at: Date.now() }, { merge: true });
      return "falló";
    }
  }
  // Cada minuto: el siguiente envío de cada difusión en curso (si ya le toca)
  async function dripTick(now = Date.now(), rnd = Math.random) {
    const h = hourBogota(now);
    if (h < 8 || h >= 20) return [];
    const runs = (await db.collection("campaigns").where("status", "==", "enviando").get()).docs;
    const out = [];
    for (const d of runs) {
      const camp = d.data(), cref = d.ref, counts = { total: 0, sent: 0, failed: 0, skipped: 0, ...(camp.counts || {}) };
      if ((camp.nextAt || 0) > now) continue;
      const done = counts.sent + counts.failed + counts.skipped;
      if (now - (camp.startedAt || now) < 3600e3 && counts.sent >= Math.max(1, Math.ceil(counts.total * 0.2))) continue; // máximo 20% en la primera hora
      const pend = (await cref.collection("recipients").where("status", "==", "pendiente").get()).docs.sort((a, b) => (a.get("order") || 0) - (b.get("order") || 0));
      if (!pend.length) { await cref.set({ status: "enviada", sentAt: now, counts }, { merge: true }); out.push([d.id, "terminada"]); continue; }
      // Los omitidos no gastan turno: se revisan seguido hasta encontrar a quién enviarle
      let r = "omitido", i = 0;
      const empresa = await empresaOf(), waQr = await waQrOn();
      while (r === "omitido" && i < pend.length && i < 25) { r = await sendOne(cref, camp, pend[i], empresa, waQr); counts[r === "enviado" ? "sent" : r === "falló" ? "failed" : "skipped"]++; i++; }
      const fails = r === "falló" ? (camp.fails || 0) + 1 : r === "enviado" ? 0 : camp.fails || 0;
      const patch = { counts, fails, nextAt: now + Math.round(45000 + rnd() * 45000) };
      if (fails >= 5) Object.assign(patch, { status: "pausada", pausedReason: "Se pausó sola: fallaron 5 envíos seguidos. Revisa la plantilla o la conexión de WhatsApp.", pausedAt: now });
      else if (done + i >= counts.total) Object.assign(patch, { status: "enviada", sentAt: now });
      await cref.set(patch, { merge: true });
      out.push([d.id, r]);
    }
    return out;
  }

  return { onNewContact, onStageChange, onInbound, sweepNoReply, runCampaign, pauseCampaign, dripTick, runActions, nextAssignee };
};
module.exports.matches = matches;
module.exports.fill = fill;

// Plantillas de WhatsApp creadas desde House Chat y enviadas a Meta para aprobación.
// Se escriben con los mismos campos de las plantillas del CRM ({nombre}, {producto}…): aquí se convierten en {{1}}, {{2}}…
// en el orden en que aparecen, y waParams guarda qué campo va en cada número para enviarlas después.
const FIELDS = { enlace: "https://casadorada.co/carrito", nombre: "María", producto: "Juego de sábanas", precio: "$189.900", cotizacion: "COT-0012", total: "$350.000", hotel: "Hotel Central", asesor: "Luisa", empresa: "Casa Dorada" };
const CATEGORIES = { MARKETING: "Marketing", UTILITY: "Utilidad" };
const STATUS = { APPROVED: "Aprobada", PENDING: "En revisión", IN_APPEAL: "En apelación", REJECTED: "Rechazada", PAUSED: "Pausada", DISABLED: "Desactivada", PENDING_DELETION: "Eliminándose" };

const slug = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
const bad = msg => { const e = new Error(msg); e.code = "invalid-argument"; throw e; };

// { name, category, header, body, footer, buttons: ["Sí, me interesa"], url: { text, url } } → { payload, waParams, text }
function build(d) {
  const name = slug(d.name);
  if (!name) bad("Ponle un nombre a la plantilla.");
  const category = String(d.category || "").toUpperCase();
  if (!CATEGORIES[category]) bad("Elige la categoría: Marketing o Utilidad.");
  const text = String(d.body || "").trim();
  if (!text) bad("Escribe el mensaje.");
  if (text.length > 1024) bad("El mensaje puede tener máximo 1.024 caracteres.");
  const waParams = [];
  const body = text.replace(/\{\s*([a-záéíóúñ]+)\s*\}/gi, (m, k) => {
    const key = slug(k);
    if (!FIELDS[key]) bad(`{${k}} no es un campo conocido. Usa: ${Object.keys(FIELDS).map(f => "{" + f + "}").join(", ")}.`);
    if (!waParams.includes(key)) waParams.push(key);
    return `{{${waParams.indexOf(key) + 1}}}`;
  });
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}[\s.!?¡¿]*$/.test(body)) bad("Meta no acepta mensajes que empiezan o terminan con un campo: agrega una palabra antes o después (por ejemplo «Hola {nombre},» o «… Gracias.»).");
  if (/\n{3,}/.test(body)) bad("Quita las líneas vacías seguidas: Meta acepta máximo una línea en blanco.");
  const header = String(d.header || "").trim(), footer = String(d.footer || "").trim();
  if (header.length > 60 || /\n|\{/.test(header)) bad("El encabezado debe ser una sola línea de máximo 60 caracteres, sin campos.");
  if (footer.length > 60 || /\{/.test(footer)) bad("El pie debe tener máximo 60 caracteres, sin campos.");
  const quick = (d.buttons || []).map(b => String(b || "").trim()).filter(Boolean);
  if (quick.length > 3) bad("Máximo 3 botones de respuesta rápida.");
  if (quick.some(b => b.length > 25)) bad("Cada botón puede tener máximo 25 caracteres.");
  const link = d.url && (d.url.url || d.url.text) ? { text: String(d.url.text || "").trim(), url: String(d.url.url || "").trim() } : null;
  if (link && (!link.text || link.text.length > 25 || !/^https:\/\/\S+$/.test(link.url))) bad("El botón con enlace necesita un texto corto (máximo 25 caracteres) y una dirección que empiece por https://.");
  const components = [];
  if (header) components.push({ type: "HEADER", format: "TEXT", text: header });
  components.push({ type: "BODY", text: body, ...(waParams.length ? { example: { body_text: [waParams.map(k => FIELDS[k])] } } : {}) });
  if (footer) components.push({ type: "FOOTER", text: footer });
  const buttons = [...quick.map(t => ({ type: "QUICK_REPLY", text: t })), ...(link ? [{ type: "URL", text: link.text, url: link.url }] : [])];
  if (buttons.length) components.push({ type: "BUTTONS", buttons });
  return { payload: { name, language: "es", category, components }, waParams, text, name };
}

// Plantilla de Meta → lo que muestra House Chat
function summary(t) {
  const comp = type => (t.components || []).find(c => c.type === type) || {};
  return { id: String(t.id || ""), name: t.name, language: t.language || "", status: t.status || "", category: t.category || "", reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : "",
    header: comp("HEADER").text || "", body: comp("BODY").text || "", footer: comp("FOOTER").text || "", buttons: (comp("BUTTONS").buttons || []).map(b => b.text).filter(Boolean),
    quality: (t.quality_score && t.quality_score.score) || "" };
}

module.exports = function plantillasWA({ db, GRAPH, token, waba, fetchFn = (...a) => fetch(...a) }) {
  async function call(path, opts = {}) {
    if (!waba) bad("Falta el identificador de la cuenta de WhatsApp Business (WA_WABA_ID).");
    const r = await fetchFn(`${GRAPH}/${path}`, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = j.error || {}; throw new Error(e.error_user_msg || e.error_user_title || e.message || "Meta respondió " + r.status); }
    return j;
  }
  // Trae las plantillas de Meta, las guarda en settings/waTemplates y actualiza el estado de las del CRM
  async function sync() {
    const list = [];
    let next = `${waba}/message_templates?fields=name,status,category,language,components,rejected_reason,quality_score&limit=100`;
    for (let i = 0; next && i < 5; i++) {
      const j = await call(next);
      (j.data || []).forEach(t => list.push(summary(t)));
      next = j.paging && j.paging.next ? j.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "") : null;
    }
    await db.doc("settings/waTemplates").set({ list, at: Date.now() });
    const crm = await db.collection("templates").get();
    const by = new Map(list.map(t => [t.name, t]));
    await Promise.all(crm.docs.filter(d => d.get("waName") && by.has(d.get("waName")) && d.get("waStatus") !== by.get(d.get("waName")).status)
      .map(d => d.ref.set({ waStatus: by.get(d.get("waName")).status, waReason: by.get(d.get("waName")).reason }, { merge: true })));
    return list;
  }
  async function create(d, me) {
    const t = build(d);
    const out = await call(`${waba}/message_templates`, { method: "POST", body: JSON.stringify(t.payload) });
    // También queda como plantilla del CRM, lista para Hoy, campañas y automatizaciones cuando Meta la apruebe
    const ref = await db.collection("templates").add({ name: String(d.title || d.name).slice(0, 80), key: String(d.key || "otra"), text: t.text, waName: t.name, waLang: "es", waParams: t.waParams,
      waStatus: out.status || "PENDING", waCategory: out.category || t.payload.category, createdAt: Date.now(), createdBy: me.name || "", updatedAt: Date.now(), updatedBy: me.name || "" });
    await sync().catch(() => {});
    return { id: ref.id, name: t.name, status: out.status || "PENDING", category: out.category || t.payload.category };
  }
  async function remove(name) {
    if (!/^[a-z0-9_]{1,512}$/.test(String(name || ""))) bad("Nombre de plantilla inválido.");
    await call(`${waba}/message_templates?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    return sync();
  }
  return { sync, create, remove };
};
Object.assign(module.exports, { build, summary, slug, FIELDS, STATUS, CATEGORIES });

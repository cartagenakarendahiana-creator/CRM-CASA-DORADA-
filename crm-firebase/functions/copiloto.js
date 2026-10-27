// Copiloto de ventas con IA (Claude) para el equipo humano:
//   analizar → lee la conversación y deja en contacts.ai: resumen, intención, sentimiento, probabilidad de compra,
//              etapa sugerida, siguiente paso, riesgo, objeciones, productos de interés y valor estimado
//   sugerir  → 3 respuestas listas para enviar (con precios y promociones reales del catálogo)
//   mejorar  → reescribe el borrador de la persona (elegante, más corto, más cálido o solo corregir)
// También se analiza solo, cada 10 minutos, cada conversación con mensajes nuevos o sin analizar (barrido()).
const Anthropic = require("@anthropic-ai/sdk");
const PROMOS = require("./promos");
const { stripFormat } = require("./ficha");

const MODEL = "claude-haiku-5-5";
const DAY = 24 * 3600 * 1000;
const TEMPS = ["🔥 Caliente", "🌤 Tibio", "❄️ Frío"];
const STAGES = ["Nuevo", "Contactado", "Catálogo enviado", "Cotización enviada", "Negociación", "Ganado", "Perdido"];
const INTENTS = ["Comprar", "Cotizar", "Informarse", "Reclamo o soporte", "Postventa", "Sin interés", "Otro"];
const TONES = { elegante: "elegante, cálido y profesional, bien organizado", corto: "mucho más corto y directo, sin perder lo importante",
  calido: "más cercano, amable y cálido", corregir: "igual, solo corrigiendo ortografía, puntuación y redacción" };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const obj = (properties, required) => ({ type: "object", properties, required: required || Object.keys(properties), additionalProperties: false });
const STOP = new Set("para como cuanto cuánto tienen tiene quiero queria quisiera precio precios hola buenas buenos dias tardes noches gracias favor necesito busco este esta estos estas donde cuando porque".split(" "));

// Conversación en texto (lo más reciente al final)
function transcript(msgs, aiName) {
  return msgs.filter(m => ["in", "out", "note"].includes(m.dir)).map(m => {
    const who = m.dir === "in" ? "Cliente" : m.dir === "note" ? "Nota interna" : m.ai ? aiName + " (IA)" : "Equipo" + (m.byName ? " (" + m.byName + ")" : "");
    const extra = m.transcript ? ` [nota de voz: "${m.transcript}"]` : m.media ? ` [${{ image: "foto", audio: "audio", video: "video" }[m.media.kind] || "archivo"}]` : m.image ? " [foto de producto]" : "";
    const when = new Date(m.ts || 0).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    return `[${when}] ${who}: ${stripFormat(m.text || "").trim()}${extra}`.slice(0, 1200);
  }).join("\n");
}
// Productos que tienen que ver con la conversación (por palabras del cliente), con su mejor precio vigente
function relevantProducts(products, msgs, contact, promos, max = 8) {
  const words = [...new Set(norm(msgs.filter(m => m.dir === "in").slice(-12).map(m => (m.text || "") + " " + (m.transcript || "")).join(" ") + " " + (contact.looking || ""))
    .split(/[^a-z0-9ñ]+/).filter(w => w.length > 3 && !STOP.has(w)))];
  const scored = products.filter(p => p.active !== false && p.available !== false).map(p => {
    const hay = norm([p.name, p.category, p.desc].join(" "));
    return { p, s: words.reduce((n, w) => n + (hay.includes(w) ? (norm(p.name).includes(w) ? 3 : 1) : 0), 0) + (contact.chosenProduct && contact.chosenProduct.id === p.id ? 10 : 0) };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max);
  return scored.map(({ p }) => {
    const b = PROMOS.bestPrice(p, 1, p.priceRetail || 0, promos);
    return `- ${p.name}${p.category ? " (" + p.category + ")" : ""}: ${money(b.price)}${b.promo ? ` con la promoción "${b.promo.name}"${b.promo.code ? " código " + b.promo.code : ""}, antes ${money(p.priceRetail)}` : p.compareAt > p.priceRetail ? `, antes ${money(p.compareAt)}` : ""}`
      + (p.priceWholesale && p.minWholesale ? `; por mayor ${money(p.priceWholesale)} desde ${p.minWholesale} u.` : "") + (p.desc ? ". " + String(p.desc).slice(0, 160) : "");
  }).join("\n");
}
function contactLine(c) {
  return [["Nombre", c.name], ["Empresa", c.company], ["Ciudad", c.city], ["Etapa", c.stage || "Nuevo"], ["Temperatura", c.temperature], ["Qué busca", c.looking],
    ["Producto elegido", c.chosenProduct && c.chosenProduct.name], ["Responsable", c.owner], ["Observaciones", c.obs && String(c.obs).slice(-600)]]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") || "Sin datos todavía.";
}

module.exports = function copiloto({ db, apiKey, client: injected }) {
  const client = () => injected || new Anthropic({ apiKey: apiKey() });
  // Una sola llamada que obliga a responder con la herramienta (sale JSON validado por el esquema)
  async function ask(system, user, tool, maxTokens = 1500) {
    const r = await client().messages.create({ model: MODEL, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: user }] });
    if (r.stop_reason === "refusal") throw new Error("La IA no pudo procesar esta conversación.");
    const u = r.content.find(b => b.type === "tool_use");
    if (!u) throw new Error("La IA no devolvió resultado.");
    return u.input;
  }
  async function context(cid, limit = 60) {
    const cref = db.doc("contacts/" + cid);
    const [c, ms, cfgS, pipeS, prodS, promoS] = await Promise.all([cref.get(), cref.collection("messages").orderBy("ts", "desc").limit(limit).get(),
      db.doc("settings/asesora").get(), db.doc("settings/pipelines").get(), db.collection("products").get(), db.collection("promos").get()]);
    if (!c.exists) throw new Error("El contacto no existe.");
    const contact = { id: cid, ...c.data() }, cfg = cfgS.exists ? cfgS.data() : {};
    const pipe = ((pipeS.exists && pipeS.get("list")) || []).find(p => p.id === (contact.pipeline || "ventas"));
    const promos = PROMOS.activePromos(promoS.docs.map(d => ({ id: d.id, ...d.data() })));
    const msgs = ms.docs.map(d => d.data()).reverse();
    return { cref, contact, cfg, msgs, promos, stages: (pipe && pipe.stages) || STAGES, aiName: cfg.name || "Sofía",
      products: prodS.docs.map(d => ({ id: d.id, ...d.data() })) };
  }
  const business = ctx => `Negocio: ${ctx.cfg.empresa || "Casa Dorada"} (textiles para el hogar y hoteles, Colombia). Moneda: pesos colombianos.
${ctx.cfg.instructions ? "Políticas del negocio:\n" + String(ctx.cfg.instructions).slice(0, 2500) : ""}`;

  async function analizar(cid) {
    const ctx = await context(cid);
    if (!ctx.msgs.some(m => m.dir === "in")) throw new Error("Todavía no hay mensajes del cliente para analizar.");
    const tool = { name: "registrar_analisis", description: "Guarda el análisis comercial de la conversación.", input_schema: obj({
      resumen: { type: "string", description: "2 o 3 frases: quién es, qué necesita y en qué va la conversación" },
      intencion: { type: "string", enum: INTENTS },
      sentimiento: { type: "string", enum: ["Positivo", "Neutral", "Negativo"] },
      probabilidad: { type: "integer", description: "Probabilidad de compra de 0 a 100, realista" },
      temperatura: { type: "string", enum: TEMPS },
      etapa_sugerida: { type: "string", enum: ctx.stages },
      siguiente_paso: { type: "string", description: "La mejor acción concreta para el equipo ahora mismo (una frase)" },
      riesgo: { type: "string", description: "Qué podría hacer perder la venta; vacío si no hay riesgo claro" },
      objeciones: { type: "array", items: { type: "string" }, description: "Objeciones o dudas del cliente (máx. 4)" },
      productos: { type: "array", items: { type: "string" }, description: "Productos que le interesan (máx. 5)" },
      valor_estimado: { type: "integer", description: "Valor estimado de la venta en pesos; 0 si no se sabe" },
      urgente: { type: "boolean", description: "true si el cliente espera respuesta o está listo para comprar ya" },
    }) };
    const a = await ask(`Eres analista comercial experto de un CRM de ventas por WhatsApp. Analiza la conversación con objetividad, sin inventar datos. Escribe en español, breve y concreto.
${business(ctx)}
Hoy es ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`,
      `Ficha del cliente:\n${contactLine(ctx.contact)}\n\nConversación:\n${transcript(ctx.msgs, ctx.aiName)}`, tool);
    const ai = {
      resumen: String(a.resumen || "").slice(0, 600), intencion: INTENTS.includes(a.intencion) ? a.intencion : "Otro",
      sentimiento: ["Positivo", "Neutral", "Negativo"].includes(a.sentimiento) ? a.sentimiento : "Neutral",
      probabilidad: Math.max(0, Math.min(100, Math.round(Number(a.probabilidad) || 0))), temperatura: TEMPS.includes(a.temperatura) ? a.temperatura : "",
      etapa: ctx.stages.includes(a.etapa_sugerida) ? a.etapa_sugerida : "", siguiente: String(a.siguiente_paso || "").slice(0, 300),
      riesgo: String(a.riesgo || "").slice(0, 300), objeciones: (a.objeciones || []).slice(0, 4).map(x => String(x).slice(0, 120)),
      productos: (a.productos || []).slice(0, 5).map(x => String(x).slice(0, 80)), valor: Math.max(0, Math.round(Number(a.valor_estimado) || 0)),
      urgente: !!a.urgente, at: Date.now(), hasta: Math.max(ctx.contact.lastInboundAt || 0, ctx.contact.lastOutboundAt || 0, ...ctx.msgs.map(m => m.ts || 0)), // así no se repite sin mensajes nuevos
    };
    await ctx.cref.set({ ai, ...(!ctx.contact.temperature && ai.temperatura ? { temperature: ai.temperatura } : {}) }, { merge: true });
    return ai;
  }

  async function sugerir(cid, draft) {
    const ctx = await context(cid, 40);
    const tool = { name: "proponer_respuestas", description: "Propone respuestas para enviar al cliente.", input_schema: obj({
      sugerencias: { type: "array", minItems: 1, maxItems: 3, items: obj({ enfoque: { type: "string", description: "2 a 4 palabras: ej. 'Responder y cotizar'" }, texto: { type: "string" } }) } }) };
    const prods = relevantProducts(ctx.products, ctx.msgs, ctx.contact, ctx.promos);
    const r = await ask(`Eres el copiloto de ventas de un asesor humano. Propón 3 respuestas distintas (por ejemplo: responder directo, avanzar al cierre, resolver la objeción) para el ÚLTIMO mensaje del cliente, listas para enviar por WhatsApp.
Estilo: español colombiano, cálido y profesional, como una tienda elegante. Párrafos cortos, *negrita* solo para lo clave (nombre del producto y precio), máximo unos 70 palabras, una sola pregunta al final que lleve a la venta. Sin firmas ni saludos repetidos si ya se saludaron.
Usa SOLO los precios, productos y promociones de la lista; si no hay dato, no inventes: ofrece averiguarlo. No prometas descuentos fuera de las promociones vigentes ni fechas de entrega.
${business(ctx)}

Productos relacionados con la conversación:
${prods || "(ninguno coincide; no des precios)"}

${PROMOS.promosText(ctx.promos)}`,
      `Ficha del cliente:\n${contactLine(ctx.contact)}\n\nConversación:\n${transcript(ctx.msgs, ctx.aiName)}${draft ? `\n\nEl asesor empezó a escribir esto (tenlo en cuenta): ${draft}` : ""}`, tool, 2000);
    return (r.sugerencias || []).slice(0, 3).map(s => ({ enfoque: String(s.enfoque || "").slice(0, 40), texto: String(s.texto || "").trim().slice(0, 1500) })).filter(s => s.texto);
  }

  async function mejorar(text, tone) {
    const t = String(text || "").trim();
    if (!t) throw new Error("Escribe primero el mensaje que quieres mejorar.");
    const r = await ask(`Reescribe el mensaje de un asesor de ventas para enviarlo por WhatsApp a un cliente. Hazlo ${TONES[tone] || TONES.elegante}.
Mantén exactamente los datos (precios, cantidades, nombres, fechas, códigos); no agregues información nueva. Español colombiano. Formato de WhatsApp: *negrita* solo para lo clave, párrafos cortos.`,
      t.slice(0, 3000), { name: "mensaje", description: "Devuelve el mensaje reescrito.", input_schema: obj({ texto: { type: "string" } }) }, 1200);
    return String(r.texto || "").trim();
  }

  // Analiza los chats de los últimos 30 días con mensajes nuevos desde su último análisis (o sin analizar),
  // cuando llevan 3 minutos quietos (para no analizar a mitad de la conversación). Máximo `max` por vuelta.
  async function barrido(max = 40) {
    const now = Date.now();
    const snap = await db.collection("contacts").where("lastInboundAt", ">", now - 30 * DAY).orderBy("lastInboundAt", "desc").limit(500).get();
    const due = snap.docs.filter(d => {
      const c = d.data(), last = Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0);
      return !c.archived && last > ((c.ai && c.ai.hasta) || 0) && now - last > 3 * 60 * 1000 && now - ((c.ai && c.ai.at) || 0) > 3 * 60 * 1000;
    }).slice(0, max);
    let ok = 0, fail = 0;
    for (const d of due) { try { await analizar(d.id); ok++; } catch (e) { fail++; console.error("análisis", d.id, e.message); } }
    return { revisados: due.length, ok, fail };
  }
  return { analizar, sugerir, mejorar, barrido };
};
module.exports.transcript = transcript;
module.exports.relevantProducts = relevantProducts;
module.exports.TONES = TONES;

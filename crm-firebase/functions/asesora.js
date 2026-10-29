// Asesora virtual: responde por WhatsApp con Claude (API de Anthropic).
// Resuelve sola productos, precios, descuentos, cotizaciones, dudas, negociaciones y quejas;
// solo pasa a una persona el cierre de la venta (pago, datos de envío, confirmar el pedido) o si el cliente pide una persona.
const Anthropic = require("@anthropic-ai/sdk");
const PROMOS = require("./promos");
const LISTAS = require("./listas");
const EMB = require("./embudos");
const STOCK = require("./stock");
const BUSQ = require("./busqueda");
const FICHA = require("./ficha");
const MEDIDAS = require("./medidas");

// Modelo de la asesora: Haiku 5.5 por defecto (rápido y económico); se puede cambiar en Asesora virtual
const MODELS = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
const DEFAULT_MODEL = "haiku";
const MAX_ROUNDS = 6;       // vueltas de herramientas por mensaje
const HISTORY = 40;         // mensajes de contexto
const DEBOUNCE_MS = 7000;   // espera por si el cliente manda varios mensajes seguidos
const DAY_MS = 24 * 3600 * 1000;
const CAPTION_MAX = 1000;   // pie de foto máximo (WhatsApp y Telegram permiten 1024)
const TEMPS = ["🔥 Caliente", "🌤 Tibio", "❄️ Frío"];
const STAGES = ["Nuevo", "Contactado", "Catálogo enviado", "Cotización enviada", "Negociación", "Ganado", "Perdido"];
const STAGE_UP = ["Contactado", "Catálogo enviado", "Cotización enviada", "Negociación"];

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const isoDay = d => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const nowText = () => new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "full", timeStyle: "short" });
const priceFor = (p, qty) => p.priceWholesale && p.minWholesale && qty >= p.minWholesale ? p.priceWholesale : p.priceRetail || 0;
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

const obj = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });
const HANDOFF_REASONS = ["Cerrar pedido", "Pide una persona"]; // lo único que pasa a una persona
const TOOLS = [
  { name: "buscar_productos", description: "Busca en el catálogo de Casa Dorada por nombre, categoría, medida o descripción. Devuelve precio al detal, precio por mayor y desde cuántas unidades aplica. Úsala SIEMPRE antes de dar un precio o decir si hay un producto; nunca inventes precios ni productos. Con consulta vacía lista todo el catálogo.",
    input_schema: obj({ consulta: { type: "string", description: "Palabras a buscar, ej. 'sábana 1.40' o 'toallas'" } }, ["consulta"]) },
  { name: "actualizar_ficha", description: "Guarda en la ficha del cliente los datos que te dio en la conversación. Envía solo los campos que conoces con certeza.",
    input_schema: obj({
      nombre: { type: "string", description: "Nombre de la persona" },
      empresa: { type: "string", description: "Empresa, hotel o negocio" },
      ciudad: { type: "string" },
      correo: { type: "string" },
      que_busca: { type: "string", description: "Resumen corto de lo que necesita, ej. '20 juegos de sábanas 1.40 para hotel'" },
      temperatura: { type: "string", enum: TEMPS, description: "Qué tan cerca está de comprar (calificación del lead)" },
      etapa: { type: "string", enum: STAGE_UP, description: "Avanza la oportunidad en el embudo cuando corresponda (solo hacia adelante)" },
      producto_elegido_id: { type: "string", description: "id del producto que eligió (de buscar_productos)" },
      nota: { type: "string", description: "Dato útil para el equipo que no cabe en los otros campos" },
    }, []) },
  { name: "crear_cotizacion", description: "Prepara una cotización en estado Borrador con productos del catálogo. Una persona del equipo la revisa antes de enviarla formalmente. Úsala cuando el cliente pida cotización o precio total por cantidades.",
    input_schema: obj({
      items: { type: "array", description: "Productos y cantidades", items: obj({ producto_id: { type: "string" }, cantidad: { type: "integer" } }, ["producto_id", "cantidad"]) },
      notas: { type: "string", description: "Condiciones o detalles que pidió el cliente" },
    }, ["items"]) },
  { name: "agendar_seguimiento", description: "Programa la próxima acción del equipo con este cliente (aparece en Hoy y en Agenda). Úsala cuando el cliente diga que decide después, que le escriban otro día, etc.",
    input_schema: obj({ fecha: { type: "string", description: "Fecha AAAA-MM-DD" }, accion: { type: "string", description: "Qué hay que hacer, ej. 'Preguntar si aprobó la cotización'" } }, ["fecha", "accion"]) },
  { name: "pasar_a_humano", description: "Pasa la conversación a una persona del equipo y deja de responder en este chat. Úsala SOLO para cerrar la venta: el cliente ya decidió comprar y hay que confirmar el pedido, tomar los datos de envío o el pago. También si el cliente pide expresamente hablar con una persona. Todo lo demás (precios, descuentos, negociación, quejas, dudas) lo resuelves tú.",
    input_schema: obj({ motivo: { type: "string", enum: HANDOFF_REASONS },
      resumen: { type: "string", description: "Resumen para la persona que toma el chat: qué quiere el cliente y qué falta" } }, ["motivo", "resumen"]) },
  { name: "enviar_foto_producto", description: "Envía al cliente la foto de un producto del catálogo, con su nombre y precio como pie de foto. Úsala cuando pida ver el producto o cuando una foto ayude a decidir, solo con productos que tengan tiene_foto=true. Máximo 3 fotos por respuesta. La foto llega después de tu mensaje de texto.",
    input_schema: obj({ producto_id: { type: "string", description: "id del producto (de buscar_productos)" } }, ["producto_id"]) },
  { name: "catalogo_por_medida", description: "Reúne TODOS los productos del catálogo para una medida de cama (sábanas, cobijas, edredones, fundas, protectores… agrupando los colores) más lo que sirve para cualquier medida. El sistema le envía al cliente un catálogo en PDF con fotos y precios. Úsala cuando el cliente quiera ver todo o todas las opciones para su cama (ej. 'quiero de todo para mi cama doble', '¿qué tienen para queen?').",
    input_schema: obj({ medida: { type: "string", description: "Medida que dijo el cliente: sencilla (1.00), semidoble (1.20), doble (1.40), queen (1.60) o king (2.00)" } }, ["medida"]) },
  { name: "registrar_comprobante", description: "Registra un comprobante de pago que el cliente envió (foto de transferencia, Nequi, Daviplata, consignación). El equipo lo verifica; tú NO confirmas que el pago entró.",
    input_schema: obj({ monto: { type: "integer", description: "Valor en pesos que se ve en el comprobante; 0 si no se lee" }, banco: { type: "string", description: "Banco o app (Bancolombia, Nequi…); vacío si no se ve" },
      referencia: { type: "string", description: "Número de referencia o aprobación; vacío si no se ve" }, detalle: { type: "string", description: "Fecha, destinatario u otro dato útil del comprobante" } }, ["monto", "banco", "referencia", "detalle"]) },
  { name: "buscar_conocimiento", description: "Busca en la base de conocimiento de la empresa (políticas, envíos, garantías, cuidados de productos, preguntas frecuentes). Úsala antes de responder algo que no esté en el catálogo.",
    input_schema: obj({ consulta: { type: "string", description: "Tema a buscar, ej. 'garantía' o 'envíos a Cali'" } }, ["consulta"]) },
].map(t => ({ ...t, strict: true }));
const KB_INLINE = 12000; // si la base de conocimiento es corta, va completa en las instrucciones

function kbText(kb = []) {
  if (!kb.length) return "";
  const full = kb.map(k => `## ${k.title}\n${String(k.content || "").trim()}`).join("\n\n");
  if (full.length <= KB_INLINE) return `\n\nBase de conocimiento de la empresa (úsala para responder; no inventes nada que no esté aquí o en el catálogo):\n${full}`;
  return `\n\nBase de conocimiento: hay ${kb.length} artículos (${kb.map(k => k.title).join("; ")}). Consúltalos con buscar_conocimiento antes de responder sobre esos temas.`;
}
// Medios de pago de Configuración › Medios de pago: [{ type, on, ...datos }]
const PAY_LABEL = { banco: "Transferencia bancaria", nequi: "Nequi", daviplata: "Daviplata", llave: "Llave Bre-B", addi: "ADDI (compra ahora, paga a cuotas)", sistecredito: "Sistecrédito (crédito a cuotas)", link: "Link de pago", contraentrega: "Contra entrega", efectivo: "Efectivo", tarjeta: "Tarjeta débito o crédito", otro: "Otro" };
function payMethodsText(list) {
  return (list || []).filter(m => m && m.on !== false && m.type).slice(0, 20).map(m => {
    const d = [m.name && m.type === "otro" ? m.name : "", m.bank, m.accountType, m.number && (m.type === "banco" ? "cuenta " : "") + m.number, m.holder && "a nombre de " + m.holder, m.doc && "NIT/CC " + m.doc,
      m.key && "llave " + m.key, m.url, m.detail].filter(Boolean).join(" · ");
    return `- ${m.type === "link" && m.name ? "Link de pago " + m.name : PAY_LABEL[m.type] || m.type}${d ? ": " + d : ""}`;
  }).join("\n");
}
// Pagos, entrega y sedes que la administradora llena en Configuración
function businessText(cfg) {
  const out = [];
  const pm = payMethodsText(cfg.payMethods);
  if (pm || cfg.payments) out.push("Medios de pago (cuando pregunten cómo pagar, da los datos exactos de aquí; nunca inventes cuentas ni números):\n" + [pm, cfg.payments ? "Condiciones: " + String(cfg.payments).trim().slice(0, 1500) : ""].filter(Boolean).join("\n"));
  if (cfg.delivery) out.push("Entrega y envíos:\n" + String(cfg.delivery).trim().slice(0, 2000));
  const sedes = (cfg.sedes || []).filter(x => x && x.name);
  if (sedes.length) out.push("Sedes y puntos de venta:\n" + sedes.slice(0, 12).map(x => `- ${x.name}${x.address ? ": " + x.address : ""}${x.city ? ", " + x.city : ""}${x.hours ? " · horario " + x.hours : ""}${x.phone ? " · tel " + x.phone : ""}${x.map ? " · mapa " + x.map : ""}`).join("\n"));
  return out.length ? "\n\n" + out.join("\n\n") : "";
}
function systemPrompt(cfg, kb) {
  const name = cfg.name || "Sofía";
  return `Eres ${name}, asesora virtual de ventas de ${cfg.empresa || "Casa Dorada"}. Atiendes chats de WhatsApp, Instagram, Messenger, Telegram y el chat de la página web. Escribes en español de Colombia, cálido, cercano y breve (mensajes cortos, como una persona por chat; máximo 1 o 2 emojis).
Estilo de tus mensajes (como una marca elegante y ordenada, nunca un bloque de texto):
- Párrafos de 1 o 2 líneas separados por una línea en blanco. Usa el formato de WhatsApp: *negrita* para nombres de productos y precios, _cursiva_ para detalles suaves. Si enumeras, una opción por línea con "• ". Máximo 1 emoji por párrafo.
- En el primer mensaje de la conversación saluda y preséntate en una línea ("¡Hola! Soy ${name}, de ${cfg.empresa || "Casa Dorada"} ✨").
- Productos con foto (tiene_foto=true): la foto se envía sola con una ficha ordenada (nombre, puntos clave, precio con descuento y precio por mayor). Tú escribe solo 1 o 2 frases cálidas que la presenten ("Te comparto la *Sábana Silver*, una de nuestras favoritas para el uso diario:"), SIN repetir precio, materiales ni medidas.
- Productos con descuento (en oferta o con promoción): en vez de la foto sola, el sistema envía una tarjeta de oferta con la foto del producto, el porcentaje, el precio antes y el de ahora, junto con su ficha. Tú solo menciona el descuento con entusiasmo en una frase, sin repetir las cifras.
- Productos sin foto: escribe tú la ficha con el mismo orden: *nombre*, 2 líneas cortas con "• " y el precio en negrita (con "Antes ~$X~" si hay descuento).
- Stock: solo existen para ti los productos de buscar_productos (todos tienen stock). Nunca ofrezcas, muestres ni cotices algo AGOTADO (lista agotados); si el cliente lo pide, dile con amabilidad que está agotado y ofrécele la alternativa disponible más parecida (mismo tipo, medida o color).
- Fotos de colores: si un producto tiene foto_compartida=true, esa foto es de referencia (los colores sin foto propia usan la misma imagen) y debajo de ella van escritos los colores disponibles. No envíes la misma foto varias veces ni digas que la foto muestra un color que no muestra: envía una sola foto y nombra los colores en tu texto. Si cada color tiene su propia foto, puedes enviar hasta 4.
- Color, medida o referencia: si el cliente pide uno que no está en el catálogo (por ejemplo una sábana verde y no hay verde), díselo claro y primero, y pregúntale si quiere ver los colores que sí hay. No envíes la foto de un producto de otro color como si fuera el que pidió; muestra una alternativa (con enviar_foto_producto) solo si te la pide o acepta, aclarando que es de otro color.
- Si el cliente quiere ver todo o todas las opciones para su cama (ej. "quiero de todo para mi cama doble", "qué tienen para queen"), usa catalogo_por_medida con la medida. Si no dijo la medida, pregúntale cuál: sencilla (1.00), semidoble (1.20), doble (1.40), queen (1.60) o king (2.00).
- Cierra con una sola pregunta corta para seguir la conversación (medida, cantidad, ciudad…). Máximo unas 70 palabras en total. Si te preguntan, dices con naturalidad que eres la asesora virtual y que hay un equipo de personas detrás.

Tu trabajo (modo mixto):
- Responde tú misma preguntas de productos, precios, medidas, materiales y disponibilidad, usando buscar_productos. Nunca inventes precios, productos, medidas, tiempos de entrega ni condiciones; si algo no está en el catálogo, en la base de conocimiento ni en las instrucciones del negocio, dile con naturalidad que lo confirmas con el equipo, guárdalo con actualizar_ficha (nota) y agenda la respuesta con agendar_seguimiento; sigue atendiéndolo tú.
- Explica el precio por mayor cuando aplique ("desde X unidades queda a $Y").
- Cuando hables de un producto, su foto con el precio se envía sola después de tu mensaje (no hace falta pedirla). Usa enviar_foto_producto solo si el cliente pide la foto de un producto que no nombraste. Nunca pegues enlaces de imágenes en el texto ni digas que no puedes enviar fotos.
- Haz una pregunta a la vez para entender qué necesita (para qué lo usa, medida, cantidad, ciudad) y guarda lo que aprendas con actualizar_ficha.
${cfg.quoteAuto !== false ? "- COTIZACIÓN: si el cliente dice cotización, cotizar, cotízame, presupuesto o proforma (o pide el precio formal o el total por cantidades), en esa MISMA respuesta usa crear_cotizacion con los productos de los que se ha hablado en la conversación (búscalos con buscar_productos si no tienes el id). Si no dijo cantidad usa 1 unidad; si mencionó medida o referencia, usa esa. No preguntes nada antes de enviarla: el sistema le envía la cotización formal en PDF en este chat, y después puedes ofrecerle ajustarla (cantidades, medidas, otros productos). Solo si en toda la conversación no se ha mencionado ningún producto, pregúntale en una línea qué producto quiere cotizar." : "- Si pide cotización o el total por cantidades, usa crear_cotizacion, dale el total aproximado y dile que una asesora del equipo se la confirma."}
- Si dice que decide después o pide que le escriban otro día, usa agendar_seguimiento.
- Promociones: ofrece con entusiasmo las promociones vigentes que apliquen a lo que busca el cliente (buscar_productos te dice el precio con promoción). Si un producto está en_oferta, cuéntale que antes costaba precio_antes_de_la_oferta y ahora precio_detal. Ofrécelas tal cual están: nunca inventes descuentos, no subas el porcentaje, no las combines y respeta mínimos, códigos y fechas.
- Si el cliente pregunta por descuentos, promociones u ofertas, cuéntale las promociones vigentes (con sus códigos y condiciones) y los productos en oferta de la lista que le sirvan; si quiere ver alguno, envía su foto con enviar_foto_producto.
- Resuelve tú misma todo lo que puedas, sin pasar a una persona:
  · Si negocia o pide descuento: ofrécele las promociones vigentes y el precio por mayor si aplica (con su mínimo de unidades). Si pide más, explícale con amabilidad que ese es el mejor precio disponible hoy y sigue ayudándole a elegir. Nunca inventes descuentos.
  · Si tiene una queja o reclamo: discúlpate con empatía, pide los detalles (qué pasó, número de pedido, una foto si sirve), guárdalos con actualizar_ficha (nota) y agenda la revisión con agendar_seguimiento; dile que el equipo ya lo tiene registrado.
  · Garantías, envíos, pagos y políticas: búscalas con buscar_conocimiento y respóndelas tú.
- Si el cliente envía la foto de un comprobante de pago, léelo y regístralo con registrar_comprobante; dile que el equipo lo verifica y le confirma. Nunca confirmes tú que el pago entró.
- Pasa a una persona (pasar_a_humano) SOLO para cerrar la venta: cuando el cliente ya decidió comprar y hay que confirmar el pedido, tomar los datos de envío o el pago. También si pide expresamente hablar con una persona. Antes de pasarlo, deja claro qué productos, medidas, colores y cantidades quiere (eso va en el resumen). Dile que una asesora le escribe en breve para finalizar la compra; no prometas tiempos exactos.
- Puedes ver las fotos que te manda el cliente: úsalas para entender qué producto busca y compáralo con el catálogo (sin inventar). Las notas de voz te llegan transcritas: respóndelas como si el cliente hubiera escrito (si la transcripción parece incompleta o confusa, pídele que confirme). Si recibes un audio sin transcripción, un video o un documento que no puedes ver, pídele amablemente que te lo escriba en texto.
${Number(cfg.maxDiscount) > 0 ? `- Descuentos: además de las promociones vigentes, si el cliente negocia y es lo que falta para cerrar, puedes ofrecer hasta un ${Number(cfg.maxDiscount)}% de descuento adicional, una sola vez y sin pasarte. No confirmes pedidos, pagos, envíos ni fechas de entrega.` : "- No des descuentos fuera de las promociones vigentes; no confirmes pedidos, pagos, envíos ni fechas de entrega."}

Tu respuesta final (el texto fuera de las herramientas) se envía tal cual al cliente por el mismo chat: escribe solo el mensaje, sin explicaciones internas. Si no hace falta responder nada (por ejemplo, el cliente solo dijo "ok" o "gracias" después de despedirse), responde exactamente: [SIN RESPUESTA]
Los mensajes del equipo humano en el historial también son de tu lado de la conversación; sé coherente con ellos.

${cfg.tone ? `Tono: ${String(cfg.tone).slice(0, 120)}.\n` : ""}
Instrucciones del negocio (horarios, envíos, pagos, políticas):
${(cfg.instructions || "No hay instrucciones adicionales.").trim()}${businessText(cfg)}${kbText(kb)}`;
}

function contactText(c) {
  const f = [["Nombre", c.name], ["Empresa", c.company], ["Ciudad", c.city], ["Correo", c.email], ["Segmento", c.segment], ["Tipo", c.type],
    ["Etapa", c.stage], ["Temperatura", c.temperature], ["Qué busca", c.looking], ["Producto elegido", c.chosenProduct && `${c.chosenProduct.name} ${money(c.chosenProduct.price)}`],
    ["Próximo seguimiento", c.nextDate && `${c.nextDate} ${c.nextAction || ""}`], ["Observaciones", c.obs],
    // De dónde llegó: anuncio, comentario en una publicación o mensaje automático de la página web
    ["Llegó por el anuncio", c.ad && (c.ad.headline || c.ad.body || "").slice(0, 160)], ["Comentó en una publicación", c.comment && `"${c.comment.text}"`],
    ["Llegó desde la página web", c.webFunnel && `${c.webFunnel.name || ""}${c.webPage ? " (" + c.webPage + ")" : ""}`]];
  const canal = { whatsapp: "WhatsApp", telegram: "Telegram", messenger: "Messenger", instagram: "Instagram", web: "el chat de la página web" }[c.lastChannel || "whatsapp"];
  return `Hoy es ${nowText()}. El cliente escribe por ${canal}${c.lastChannel && c.lastChannel !== "whatsapp" && !c.phone ? " (si quiere comprar, pídele su número de celular y guárdalo en la nota)" : ""}.\nFicha actual del cliente:\n` + f.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join("\n");
}

// Historial de WhatsApp → turnos user/assistant (las notas internas no se incluyen)
// Historial para Claude. Las fotos que mandó el cliente (las 3 más recientes, ya leídas en m.imageData) van como imágenes para que la asesora las vea.
const IMG_MIME = /^image\/(jpeg|png|gif|webp)$/;
const isImg = m => m.dir === "in" && m.mediaPath && IMG_MIME.test(m.mediaMime || "");
function toMessages(msgs) {
  const out = [], seen = new Set(msgs.filter(m => isImg(m) && m.imageData).slice(-3));
  for (const m of msgs) {
    if (m.dir !== "in" && m.dir !== "out") continue;
    const role = m.dir === "in" ? "user" : "assistant";
    const said = m.transcript ? `${String(m.text || "[Nota de voz]").trim()} — transcripción: "${m.transcript}"` : String(m.text || "").trim();
    const blocks = [{ type: "text", text: said || "[mensaje vacío]" }];
    if (seen.has(m)) blocks.push({ type: "image", source: { type: "base64", media_type: m.mediaMime, data: m.imageData } });
    const last = out[out.length - 1];
    if (last && last.role === role) {
      const prev = last.content[last.content.length - 1];
      if (prev.type === "text" && blocks[0].type === "text") { prev.text += "\n" + blocks[0].text; last.content.push(...blocks.slice(1)); }
      else last.content.push(...blocks);
    } else out.push({ role, content: blocks });
  }
  if (out.length && out[0].role === "assistant") out.unshift({ role: "user", content: [{ type: "text", text: "(Inicio de la conversación)" }] });
  return out;
}

// Pie de foto de un producto: nombre y precio (y por mayor, si aplica)
// Pie de cada foto: la ficha del producto (nombre, puntos clave, precio con descuento y por mayor)
const photoCaption = (p, promos = []) => FICHA.productCard(p, promos);
const nameTokens = s => norm(s).split(/[^a-z0-9.]+/).filter(w => w.length > 1);
// Fotos que se envían solas cuando la asesora habla de productos: primero los que nombra en su respuesta,
// si no nombra ninguno, los mejores resultados de su última búsqueda. Máximo 3, sin repetir fotos enviadas a este cliente en 24 h.
// Colores que se mencionan en un texto (para no mandar la foto de un color que el cliente no pidió)
const COLORS = { verde: /\bverde/, azul: /\bazul/, rojo: /\broj[oa]s?\b/, blanco: /\bblanc[oa]s?\b/, negro: /\bnegr[oa]s?\b/, gris: /\bgris/,
  beige: /\bbeige\b/, rosa: /\brosad?[oa]?s?\b/, morado: /\bmorad[oa]s?\b|\blila\b|\blavanda\b/, amarillo: /\bamarill[oa]s?\b|\bmostaza\b/,
  naranja: /\bnaranja/, cafe: /\bcafe\b|\bmarron|\bchocolate\b/, vino: /\bvinotinto\b|\bvino\b|\bburdeos\b/, crema: /\bcrema\b|\bmarfil\b|\bhueso\b|\barena\b/,
  indigo: /\bindigo\b/, celeste: /\bceleste\b|\bcielo\b/, turquesa: /\bturquesa\b|\baguamarina\b/, menta: /\bmenta\b/, coral: /\bcoral\b|\bsalmon\b/,
  dorado: /\bdorad[oa]s?\b/, plateado: /\bplatead[oa]s?\b/, terracota: /\bterracota\b/ };
const colorsIn = s => { const t = norm(s).replace(/casa dorada/g, ""); return Object.keys(COLORS).filter(k => COLORS[k].test(t)); };
// Lo que el cliente escribió desde la última respuesta (texto y notas de voz)
function lastAsk(history) {
  const out = [];
  for (let i = history.length - 1; i >= 0 && history[i].dir !== "out"; i--) if (history[i].dir === "in") out.unshift((history[i].text || "") + " " + (history[i].transcript || ""));
  return out.join(" ");
}
// La respuesta dice que algo no está disponible: no se pegan fotos automáticas (parecería que manda otro producto)
const NOT_AVAILABLE = /\bno (lo |la |los |las )?(tengo|tenemos|manejamos|hay|contamos|esta disponible|estan disponibles|viene|vienen|encontre|encuentro)\b|agotad|no disponible|sin existencias|no esta en el catalogo/;
const saysNotAvailable = text => NOT_AVAILABLE.test(norm(text));
function autoPhotos({ text, found, queued = [], sentAt = {}, now = Date.now(), max = 3, asked = "" }) {
  if (saysNotAvailable(text)) return [];
  const t = " " + nameTokens(text).join(" ") + " ";
  // Nunca la misma foto dos veces (las variantes de color sin foto propia comparten la del producto)
  const fresh = p => !queued.some(q => q.id === p.id || q.image === p.image) && now - (sentAt[p.id] || 0) > DAY_MS;
  // Si el cliente pidió un color, solo productos sin color en el nombre o de ese color
  const want = colorsIn(asked);
  const colorOk = p => { if (!want.length) return true; const has = colorsIn(p.name); return !has.length || has.some(c => want.includes(c)); };
  const withImg = found.filter(p => p.image && colorOk(p));
  const named = withImg.filter(p => { const tk = nameTokens(p.name); return tk.length && tk.filter(w => t.includes(" " + w + " ")).length / tk.length >= 0.7; });
  // Si nombra productos, solo esos (aunque ya se hayan enviado: no se cambia por otro parecido)
  const seen = new Set();
  return (named.length ? named : withImg).filter(fresh).filter(p => !seen.has(p.image) && seen.add(p.image)).slice(0, Math.max(0, max - queued.length));
}

function makeTools({ db, admin, cref, contact, products, aiName, kb = [], promos = [], quoteAuto = false, priceList = null, crossText = "", notify = null, pipesList = [] }) {
  // Solo lo que hay en stock (available=false: agotado en Shopify). Lo agotado solo sirve para decir que está agotado.
  const active = products.filter(p => p.active !== false && p.available !== false);
  const soldOut = products.filter(p => p.active !== false && p.available === false);
  // Fotos compartidas: en Shopify, los colores sin foto propia usan la foto principal del producto
  const imageUses = new Map();
  for (const p of active) if (p.image) imageUses.set(p.image, (imageUses.get(p.image) || 0) + 1);
  const sharedPhoto = p => !!p.image && imageUses.get(p.image) > 1;
  // Colores del mismo producto en la misma medida ("Doble (1.40)" → camel, gris, azul…)
  const siblingColors = p => {
    const { title } = FICHA.splitName(p.name), size = MEDIDAS.sizeOf(p.name), out = [];
    for (const x of active) {
      if (norm(FICHA.splitName(x.name).title) !== norm(title) || MEDIDAS.sizeOf(x.name) !== size) continue;
      const c = MEDIDAS.colorOf(FICHA.splitName(x.name).variant);
      if (c && !out.some(o => norm(o) === norm(c))) out.push(c);
    }
    return out;
  };
  const sizePart = p => FICHA.splitName(p.name).variant.split(" · ").filter(x => MEDIDAS.sizeOf(x)).join(" · ");
  // Pie de foto: si la foto es compartida, en vez de un color (que la foto quizá no muestra) van los colores disponibles
  const captionFor = p => {
    if (!sharedPhoto(p)) return photoCaption(p, promos);
    const cols = siblingColors(p);
    return FICHA.productCard(p, promos, { variant: [sizePart(p), cols.length > 1 ? "Colores: " + cols.join(", ") : cols[0] || ""].filter(Boolean).join(" · ") });
  };
  const cardText = p => {
    if (!sharedPhoto(p)) return FICHA.cardCaption(p);
    const cols = siblingColors(p);
    return FICHA.cardCaption(p, { colors: cols.length > 1 ? "Colores: " + cols.join(", ") : "" });
  };
  const pub = p => {
    const b = PROMOS.bestPrice(p, 1, p.priceRetail || 0, promos), other = PROMOS.promosFor(p, promos).filter(x => x !== b.promo);
    return { id: p.id, nombre: p.name, categoria: p.category || "", descripcion: p.desc || "", precio_detal: p.priceRetail || 0,
      precio_mayor: p.priceWholesale || null, mayor_desde_unidades: p.minWholesale || null, tiene_foto: !!p.image,
      ...(sharedPhoto(p) ? { foto_compartida: true, colores_disponibles: siblingColors(p) } : {}),
      ...(p.compareAt > p.priceRetail ? { en_oferta: true, precio_antes_de_la_oferta: p.compareAt } : {}),
      ...(b.promo ? { precio_con_promocion: b.price, promocion: `${b.promo.name}: ${PROMOS.conditionText(b.promo)}` } : {}),
      ...(other.length ? { otras_promociones: other.map(x => `${x.name}: ${PROMOS.conditionText(x)}`) } : {}) };
  };
  const done = []; // lo que hizo la asesora, para la nota interna
  const photos = []; // fotos de productos para enviar después del texto
  const docs = []; // cotizaciones en PDF para enviar después del texto
  const catalog = []; // catálogo por medida (lista ordenada + fotos) para enviar después del texto
  // Productos con precio tachado en la tienda (precio de comparación de Shopify), de mayor a menor descuento
  const onSale = active.filter(p => p.compareAt > p.priceRetail).sort((a, b) => (b.compareAt - b.priceRetail) / b.compareAt - (a.compareAt - a.priceRetail) / a.compareAt);
  const saleText = onSale.length ? "Productos en oferta en la tienda (precio tachado; ofrécelos cuando pregunten por descuentos u ofertas o vengan al caso):\n"
    + onSale.slice(0, 40).map(p => { const n = FICHA.splitName(p.name); return `- ${n.title}${n.variant ? " (" + n.variant + ")" : ""} [id ${p.id}]: ahora ${money(p.priceRetail)}, antes ${money(p.compareAt)} (${Math.round((1 - p.priceRetail / p.compareAt) * 100)}% menos)`; }).join("\n")
    + (onSale.length > 40 ? `\n…y ${onSale.length - 40} productos más en oferta (búscalos con buscar_productos).` : "") : "";
  const quoteTried = []; // si la IA intentó crear una cotización en este turno
  const found = []; // productos de la última búsqueda, en orden de relevancia (para adjuntar sus fotos)
  const run = {
    async buscar_conocimiento({ consulta }) {
      if (!kb.length) return { articulos: [], aviso: "La empresa no ha cargado base de conocimiento." };
      const words = norm(consulta).split(/\s+/).filter(w => w.length > 2);
      const scored = kb.map(k => { const hay = norm(k.title + " " + k.content); return [k, words.filter(w => hay.includes(w)).length + (norm(k.title).includes(norm(consulta)) ? 3 : 0)]; })
        .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return scored.length ? { articulos: scored.map(([k]) => ({ titulo: k.title, contenido: String(k.content).slice(0, 4000) })) } : { articulos: [], aviso: "No hay nada sobre eso en la base de conocimiento." };
    },
    async catalogo_por_medida({ medida }) {
      const c = MEDIDAS.catalog(active, medida, promos);
      if (!c) return { error: "No reconozco esa medida. Pregúntale al cliente cuál es: sencilla (1.00), semidoble (1.20), doble (1.40), queen (1.60) o king (2.00)." };
      if (!c.total) return { medida: c.label, total: 0, aviso: "No hay productos cargados para esa medida. Díselo con amabilidad y ofrécele otra medida o que una asesora le ayude." };
      catalog.splice(0, catalog.length, c);
      done.push(`envió el catálogo para cama ${c.label} (${c.total} productos)`);
      return { medida: c.label, total: c.total,
        categorias: Object.fromEntries(c.sections.map(sec => [sec.name, sec.items.map(g => ({ nombre: g.title, colores: g.colors.slice(0, 8), precio_desde: isFinite(g.min) ? g.min : null, ...(g.disc ? { descuento: g.disc.pct + "%" } : {}), id: g.ids[0] }))])),
        aviso: "El sistema le envía al cliente, justo después de tu mensaje, un catálogo en PDF con la foto, los colores y el precio de cada producto, ordenado por tipo. Escribe solo 1 línea cálida (ej. que le compartes el catálogo para su cama) y cierra con una pregunta corta (qué le gusta más o para cuántas camas). NO escribas la lista, los nombres ni los precios." };
    },
    async enviar_foto_producto({ producto_id }) {
      const p = active.find(x => x.id === producto_id);
      if (!p) return { error: soldOut.some(x => x.id === producto_id) ? "Ese producto está AGOTADO: no envíes su foto; dile al cliente que está agotado y ofrécele una alternativa disponible." : "Ese id no existe en el catálogo. Búscalo con buscar_productos." };
      if (!p.image) return { error: "Ese producto no tiene foto cargada. Descríbelo con palabras." };
      if (photos.some(f => f.id === p.id)) return { ok: true, aviso: "Esa foto ya está en la lista para enviar." };
      if (photos.some(f => f.image === p.image)) return { ok: true, aviso: "Ese color usa la MISMA foto que ya vas a enviar (no tiene foto propia en la tienda). No se repite: los colores disponibles van escritos debajo de esa foto." };
      if (photos.length >= 4) return { error: "Ya vas a enviar 4 fotos en esta respuesta; no envíes más." };
      photos.push({ id: p.id, image: p.image, caption: captionFor(p) });
      done.push("envió la foto de " + p.name);
      return { ok: true, aviso: "La foto se enviará justo después de tu mensaje. No pegues enlaces en el texto." };
    },
    async buscar_productos({ consulta }) {
      // Búsqueda con sinónimos y singular/plural (cuadros = escocesa = plaid; cobija = manta…), ver busqueda.js
      if (!BUSQ.terms(consulta).length) return { productos: active.slice(0, 60).map(pub), total: active.length };
      const scored = BUSQ.search(active, consulta, 12).map(p => [p]);
      found.splice(0, found.length, ...scored.map(([p]) => p));
      // Agotados que coinciden con la búsqueda: solo para avisarle al cliente (sin precio ni foto)
      const out = BUSQ.search(soldOut, consulta, 8).map(p => { const n = FICHA.splitName(p.name); return [FICHA.shortTitle(n.title), n.variant].filter(Boolean).join(" · "); });
      const agotados = out.length ? { agotados: [...new Set(out)], aviso_agotados: "Estos están AGOTADOS: no los ofrezcas, no envíes su foto ni los cotices. Si el cliente pregunta por uno, dile que está agotado y ofrécele una alternativa disponible de la lista de productos." } : {};
      return scored.length ? { productos: scored.map(([p]) => pub(p)), ...agotados } : { productos: [], ...agotados, aviso: "No hubo coincidencias con esas palabras. ANTES de decirle al cliente que no hay, busca de nuevo con una palabra más general (por ejemplo solo el tipo de producto: 'cobija', 'sábana', 'plumón') y muéstrale las opciones más parecidas; nunca digas que no hay sin haber buscado así." };
    },
    async actualizar_ficha(a) {
      const patch = {};
      const map = { nombre: "name", empresa: "company", ciudad: "city", correo: "email", que_busca: "looking", temperatura: "temperature" };
      for (const [k, f] of Object.entries(map)) if (a[k] && String(a[k]).trim()) patch[f] = String(a[k]).trim().slice(0, 300);
      if (patch.temperature && !TEMPS.includes(patch.temperature)) delete patch.temperature;
      if (a.etapa && (contact.pipeline || "ventas") === "ventas" && STAGE_UP.includes(a.etapa) && STAGES.indexOf(a.etapa) > STAGES.indexOf(contact.stage || "Nuevo")) Object.assign(patch, { stage: a.etapa, stageAt: Date.now() });
      if (a.producto_elegido_id) {
        const p = active.find(x => x.id === a.producto_elegido_id);
        if (!p) return { error: "Ese id no existe en el catálogo." };
        patch.chosenProduct = { id: p.id, name: p.name, price: p.priceRetail || 0, desc: p.desc || "" };
      }
      if (a.nota && String(a.nota).trim()) patch.obs = [contact.obs, `${isoDay(Date.now())} (${aiName}): ${String(a.nota).trim()}`].filter(Boolean).join("\n").slice(0, 3000);
      // Hoteles, hostales, glampings…: pasan a la Línea Hotelera (si existe ese embudo) y al segmento Hoteles
      if (EMB.isHotel(patch.company || "", patch.looking || "") && (contact.pipeline || "ventas") === "ventas" && contact.stage !== "Ganado") {
        const hp = EMB.findPipe(pipesList, "hoteles");
        if (hp) { Object.assign(patch, EMB.movePatch(contact, hp), { segment: "Hoteles" }); done.push("lo pasó a la " + hp.name); }
      }
      if (!Object.keys(patch).length) return { ok: true, guardado: [] };
      await cref.set({ ...patch, updatedAt: Date.now(), updatedBy: aiName }, { merge: true });
      Object.assign(contact, patch);
      done.push("actualizó la ficha (" + Object.keys(patch).join(", ") + ")");
      return { ok: true, guardado: Object.keys(patch) };
    },
    async crear_cotizacion({ items, notas }) {
      quoteTried.push(1);
      const lines = [];
      for (const it of items || []) {
        const p = active.find(x => x.id === it.producto_id), qty = Math.max(1, Math.round(Number(it.cantidad) || 0));
        if (!p) return { error: soldOut.some(x => x.id === it.producto_id) ? `El producto ${it.producto_id} está AGOTADO: no lo cotices; dile al cliente que está agotado y ofrécele una alternativa disponible.` : `El producto ${it.producto_id} no existe en el catálogo. Búscalo con buscar_productos.` };
        // Cliente con lista de precios (hotel, distribuidor…): manda la lista; si no, el mejor precio con las promociones
        const lp = LISTAS.listPrice(p, qty, priceList);
        if (lp !== null && lp < (p.priceRetail || Infinity)) { lines.push({ productId: p.id, name: p.name, qty, price: lp, listPrice: p.priceRetail || lp, priceListName: priceList.name }); continue; }
        const base = priceFor(p, qty), b = PROMOS.bestPrice(p, qty, base, promos);
        lines.push({ productId: p.id, name: p.name, qty, price: b.price, ...(b.promo ? { listPrice: base, promo: b.promo.name } : {}) });
      }
      if (!lines.length) return { error: "La cotización necesita al menos un producto." };
      const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0), now = Date.now();
      const qref = db.collection("quotes").doc();
      const number = await db.runTransaction(async t => {
        const cr = db.doc("counters/quotes"), s = await t.get(cr);
        const n = (s.exists ? s.get("n") || 0 : 0) + 1;
        const num = "COT-" + String(n).padStart(4, "0");
        t.set(cr, { n });
        const promoNote = [...new Set(lines.filter(l => l.promo).map(l => l.promo))].map(n => "Promoción aplicada: " + n).join("\n")
          + (lines.some(l => l.priceListName) ? (lines.some(l => l.promo) ? "\n" : "") + "Precios de la lista " + priceList.name : "");
        t.set(qref, { contactId: cref.id, contactName: contact.name || contact.company || contact.phone || "", items: lines, subtotal, discount: 0, total: subtotal,
          status: quoteAuto ? "Enviada" : "Borrador", ...(quoteAuto ? { sentAt: now, sentByName: aiName } : {}), validUntil: isoDay(now + ((priceList && Number(priceList.validDays)) || 15) * 864e5), ...(priceList ? { priceList: priceList.id } : {}), notes: [String(notas || ""), promoNote].filter(Boolean).join("\n").slice(0, 1000), number: num, aiCreated: true,
          createdAt: now, createdBy: "asesora", createdByName: aiName, updatedAt: now, updatedBy: aiName });
        return num;
      });
      const first = lines[0], p = active.find(x => x.id === first.productId);
      await cref.set({ chosenProduct: { id: first.productId, name: first.name, price: first.price, desc: p.desc || "" }, updatedAt: now, updatedBy: aiName }, { merge: true });
      if (quoteAuto) docs.push({ quoteId: qref.id, number, total: subtotal });
      done.push(quoteAuto ? `preparó la cotización ${number} por ${money(subtotal)} y la envía en PDF` : `preparó la cotización ${number} por ${money(subtotal)} (borrador para revisar)`);
      return { ok: true, numero: number, lineas: lines.map(l => ({ producto: l.name, cantidad: l.qty, precio_unitario: l.price, ...(l.promo ? { promocion: l.promo, precio_sin_promocion: l.listPrice } : {}), subtotal: l.qty * l.price })), total: subtotal,
        aviso: quoteAuto ? `La cotización formal ${number} en PDF se le envía en este mismo chat justo después de tu mensaje. Dile en 1 o 2 líneas que ahí va su cotización con el total (${money(subtotal)}) y pregúntale si desea confirmar el pedido. No repitas la lista de productos ni prometas tiempos de entrega.`
          : "Queda en borrador: dile al cliente el total aproximado y que una asesora del equipo se la confirma." };
    },
    async agendar_seguimiento({ fecha, accion }) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "") || fecha < isoDay(Date.now())) return { error: "La fecha debe ser AAAA-MM-DD y no puede estar en el pasado." };
      await cref.set({ nextDate: fecha, nextAction: String(accion || "").slice(0, 200), updatedAt: Date.now(), updatedBy: aiName }, { merge: true });
      done.push(`agendó seguimiento el ${fecha}: ${accion}`);
      return { ok: true };
    },
    async registrar_comprobante({ monto, banco, referencia, detalle }) {
      const at = Date.now(), proof = { at, monto: Math.max(0, Math.round(Number(monto) || 0)), banco: String(banco || "").slice(0, 60), referencia: String(referencia || "").slice(0, 60), detalle: String(detalle || "").slice(0, 300), status: "por revisar" };
      await cref.set({ paymentProof: proof, updatedAt: at, updatedBy: aiName }, { merge: true });
      done.push(`registró un comprobante de pago${proof.monto ? " por " + money(proof.monto) : ""}${proof.banco ? " (" + proof.banco + ")" : ""} para que el equipo lo verifique`);
      if (notify) await notify(proof).catch(e => console.error("aviso comprobante", e.message));
      return { ok: true, aviso: "Dile al cliente que recibiste el comprobante y que el equipo lo verifica y le confirma en breve. No digas que el pago ya entró." };
    },
    async pasar_a_humano({ motivo, resumen }) {
      if (!HANDOFF_REASONS.includes(motivo)) return { error: "Esto lo resuelves tú: solo se pasa a una persona para cerrar la venta (pago, envío, confirmar el pedido) o si el cliente pide una persona. Ayúdale con las promociones, la información del catálogo y la base de conocimiento, y si hace falta anota y agenda un seguimiento." };
      const at = Date.now();
      // aiClosedAt: la asesora llevó la conversación hasta el cierre de la venta (para el reporte de anuncios)
      await cref.set({ aiHandoff: { reason: String(motivo || "Otro"), summary: String(resumen || "").slice(0, 1000), at }, ...(motivo === "Cerrar pedido" ? { aiClosedAt: at } : {}), updatedAt: at, updatedBy: aiName }, { merge: true });
      done.push(`pasó el chat a una persona (${motivo}): ${resumen}`);
      return { ok: true, aviso: motivo === "Cerrar pedido" ? "Listo. Dile que una asesora del equipo le escribe en breve para finalizar su compra. Ya no responderás más en este chat."
        : "Listo. Dile que una asesora del equipo le escribe en breve. Ya no responderás más en este chat." };
    },
  };
  return { run, done, photos, docs, catalog, found, kb, promos, saleText, crossText, priceList, pipesList, badText: "", quoteAuto, quoteTried, captionFor, cardText };
}

// ¿El contacto es de la línea hotelera? (está en ese embudo, en el segmento Hoteles o su empresa es un hospedaje)
function hotelLine(c, pipesList) {
  const hp = EMB.findPipe(pipesList, "hoteles");
  return !!((hp && c.pipeline === hp.id) || c.segment === "Hoteles" || EMB.isHotel(c.company || "", c.looking || ""));
}
// Respuestas que el equipo calificó con 👎 (las más recientes), para que la asesora no repita esos errores
// Semana que empieza el lunes, en hora de Colombia: "2026-10-26"
function weekKey(ms) { const d = new Date(new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
const RATING_REASONS = { entendio: "No entendió", invento: "Inventó algo", venta: "No avanzó la venta", persona: "No suena a persona", otro: "Otro" };
function ratingsText(list) {
  const bad = (list || []).filter(r => r.v === -1 && r.text).slice(0, 12);
  if (!bad.length) return "";
  return "Errores que el equipo marcó en respuestas tuyas anteriores (aprende de ellos y no los repitas):\n" + bad.map(r => `- ${RATING_REASONS[r.reason] || "Mala respuesta"}: "${String(r.text).slice(0, 220).replace(/\s+/g, " ")}"${r.note ? ` → Lo correcto: ${String(r.note).slice(0, 220)}` : ""}`).join("\n");
}
// Valida a mano lo que la herramienta espera (además de strict:true)
function validInput(name, input) {
  if (!input || typeof input !== "object") return false;
  const req = { enviar_foto_producto: ["producto_id"], buscar_productos: ["consulta"], buscar_conocimiento: ["consulta"], crear_cotizacion: ["items"], agendar_seguimiento: ["fecha", "accion"], pasar_a_humano: ["motivo", "resumen"] }[name] || [];
  return req.every(k => input[k] !== undefined) && (name !== "crear_cotizacion" || Array.isArray(input.items));
}

// ¿El cliente pidió una cotización en sus mensajes desde la última respuesta? (texto o nota de voz transcrita)
const QUOTE_RE = /cotiz|presupuest|proforma/;
function quoteAsked(history) {
  const last = [];
  for (let i = history.length - 1; i >= 0 && history[i].dir !== "out"; i--) if (history[i].dir === "in") last.push(history[i]);
  return QUOTE_RE.test(norm(last.map(m => (m.text || "") + " " + (m.transcript || "")).join(" ")));
}
const QUOTE_NUDGE = "(Aviso del sistema, no lo menciones) El cliente pidió una cotización y todavía no la creaste. Créala ahora con crear_cotizacion usando los productos de los que se habló en la conversación (si no dijo cantidad, usa 1). Solo si nunca se ha mencionado ningún producto, pregúntale en una línea cuál quiere cotizar.";

// Corre a Claude con herramientas y devuelve el texto final para el cliente
async function think({ apiKey, cfg, contact, history, tools }) {
  const client = new Anthropic({ apiKey });
  const messages = toMessages(history);
  if (!messages.length || messages[messages.length - 1].role !== "user") return { text: "" };
  const system = [
    { type: "text", text: systemPrompt(cfg, tools.kb), cache_control: { type: "ephemeral" } },
    { type: "text", text: contactText(contact) + "\n\n" + PROMOS.promosText(tools.promos || []) + (tools.saleText ? "\n\n" + tools.saleText : "") + (tools.crossText ? "\n\n" + tools.crossText : "") + (tools.badText ? "\n\n" + tools.badText : "")
      + (hotelLine(contact, tools.pipesList || []) ? "\n\nEste cliente es de la LÍNEA HOTELERA (hotel, hostal u hospedaje): atiéndelo como cliente empresarial. Pregunta lo necesario para cotizar por volumen (nombre del hotel, ciudad, número de habitaciones o cantidades, medidas de cama, colores o si quiere bordado del logo) y prepárale una cotización formal. Usa trato profesional y cercano." : "")
      + (tools.priceList ? `\n\nEste cliente tiene la lista de precios «${tools.priceList.name}»: al cotizar, crear_cotizacion ya aplica sus precios.${tools.priceList.minOrder ? ` Pedido mínimo de la lista: ${money(tools.priceList.minOrder)}.` : ""}` : "") },
  ];
  const wantsQuote = tools.quoteAuto && quoteAsked(history);
  if (wantsQuote) system[1].text += "\n\nEl cliente acaba de pedir una cotización: créala en esta respuesta con crear_cotizacion.";
  let nudged = false;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const key = MODELS[cfg.model] ? cfg.model : DEFAULT_MODEL;
    const params = { model: MODELS[key], max_tokens: 8000, system, messages, tools: TOOLS, output_config: { effort: "medium" } };
    // Haiku 5.5 no tiene modelo de respaldo; en Sonnet y Opus, si declina por seguridad, la API reintenta con el respaldo recomendado
    const r = key === "haiku" ? await client.messages.create(params)
      : await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    if (r.stop_reason === "refusal") return { refusal: true };
    if (r.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: r.content }); continue; }
    const uses = r.content.filter(b => b.type === "tool_use");
    const text = r.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    if (r.stop_reason !== "tool_use" || !uses.length) {
      // Pidió cotización y la IA respondió sin crearla: se le insiste una vez (ese texto no se envía)
      if (wantsQuote && !nudged && !tools.quoteTried.length && !tools.done.some(d => /pasó el chat/.test(d)) && round < MAX_ROUNDS - 2) {
        nudged = true;
        messages.push({ role: "assistant", content: r.content.length ? r.content : [{ type: "text", text: text || "…" }] });
        messages.push({ role: "user", content: [{ type: "text", text: QUOTE_NUDGE }] });
        continue;
      }
      return { text };
    }
    messages.push({ role: "assistant", content: r.content });
    const results = [];
    for (const u of uses) {
      let out;
      try {
        out = !tools.run[u.name] ? { error: "Herramienta desconocida" } : !validInput(u.name, u.input) ? { error: "Datos incompletos, revisa los campos obligatorios." } : await tools.run[u.name](u.input);
      } catch (e) { console.error("herramienta", u.name, e); out = { error: "No se pudo completar: " + (e.message || e) }; }
      results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out), ...(out && out.error ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "" };
}

// Decide si responde, arma el contexto, llama a Claude y envía la respuesta
async function handleInbound({ db, admin, cid, mid, apiKey, send, loadMedia, quoteLink, discountCard, catalogLink, notify, wait = ms => new Promise(r => setTimeout(r, ms)), debounce = DEBOUNCE_MS }) {
  const cref = db.doc("contacts/" + cid);
  const cfgSnap = await db.doc("settings/asesora").get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  if (!cfg.enabled || !apiKey) return "apagada";
  // Números de prueba: mientras haya alguno, la asesora solo responde a esos (para probarla antes de soltarla con clientes)
  const tests = (cfg.testNumbers || []).map(n => String(n).replace(/\D/g, "").slice(-10)).filter(Boolean);
  if (tests.length) { const ph = String(((await cref.get()).data() || {}).phone || "").replace(/\D/g, "").slice(-10); if (!tests.includes(ph)) return "solo-numeros-de-prueba"; }
  const msnap = await cref.collection("messages").doc(mid).get();
  if (!msnap.exists || msnap.get("dir") !== "in") return "no-entrante";
  if (msnap.get("type") === "reaction") return "reaccion"; // un 👍 no necesita respuesta
  const ts = msnap.get("ts") || 0;
  if (debounce) await wait(debounce);
  // Si el cliente mandó una foto, espera (hasta ~10 s) a que guardarMedia la deje lista para verla
  // Fotos: espera (~10 s) a que guardarMedia la deje lista. Audios: espera (~30 s) la transcripción.
  const mk = msnap.get("media") && msnap.get("media").kind;
  for (let i = 0; i < (mk === "audio" ? 15 : mk === "image" ? 5 : 0); i++) {
    const cur = await cref.collection("messages").doc(mid).get();
    if (cur.get("mediaError") || (mk === "image" ? cur.get("mediaPath") : cur.get("transcript") || cur.get("transcriptError"))) break;
    await wait(2000);
  }

  // Reclama el turno: solo responde al último mensaje y una sola vez (los disparadores pueden repetirse)
  const claim = await db.runTransaction(async t => {
    const s = await t.get(cref);
    if (!s.exists) return "sin-contacto";
    const c = s.data(), now = Date.now();
    if ((c.lastInboundAt || 0) > ts) return "hay-mensaje-mas-nuevo";
    if ((c.aiHandledTs || 0) >= ts) return "ya-respondido";
    if (c.aiOff) return "pausada-en-chat";
    if (c.aiHandoff) return "esperando-persona";
    if ((c.aiPausedUntil || 0) > now) return "persona-escribiendo";
    t.set(cref, { aiHandledTs: ts }, { merge: true });
    return "ok";
  });
  if (claim !== "ok") return claim;

  const contact = (await cref.get()).data();
  const [hs, ps, ks, prs, pls, xs, rts, pps] = await Promise.all([
    cref.collection("messages").orderBy("ts", "desc").limit(HISTORY).get(),
    db.collection("products").get(),
    db.collection("knowledge").get(),
    db.collection("promos").get(),
    db.collection("priceLists").get().catch(() => ({ docs: [] })),
    db.doc("settings/ventaCruzada").get().catch(() => null),
    db.collection("ratings").orderBy("at", "desc").limit(60).get().catch(() => ({ docs: [] })),
    db.doc("settings/pipelines").get().catch(() => null),
  ]);
  const pipesList = (pps && pps.exists && (pps.data() || {}).list) || [];
  // Lo que el equipo marcó con 👎: la asesora lo lee para no repetir esos errores
  const badText = ratingsText(rts.docs.map(d => d.data()));
  // Promociones que aplican a este cliente: sin las internas, las "bajo demanda" solo si escribió el código, las de clientes solo si ya compró
  const said = hs.docs.map(d => d.data()).filter(m => m.dir === "in").slice(0, 15).map(m => m.text || "");
  const promos = PROMOS.forContact(PROMOS.activePromos(prs.docs.map(d => ({ id: d.id, ...d.data() }))), contact, said);
  const priceList = LISTAS.listFor(contact, pls.docs.map(d => ({ id: d.id, ...d.data() })));
  const crossText = LISTAS.crossText(xs && xs.exists ? (xs.data() || {}).pairs : []);
  const kb = ks.docs.map(d => d.data()).filter(k => k.on !== false && k.title).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const history = hs.docs.map(d => d.data()).reverse();
  // Lee del bucket privado las 3 fotos más recientes del cliente (Claude acepta hasta ~5 MB por imagen)
  if (loadMedia) for (const m of history.filter(isImg).slice(-3)) {
    try { const f = await loadMedia(m.mediaPath); if (f.buf.length <= 4.5 * 1024 * 1024) m.imageData = f.buf.toString("base64"); }
    catch (e) { console.error("foto del cliente", e.message); }
  }
  const products = STOCK.applyStock(ps.docs.map(d => ({ id: d.id, ...d.data() })), cfg); // todo lo activo, disponible (salvo que se apague)
  const aiName = (cfg.name || "Sofía") + " · IA";
  const tools = makeTools({ db, admin, cref, contact, products, aiName, kb, promos, priceList, crossText, notify: notify && (proof => notify(cid, contact, proof)), pipesList, quoteAuto: cfg.quoteAuto !== false && !!quoteLink });

  tools.badText = badText;
  let res;
  try { res = await think({ apiKey, cfg, contact, history, tools }); }
  catch (e) {
    console.error("asesora", e);
    await cref.set({ aiError: { at: Date.now(), message: String(e.message || e).slice(0, 300) } }, { merge: true });
    return "error";
  }
  if (res.refusal) {
    await cref.set({ aiHandoff: { reason: "Otro", summary: "La asesora virtual no pudo responder este mensaje.", at: Date.now() } }, { merge: true });
    tools.done.push("no pudo responder y pasó el chat a una persona");
  }
  const text = (res.text || "").trim(), hasText = text && text !== "[SIN RESPUESTA]";
  const cat = tools.catalog[0];
  if (hasText || tools.photos.length || tools.docs.length || cat) {
    // Si una persona respondió mientras la IA pensaba, no enviar
    const fresh = (await cref.get()).data();
    if ((fresh.aiPausedUntil || 0) > Date.now() || fresh.aiOff || (fresh.lastInboundAt || 0) > ts) return "cancelado";
    // Cada vez que habla de productos, la foto con el precio va sola (además de las que pidió con enviar_foto_producto)
    const auto = hasText && !cat && !tools.docs.length && !tools.done.some(d => /pasó el chat/.test(d)) ? autoPhotos({ text, found: tools.found, queued: tools.photos, sentAt: fresh.aiPhotos || {}, asked: lastAsk(history) }) : [];
    // Catálogo por medida: la respuesta y luego el catálogo en PDF con fotos y precios.
    // Si el PDF no se puede generar, en su lugar va una foto por producto con su ficha corta (nunca una lista larga).
    let catDoc = null;
    if (cat && catalogLink) { try { catDoc = await catalogLink(cat.key); } catch (e) { console.error("catálogo pdf", e.message); } }
    const photos = [...tools.photos, ...(cat ? (catDoc ? [] : cat.photos.filter(f => !tools.photos.some(q => q.id === f.id))) : auto.map(p => ({ id: p.id, image: p.image, caption: tools.captionFor(p) })))];
    const outText = cat && !hasText ? `Te comparto todo lo que tenemos para cama ${cat.label} 🛏️` : text;
    const sentNow = {};
    // Un solo mensaje: la primera foto lleva la respuesta + su ficha como pie (WhatsApp y Telegram aceptan hasta 1024 caracteres);
    // las demás fotos van con su ficha
    const lead = hasText && photos.length ? text + "\n\n" + photos[0].caption : "";
    const joined = !cat && hasText && photos.length && lead.length <= CAPTION_MAX && !saysNotAvailable(text);
    if ((hasText || cat) && !joined) await send({ cref, contact: fresh, text: outText, byName: aiName });
    if (catDoc) {
      try { await send({ cref, contact: fresh, text: `*Catálogo · Cama ${cat.label}*\n${catDoc.total} productos con fotos y precios`, document: { url: catDoc.url, filename: catDoc.filename }, byName: aiName }); }
      catch (e) { console.error("catálogo", e); tools.done.push("no pudo enviar el catálogo en PDF: " + (e.message || e)); }
    }
    // Tarjeta de oferta: REEMPLAZA la foto de todo producto con descuento (la tarjeta trae la foto adentro), así que no suma
    // mensajes: va siempre que se muestre ese producto (no en el catálogo por medida, que ya es un PDF).
    const cardFor = f => {
      if (!discountCard || cat) return null;
      const p = products.find(x => x.id === f.id), d = p && FICHA.discountOf(p, promos);
      return d ? { p, d } : null;
    };
    for (const [i, f] of photos.entries()) {
      // Producto con descuento: UNA sola imagen (la tarjeta de oferta con la foto del producto) y la ficha como texto.
      // Si la foto no se pudo poner en la tarjeta, va la foto normal del producto (nunca la tarjeta sin foto).
      let c = cardFor(f), image = f.image;
      if (c) {
        const r = await discountCard(c.p, c.d).catch(e => ({ reason: e.message }));
        if (r.url) image = r.url; else { tools.done.push(`envió la foto normal de ${c.p.name}: no pudo armar la tarjeta de oferta (${r.reason})`); c = null; }
      }
      // Con tarjeta, el texto no repite lo que ya dice la imagen (medida, color, precios): nombre y puntos clave
      const caption = c ? tools.cardText(c.p) : f.caption;
      try {
        await send({ cref, contact: fresh, text: joined && i === 0 ? text + "\n\n" + caption : caption, image, byName: aiName }); sentNow[f.id] = Date.now();
        if (c) tools.done.push(`envió la tarjeta de oferta de ${c.p.name} (-${c.d.pct}%)`);
      } catch (e) {
        console.error("foto", f.id, e); tools.done.push("no pudo enviar la foto: " + (e.message || e));
        if (joined && i === 0) await send({ cref, contact: fresh, text, byName: aiName }); // la respuesta no se pierde si la foto falla
      }
    }
    if (auto.length) tools.done.push("envió la foto de " + auto.map(p => p.name).join(", "));
    // Cotizaciones en PDF (con marca de agua), después de la respuesta
    for (const d of tools.docs) {
      try {
        const link = await quoteLink(d.quoteId);
        await send({ cref, contact: fresh, text: `*Cotización ${d.number}*\nTotal: *${money(d.total)}*`, document: { url: link.url, filename: link.filename }, byName: aiName });
      } catch (e) {
        console.error("cotización pdf", d.quoteId, e); tools.done.push(`no pudo enviar el PDF de ${d.number} (${e.message || e}); quedó en borrador`);
        await db.doc("quotes/" + d.quoteId).set({ status: "Borrador" }, { merge: true });
      }
    }
    if (Object.keys(sentNow).length) await cref.set({ aiPhotos: sentNow }, { merge: true });
    if ((fresh.stage || "Nuevo") === "Nuevo") await cref.set({ stage: "Contactado", stageAt: Date.now() }, { merge: true });
  }
  if (tools.done.length) await cref.collection("messages").add({ dir: "note", text: `${aiName}: ` + tools.done.join("; ") + ".", ts: Date.now(), by: "asesora", byName: aiName });
  if (hasText) { // respuestas de la semana (para Calificaciones)
    const wk = weekKey(Date.now());
    await db.doc("aiStats/" + wk).set({ week: wk, replies: admin.firestore.FieldValue.increment(1) }, { merge: true }).catch(() => {});
  }
  return hasText || tools.photos.length || tools.docs.length || cat ? "respondido" : "sin-texto";
}

module.exports = { payMethodsText, weekKey, ratingsText, handleInbound, toMessages, TOOLS, systemPrompt, MODELS, autoPhotos, photoCaption, quoteAsked, colorsIn, saysNotAvailable };

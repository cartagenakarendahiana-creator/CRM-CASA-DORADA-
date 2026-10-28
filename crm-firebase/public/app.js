import { fb } from "./fb.js";
import { WHATSAPP_ENABLED, EMPRESA, firebaseConfig, REGION } from "./firebase-config.js";

// ======================= Utilidades =======================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const money = n => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const num = v => { if (v === "" || v == null) return 0; const s = String(v).replace(/[$\s.]/g, "").replace(",", "."); return Number(s) || 0; };
const isoRe = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtDate = iso => isoRe.test(iso || "") ? new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : (iso || "");
const fmtTime = ms => new Date(ms).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }).replace(/\s*a\.\s*m\./i, " a.m.").replace(/\s*p\.\s*m\./i, " p.m.");
const fmtDMY = ms => { const d = new Date(ms); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
// Números de cotización y valores en letra de ancho fijo
const monoNums = html => html.replace(/(COT-\d+|PED-\d+|\$[\d.]+)/g, '<span class="mono">$1</span>');
const fmtDT = ms => ms ? new Date(ms).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const firstName = n => String(n || "").trim().split(/\s+/)[0] || "";
const H = 36e5, DAY = 864e5;
function ago(ms) {
  const d = Date.now() - ms;
  if (d < H) return Math.max(1, Math.round(d / 6e4)) + " min";
  if (d < DAY) return Math.round(d / H) + " h";
  return Math.round(d / DAY) + " d";
}
function whenLabel(ms) {
  const d = new Date(ms), t = new Date(), tm = new Date(Date.now() + DAY);
  const same = (a, b) => a.toDateString() === b.toDateString();
  return (same(d, t) ? "hoy " : same(d, tm) ? "mañana " : d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" }) + " ") + fmtTime(ms);
}
export function phoneId(v) {
  let d = String(v || "").split(/[\/,;]| y /)[0].replace(/\D/g, "");
  if (d.length === 10 && d[0] === "3") d = "57" + d;
  return d.length >= 8 ? d : "";
}
const waLink = (phone, text) => phoneId(phone) ? `https://wa.me/${phoneId(phone)}${text ? "?text=" + encodeURIComponent(text) : ""}` : "";

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 3000); }
function ask(msg, yes = "Aceptar", no = "Cancelar") {
  return new Promise(res => {
    const d = $("#ask"); $("#askMsg").textContent = msg; $("#askYes").textContent = yes; $("#askNo").textContent = no || ""; $("#askNo").hidden = !no;
    const done = v => { d.close(); res(v); };
    $("#askYes").onclick = () => done(true); $("#askNo").onclick = () => done(false); d.oncancel = e => { e.preventDefault(); done(false); };
    d.showModal();
  });
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Mensaje copiado"); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast("Mensaje copiado"); }
}
const errMsg = e => (e && (e.message || e.code)) || String(e);

const ICONS = {
  campana: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  hoy: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  conv: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  embudo: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
  contactos: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  cotizaciones: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  pedidos: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  productos: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  plantillas: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 8l9 6 9-6"/>',
  equipo: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 14.5c3 0 6 1.5 6 4.5"/>',
  importar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  reposicion: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  metricas: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  anuncios: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  captacion: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  carritos: '<path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  cartera: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.3"/>',
  oportunidades: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  calificaciones: '<path d="M7 11v9H4v-9zM7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.5 20H7"/>',
  lineabase: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  segmentos: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4"/><path d="M16 4.6a3 3 0 0 1 0 6.2M21 20c-.4-2.6-1.8-4.3-3.8-5"/>',
  listas: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  ventacruzada: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  exportar: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  automatizaciones: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  campanas: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13"/>',
  formularios: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  integraciones: '<path d="M9 7H6a4 4 0 0 0 0 8h3M15 7h3a4 4 0 0 1 0 8h-3M8 11h8"/>',
  canales: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11l7.4-3.8M8.3 13l7.4 3.8"/>',
  asesora: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  sonido: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  mudo: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  promociones: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
  foto: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
const icon = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ""}</svg>`;

// ======================= Modelo =======================
const STAGES = ["Nuevo", "Contactado", "Catálogo enviado", "Cotización enviada", "Negociación", "Ganado", "Perdido"];
// Embudos: "ventas" es el de siempre; la administradora puede crear más, cada uno con sus etapas (siempre terminan en Ganado y Perdido)
const DEFAULT_PIPE = { id: "ventas", name: "Ventas", stages: STAGES };
// Submenú del Embudo: un acceso por cada embudo (Ventas, Línea Hotelera, Distribuidores…)
function subPipes() {
  const cur = (S.embF || {}).pipe || "ventas";
  return `<div class="subnav">${pipes().map(p => `<button data-pipego="${esc(p.id)}" class="${p.id === cur ? "on" : ""}">${esc(p.name)}<span class="count soft">${S.contacts.filter(c => !c.archived && (c.pipeline || "ventas") === p.id).length}</span></button>`).join("")}</div>`;
}
// Embudos que trae House Chat (se crean una vez si no existen; la administradora puede renombrarlos o borrarlos)
const BASE_PIPES = [
  { id: "hoteles", name: "Línea Hotelera", stages: ["Nuevo", "Contactado", "Muestra o visita", "Cotización enviada", "Negociación", "Ganado", "Perdido"] },
  { id: "distribuidores", name: "Distribuidores", stages: ["Nuevo", "Contactado", "Catálogo enviado", "Cotización enviada", "Negociación", "Ganado", "Perdido"] },
  { id: "sitio_web", name: "Sitio web", stages: ["Nuevo", "Contactado", "Catálogo enviado", "Cotización enviada", "Ganado", "Perdido"] },
  { id: "registro_web", name: "Registro en sitio web", stages: ["Nuevo", "Contactado", "Primera compra", "Ganado", "Perdido"] }];
async function seedPipes(d) {
  if (!isAdmin() || S.pipesSeeding || (d && d.seeded)) return;
  S.pipesSeeding = true;
  const cur = (d && d.list && d.list.length ? d.list : [DEFAULT_PIPE]).slice();
  const has = re => cur.some(p => re.test(norm(p.name)));
  const add = BASE_PIPES.filter(b => !has({ hoteles: /hotel/, distribuidores: /distribu|mayorist/, sitio_web: /(sitio|pagina) web(?!.*registro)/, registro_web: /registro/ }[b.id]) && !cur.some(p => p.id === b.id));
  try { await fb.set("settings/pipelines", { list: [...(cur.some(p => p.id === "ventas") ? [] : [DEFAULT_PIPE]), ...cur, ...add].map(({ id, name, stages }) => ({ id, name, stages })), seeded: true }); }
  catch (e) { console.warn("embudos", e); }
}
const pipes = () => { const l = (S.pipes && S.pipes.length ? S.pipes : [DEFAULT_PIPE]); return l.some(p => p.id === "ventas") ? l : [DEFAULT_PIPE, ...l]; };
const pipeOf = c => pipes().find(p => p.id === ((c && c.pipeline) || "ventas")) || pipes()[0];
const stagesOf = c => pipeOf(c).stages;
const allStages = () => [...new Set(pipes().flatMap(p => p.stages))];
const ST_COLORS = ["#8cb8ff", "#5fcde4", "#f5c84c", "#ff9f5a", "#b48cff", "#f78fb3", "#7bd389", "#a0aec0"];
const stColor = (st, i) => st === "Ganado" ? "#3dbb73" : st === "Perdido" ? "#ff6b6b" : ST_COLORS[i % ST_COLORS.length];
const SEGMENTS = ["Hoteles", "Servicio", "Distribución", "Dotación", "WhatsApp", "Otro"];
const TEMPS = ["🔥 Caliente", "🌤 Tibio", "❄️ Frío"];
const Q_STATUS = ["Borrador", "Enviada", "Aceptada", "Rechazada", "Convertida"];
const O_STATUS = ["Nuevo", "En preparación", "Enviado", "Entregado", "Cancelado"];
const PAY_STATUS = ["Pendiente", "Abono", "Pagado"];
const SITUATIONS = {
  responder: "Respóndele",
  cerrar: "Ciérrale con lo que ya eligió",
  pedido: "Convierte la cotización en pedido",
  cotizacion: "Pregúntale por la cotización",
  seguimiento: "Seguimiento programado",
  reponer: "Ofrécele reponer",
};
const DEFAULT_TEMPLATES = [
  { key: "responder", name: "Responder mensaje", text: "Hola {nombre}, gracias por escribirnos a {empresa}. ¿En qué te podemos ayudar?" },
  { key: "cerrar", name: "Cerrar con el producto elegido", text: "Hola {nombre}, ¿te hago el pedido de {producto}?" },
  { key: "pedido", name: "Confirmar pedido", text: "Hola {nombre}, recibimos tu aprobación de la cotización {cotizacion} por {total}. ¿Te confirmo el pedido y la dirección de entrega?" },
  { key: "cotizacion", name: "Seguimiento a cotización", text: "Hola {nombre}, ¿pudiste revisar la cotización {cotizacion} por {total}? Cuéntame si te falta algo para decidir." },
  { key: "reponer", name: "Recordar reposición", text: "Hola {nombre}, ¿cómo te ha ido con {ultimo}? Ya van {dias} días desde tu última compra. ¿Te preparo el pedido de reposición?" },
  { key: "seguimiento", name: "Seguimiento general", text: "Hola {nombre}, te escribe {asesor} de {empresa}. ¿Cómo vas? Quedo atenta a lo que necesites." },
];

const S = {
  user: null, me: null, contacts: [], quotes: [], orders: [], products: [], templates: [], team: [], automations: [], campaigns: [], knowledge: [], forms: [],
  loaded: {}, view: "hoy", sel: null, convSel: null, convFilter: "todas", search: "", msgsUnsub: null, msgs: [], msgsFor: null,
  hoyMsgsUnsub: null, hoyMsgs: [], hoyMsgsFor: null, unsubs: [],
};
const byId = (list, id) => list.find(x => x.id === id);
// Canales: WhatsApp, Instagram, Messenger, Telegram y chat web
const CHN = {
  whatsapp: { label: "WhatsApp", color: "#25d366", window: true, svg: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill="currentColor"/><path d="M9 8.5c.2-.4.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.6l-.5.6c.6 1.1 1.5 2 2.6 2.6l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.3.1.4.3.4.5v.5c0 .3-.1.6-.5.8-.6.3-1.4.4-2.2.1a8.6 8.6 0 0 1-4.6-4.6c-.3-.8-.2-1.6.1-2.2z" fill="#fff"/>' },
  instagram: { label: "Instagram", color: "#e1306c", window: true, svg: '<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/><circle cx="12" cy="12" r="4" fill="none" stroke="#fff" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="#fff"/>' },
  messenger: { label: "Messenger", color: "#0084ff", window: true, svg: '<path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.8.2 1.7.3 2.7.3 5 0 9-3.7 9-8.3S17 3 12 3z" fill="currentColor"/><path d="M6.8 13.6l3-4.6 2.3 2 3.1-2-3 4.6-2.3-2z" fill="#fff"/>' },
  telegram: { label: "Telegram", color: "#29a9eb", window: false, svg: '<circle cx="12" cy="12" r="9.5" fill="currentColor"/><path d="M6.5 11.7l9.6-3.8c.5-.2.9.1.7.8l-1.6 7.6c-.1.5-.5.7-1 .4l-2.5-1.9-1.2 1.2c-.1.1-.3.2-.5.2l.2-2.6 4.6-4.2c.2-.2 0-.3-.3-.1l-5.7 3.6-2.4-.8c-.6-.2-.6-.6.1-.9z" fill="#fff"/>' },
  web: { label: "Chat web", color: "#64748b", window: false, svg: '<circle cx="12" cy="12" r="9.5" fill="currentColor"/><path d="M2.5 12h19M12 2.5c2.6 2.6 3.8 6 3.8 9.5S14.6 18.9 12 21.5M12 2.5C9.4 5.1 8.2 8.5 8.2 12s1.2 6.9 3.8 9.5" stroke="#fff" stroke-width="1.4" fill="none"/>' },
};
const chOf = c => (c && c.lastChannel) || (c && c.phone ? "whatsapp" : "web");
const chIcon = (ch, cls = "") => `<svg class="chi ${cls}" viewBox="0 0 24 24" style="color:${CHN[ch] ? CHN[ch].color : "#999"}" aria-label="${CHN[ch] ? CHN[ch].label : ch}"><title>${CHN[ch] ? CHN[ch].label : ch}</title>${CHN[ch] ? CHN[ch].svg : ""}</svg>`;
// WhatsApp: API oficial (WHATSAPP_ENABLED) o el puente por código QR (carpeta whatsapp-qr)
const waQr = () => !WHATSAPP_ENABLED && !!(S.ch && S.ch.waqr && S.ch.waqr.on);
const waOn = () => WHATSAPP_ENABLED || waQr();
// ¿Se le puede escribir a este contacto desde el CRM por su canal?
const canSend = c => { const ch = chOf(c); return ch === "whatsapp" ? waOn() : !!(S.ch && S.ch[ch] && S.ch[ch].on); };
const anyChannel = () => waOn() || ["telegram", "messenger", "instagram", "web"].some(k => S.ch && S.ch[k] && S.ch[k].on);
const contactName = c => c ? (c.name || c.company || (c.phone ? "+" + c.phone : "Visitante de " + (CHN[chOf(c)] || CHN.web).label)) : "";
const winInfo = c => {
  if (c && CHN[chOf(c)] && (!CHN[chOf(c)].window || (chOf(c) === "whatsapp" && waQr()))) return { open: true, closesAt: null, nolimit: true };
  const last = c && c.lastInboundAt;
  if (!last) return { open: false, closesAt: null, never: true };
  const closesAt = last + 24 * H;
  return { open: Date.now() < closesAt, closesAt };
};
// Explica en palabras simples por qué la asesora virtual no pudo responder
function aiErrText(m) {
  const t = String(m || "");
  if (/x-api-key|authentication|invalid.*api.?key|401/i.test(t)) return "la clave de la API de Claude no es válida (revisa ANTHROPIC_API_KEY).";
  if (/credit balance|billing|402/i.test(t)) return "la cuenta de Claude no tiene saldo (recárgala en console.anthropic.com).";
  if (/overloaded|529|rate.?limit|429/i.test(t)) return "Claude estaba ocupado; lo intentará con el próximo mensaje.";
  if (/WhatsApp|Graph|OAuth|token/i.test(t)) return "WhatsApp rechazó el envío (revisa WA_TOKEN): " + t;
  return t || "error desconocido.";
}
const isAdmin = () => S.me && S.me.role === "admin";
const stamp = () => ({ updatedAt: Date.now(), updatedBy: S.me ? S.me.name : "" });

// ======================= Arranque =======================
const root = $("#root");
if (!fb.configured) {
  root.innerHTML = `<div class="login"><div class="card"><h2 style="margin:0">Falta conectar Firebase</h2>
    <p class="muted" style="margin:0">Pega la configuración de tu proyecto en <b>firebase-config.js</b> y publica de nuevo. Los pasos están en la guía <b>INSTALAR-FIREBASE.md</b>.</p></div></div>`;
} else {
  fb.onUser(async u => {
    S.unsubs.forEach(f => f()); S.unsubs = [];
    S.user = u;
    if (!u) return renderLogin();
    root.innerHTML = '<div class="empty">Cargando…</div>';
    S.unsubs.push(fb.watchDoc("users/" + u.uid, me => {
      const first = !S.me;
      S.me = me;
      if (!me || me.active === false) {
        root.innerHTML = `<div class="login"><div class="card"><h2 style="margin:0">Sin acceso</h2>
          <p class="muted" style="margin:0">Tu usuario (${esc(u.email)}) no está activo en el CRM. Pídele a la administradora que te agregue en Equipo.</p>
          <p style="margin:0">Tu UID es:</p><code class="in" style="user-select:all;word-break:break-all">${esc(u.uid)}</code>
          <p class="muted" style="margin:0;font-size:13px">Si eres la administradora: en Firestore › users crea un documento con este UID como ID y los campos name, email, role = admin y active = true.</p>
          <button class="btn" id="out">Salir</button></div></div>`;
        $("#out").onclick = () => fb.logout();
        return;
      }
      if (first) startData();
      else renderShell();
    }, e => {
      root.innerHTML = `<div class="login"><div class="card"><h2 style="margin:0">No se pudo verificar tu acceso</h2>
        <p class="muted" style="margin:0">${esc(errMsg(e))}</p><p style="margin:0">Tu UID es:</p><code class="in" style="user-select:all;word-break:break-all">${esc(u.uid)}</code>
        <p class="muted" style="margin:0;font-size:13px">Revisa que en Firestore › users exista un documento con este UID exacto como ID, y que las reglas estén publicadas (firebase deploy --only firestore).</p>
        <button class="btn" id="out2">Salir</button></div></div>`;
      $("#out2").onclick = () => fb.logout();
    }));
  });
}

const APP_NAME = "House Chat";
function renderLogin(err) {
  root.innerHTML = `<div class="login"><form class="card" id="lf">
    <div class="brand login-brand"><img class="brand-logo" src="logo-hc.svg" alt=""><div><b>${APP_NAME}</b><small>CRM · ${esc(EMPRESA)}</small></div></div>
    <div><label class="lb" for="le">Correo</label><input class="in" id="le" type="email" autocomplete="username" required></div>
    <div><label class="lb" for="lp">Contraseña</label><input class="in" id="lp" type="password" autocomplete="current-password" required></div>
    <p id="lerr" style="margin:0;color:var(--red)">${esc(err || "")}</p>
    <button class="btn primary" type="submit">Entrar</button>
    <button class="btn" type="button" id="lreset">Olvidé mi contraseña</button></form></div>`;
  $("#lf").onsubmit = async e => {
    e.preventDefault();
    try { await fb.login($("#le").value.trim(), $("#lp").value); }
    catch (er) { $("#lerr").textContent = /invalid|wrong|not-found|credential/i.test(er.code || "") ? "Correo o contraseña incorrectos." : "No se pudo entrar: " + errMsg(er); }
  };
  $("#lreset").onclick = async () => {
    const em = $("#le").value.trim(); if (!em) return ($("#lerr").textContent = "Escribe tu correo arriba y vuelve a pulsar.");
    try { await fb.resetPassword(em); $("#lerr").textContent = "Te enviamos un correo para cambiar la contraseña."; } catch (er) { $("#lerr").textContent = errMsg(er); }
  };
}

// Todo contacto debe tener el campo owner ("" = sin asignar) para que los asesores vean los suyos y los libres.
// La administradora lo completa una vez en los contactos antiguos.
function fixOwners(list) {
  const done = S.ownersFixed || (S.ownersFixed = new Set());
  const miss = list.filter(c => !("owner" in c) && !done.has(c.id));
  miss.forEach(c => done.add(c.id));
  if (miss.length) fb.batch(miss.map(c => ({ op: "set", path: "contacts/" + c.id, data: { owner: "" }, merge: true }))).catch(e => console.warn("owner", e));
}
// Responsables que puede elegir la persona: la administradora, cualquiera del equipo; un asesor, solo él mismo
const ownerOptions = () => (isAdmin() ? S.team.filter(u => u.active !== false).map(u => u.name) : [S.me.name]);
// Lo que un asesor no ve: configuración, difusiones, promociones, formularios, anuncios, importar y exportar
const ADMIN_ONLY = new Set(["lineabase", "segmentos", "listas", "ventacruzada", "carritos", "campanas", "promociones", "formularios", "anuncios", "captacion", "integraciones", "canales", "conectores", "apps", "asesora", "automatizaciones", "plantillas", "equipo", "importar", "exportar"]);
const canView = k => isAdmin() || !ADMIN_ONLY.has(k);
function startData() {
  const w = (name, path, opts) => S.unsubs.push(fb.watch(path, list => { S[name] = list; S.loaded[name] = true; S.syncedAt = Date.now(); scheduleRender(); }, opts,
    e => toast("No se pudo leer " + name + ": " + errMsg(e))));
  const gotContacts = list => {
    inboundAlert(S.loaded.contacts ? S.contacts : null, list); S.contacts = list; S.loaded.contacts = true; S.syncedAt = Date.now(); scheduleRender();
    if (isAdmin()) fixOwners(list);
  };
  const cErr = e => toast("No se pudo leer contacts: " + errMsg(e));
  if (isAdmin()) S.unsubs.push(fb.watch("contacts", gotContacts, undefined, cErr));
  else {
    // Asesores: solo sus contactos y los que no tienen responsable (las reglas de la base de datos exigen este filtro)
    const parts = { mine: [], free: [] }, merge = () => gotContacts([...parts.mine, ...parts.free]);
    S.unsubs.push(fb.watch("contacts", l => { parts.mine = l; merge(); }, { where: [["owner", "==", S.me.name || "—"]] }, cErr));
    S.unsubs.push(fb.watch("contacts", l => { parts.free = l; merge(); }, { where: [["owner", "==", ""]] }, cErr));
  }
  w("quotes", "quotes", { orderBy: ["createdAt", "desc"] });
  w("orders", "orders", { orderBy: ["createdAt", "desc"] });
  w("products", "products");
  w("templates", "templates");
  w("team", "users");
  w("automations", "automations");
  w("knowledge", "knowledge");
  w("forms", "forms");
  w("campaigns", "campaigns", { orderBy: ["createdAt", "desc"] });
  w("promos", "promos");
  w("priceLists", "priceLists");
  w("segments", "segments");
  w("ratings", "ratings", { orderBy: ["at", "desc"], limit: 600 });
  w("aiStats", "aiStats");
  S.unsubs.push(fb.watchDoc("settings/lineaBase", d => { S.base = d || {}; if (S.view === "lineabase") scheduleRender(); }, () => { S.base = {}; }));
  if (isAdmin()) {
    S.unsubs.push(fb.watchDoc("settings/voz", d => { S.voz = d || {}; if (["asesora", "apps", "integraciones"].includes(S.view)) scheduleRender(); }, () => { S.voz = {}; }));
    S.unsubs.push(fb.watchDoc("settings/ads", d => { S.ads = d || {}; if (S.view === "anuncios") scheduleRender(); }, () => { S.ads = {}; }));
    S.unsubs.push(fb.watch("adSpend", l => { S.adSpend = Object.fromEntries(l.map(x => [x.id, x])); if (S.view === "anuncios") scheduleRender(); }, {}, () => { S.adSpend = {}; }));
  }
  S.unsubs.push(fb.watchDoc("settings/ventaCruzada", d => { S.cross = d || {}; if (S.view === "ventacruzada") scheduleRender(); }, () => { S.cross = {}; }));
  S.unsubs.push(fb.watchDoc("settings/asesora", d => { S.ai = d || {}; scheduleRender(); }, () => { S.ai = {}; }));
  S.unsubs.push(fb.watchDoc("settings/channels", d => { S.ch = d || {}; scheduleRender(); }, () => { S.ch = {}; }));
  // Estado del puente de WhatsApp por QR (solo la administradora puede leerlo); late cada minuto, así que solo redibuja Canales
  S.unsubs.push(fb.watchDoc("waqr/state", d => { S.waqr = d; if (S.view === "canales" || S.view === "integraciones") scheduleRender(); }, () => { S.waqr = null; }));
  S.unsubs.push(fb.watchDoc("settings/apps", d => { S.apps = d || {}; scheduleRender(); }, () => { S.apps = {}; }));
  if (isAdmin()) { // comentarios automáticos y plantillas de Meta: solo la administradora
    S.unsubs.push(fb.watchDoc("settings/comentarios", d => { S.com = d || {}; if (S.view === "captacion") scheduleRender(); }, () => { S.com = {}; }));
    S.unsubs.push(fb.watch("comentarios", l => { S.comLog = l; if (S.view === "captacion") scheduleRender(); }, { orderBy: ["at", "desc"], limit: 100 }, () => { S.comLog = []; }));
    S.unsubs.push(fb.watch("carts", l => { S.carts = l; if (["carritos", "oportunidades"].includes(S.view)) scheduleRender(); }, { orderBy: ["createdAt", "desc"], limit: 400 }, () => { S.carts = []; }));
    S.unsubs.push(fb.watchDoc("settings/carritos", d => { S.cartCfg = d || {}; if (S.view === "carritos") scheduleRender(); }, () => { S.cartCfg = {}; }));
    S.unsubs.push(fb.watchDoc("settings/waTemplates", d => { S.waTpl = d; if (S.view === "plantillas") scheduleRender(); }, () => { S.waTpl = null; }));
  }
  S.unsubs.push(fb.watchDoc("settings/pipelines", d => { S.pipes = (d && d.list) || []; seedPipes(d); scheduleRender(); }, () => { S.pipes = []; }));
  window.addEventListener("hashchange", route);
  route();
  setInterval(() => { if (S.view === "hoy" && !document.hidden) scheduleRender(); }, 60000);
}
let rq = false;
function scheduleRender() { if (S.dragging) { S.pendingRender = true; return; } if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; renderShell(); }); }
function route() {
  const [v, id] = (location.hash.slice(1) || "hoy").split("/");
  S.view = v || "hoy";
  if (!canView(S.view)) { S.view = "hoy"; history.replaceState(null, "", "#hoy"); }
  if (S.view === "conv") S.convSel = id || S.convSel;
  if (S.view === "hoy" && id) S.sel = id;
  renderShell();
}
const go = (v, id) => { location.hash = v + (id ? "/" + id : ""); };

// ======================= Estructura =======================
const navClosed = g => { try { return localStorage.getItem("crm-nav-" + g) === "1"; } catch { return false; } };
// Páginas que viven dentro de otra sección del menú
const NAV_ALIAS = { canales: "integraciones", conectores: "integraciones", apps: "integraciones" };
const navOn = k => S.view === k || NAV_ALIAS[S.view] === k;
const NAV = [
  [null, [["hoy", "Hoy"], ["conv", "Conversaciones"], ["embudo", "Embudo"], ["contactos", "Contactos"]]],
  ["Ventas", [["pedidos", "Pedidos"], ["cotizaciones", "Cotizaciones"], ["cartera", "Cartera"], ["carritos", "Carritos"], ["oportunidades", "Oportunidades"], ["reposicion", "Avisos de reposición"], ["agenda", "Agenda"]]],
  ["Catálogo", [["productos", "Productos"], ["promociones", "Promociones"], ["listas", "Precios mayoristas"], ["ventacruzada", "Venta cruzada"]]],
  ["Crecimiento", [["campanas", "Campañas"], ["segmentos", "Segmentos"], ["formularios", "Formularios"], ["anuncios", "Anuncios"], ["captacion", "Comentarios y web"], ["plantillas", "Plantillas"]]],
  ["Análisis", [["metricas", "Métricas"], ["calificaciones", "Calificaciones"], ["lineabase", "Línea base"]]],
  ["Configuración", [["equipo", "Equipo"], ["integraciones", "Integraciones"], ["automatizaciones", "Automatizaciones"], ["importar", "Importar Excel"], ["exportar", "Exportar Excel"], ["asesora", "Configuración"]]],
];
function renderShell() {
  if (!S.me) return;
  const keepScroll = $(".view") ? $(".view").scrollTop : 0;
  const active = document.activeElement && document.activeElement.id;
  const caret = active && document.activeElement.selectionStart;
  const pend = pendingCount(), unread = S.contacts.filter(c => c.unread > 0).length;
  document.title = unread ? `(${unread}) ${APP_NAME}` : APP_NAME; // la pestaña muestra cuántos chats tienen mensajes sin leer
  root.innerHTML = `<div class="app">
    <aside class="side" id="side">
      <div class="side-top">
        <div class="brand"><img class="brand-logo" src="logo-hc.svg" alt=""><div><b>${APP_NAME}</b><small>${esc(EMPRESA)}</small></div></div>
        <label class="side-search">${icon("buscar")}<input id="gsearch" placeholder="Buscar contacto" value="${esc(S.search)}" autocomplete="off"></label>
      </div>
      <nav class="nav">${NAV.map(([h, items]) => [h, items.filter(([k]) => canView(k))]).filter(([, items]) => items.length).map(([h, items]) => (h ? `<h4><button class="grp" data-grp="${h}" aria-expanded="${!navClosed(h)}">${h}${icon("chev")}</button></h4>` : "") + (h && navClosed(h) && !items.some(([k]) => navOn(k)) ? "" : items.map(([k, t]) =>
        `<button data-go="${k}" class="${navOn(k) ? "on" : ""}">${icon(k)}<span>${t}</span>${k === "hoy" && pend ? `<span class="count">${pend}</span>` : ""}${k === "conv" && unread ? `<span class="count">${unread}</span>` : ""}</button>${k === "embudo" && navOn(k) ? subPipes() : ""}`).join(""))).join("")}</nav>
      <div class="side-user"><button class="acc-btn" id="myAcc" title="Mi cuenta: cambiar contraseña"><div class="avatar">${esc((S.me.name || "?")[0].toUpperCase())}</div>
        <div class="who"><b>${esc(S.me.name || S.user.email)}</b><small>${S.me.role === "admin" ? "Administradora" : "Asesor"}</small></div></button>
        <button class="iconbtn" id="soundBtn" title="${soundOn() ? "Sonido de mensajes nuevos: activado" : "Sonido de mensajes nuevos: desactivado"}" aria-label="Sonido de mensajes nuevos">${icon(soundOn() ? "sonido" : "mudo")}</button>
        <button class="iconbtn ${S.pushOn ? "push-on" : ""}" id="pushBtn" title="${S.pushOn ? "Notificaciones activadas en este dispositivo" : "Activar notificaciones"}" aria-label="Notificaciones">${icon("campana")}</button>
        <button class="iconbtn" id="logout" title="Salir" aria-label="Salir">${icon("salir")}</button></div>
    </aside>
    <main class="main">
      <div class="topbar-mobile"><button class="iconbtn" id="menuBtn" aria-label="Menú">${icon("menu")}</button><img class="brand-logo sm" src="logo-hc.svg" alt=""><b class="brand-name">${APP_NAME}</b></div>
      ${pushBanner()}${waAlert()}${!anyChannel() ? `<div class="banner"><span>Aún no hay canales conectados: los mensajes se abren en tu WhatsApp y los registras aquí. ${isAdmin() ? '<a href="#canales">Conectar canales</a>' : ""}</span></div>` : ""}
      <div class="view" id="view"></div>
    </main></div>`;
  $$("[data-pipego]").forEach(b => b.onclick = () => { $("#side").classList.remove("open"); S.embF = { ...(S.embF || {}), pipe: b.dataset.pipego, seg: "" }; S.embMore = {}; S.embSel && S.embSel.clear(); renderShell(); });
  $$("[data-go]").forEach(b => b.onclick = () => { $("#side").classList.remove("open"); S.hoyOpen = false; if (location.hash.slice(1) === b.dataset.go) renderShell(); else go(b.dataset.go); });
  $("#logout").onclick = () => fb.logout();
  $("#pushBtn").onclick = () => S.pushOn ? openPushMenu() : enablePush();
  $("#soundBtn").onclick = () => { const on = !soundOn(); try { localStorage.setItem("crm-sound", on ? "1" : "0"); } catch { } if (on) { unlockAudio(); ding(); } toast(on ? "Sonará cada vez que un cliente escriba" : "Sonido de mensajes desactivado"); renderShell(); };
  if ($("#pushOnB")) $("#pushOnB").onclick = enablePush;
  if ($("#pushX")) $("#pushX").onclick = () => { try { localStorage.setItem("crm-push-dismiss", String(Date.now())); } catch { } renderShell(); };
  initPush();
  $("#myAcc").onclick = () => { $("#side").classList.remove("open"); openAccount(); };
  $$("[data-grp]").forEach(b => b.onclick = () => { const k = "crm-nav-" + b.dataset.grp; try { localStorage.setItem(k, navClosed(b.dataset.grp) ? "0" : "1"); } catch { } renderShell(); });
  $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
  $("#gsearch").oninput = e => { S.search = e.target.value; if (S.view !== "contactos") go("contactos"); else renderShell(); };
  const views = { hoy: viewHoy, conv: viewConv, embudo: viewEmbudo, contactos: viewContactos, cotizaciones: viewCotizaciones,
    pedidos: viewPedidos, agenda: viewAgenda, reposicion: viewReposicion, metricas: viewMetricas, anuncios: viewAnuncios, captacion: viewCaptacion, carritos: viewCarritos, listas: viewListas, segmentos: viewSegmentos, calificaciones: viewCalificaciones, lineabase: viewLineaBase, ventacruzada: viewVentaCruzada, cartera: viewCartera, oportunidades: viewOportunidades, exportar: viewExportar, productos: viewProductos, plantillas: viewPlantillas, asesora: viewAsesora, canales: viewCanales, integraciones: viewIntegraciones, conectores: viewConectores, apps: viewApps, formularios: viewFormularios, automatizaciones: viewAutomatizaciones, campanas: viewCampanas, promociones: viewPromociones, equipo: viewEquipo, importar: viewImportar };
  (views[S.view] || viewHoy)($("#view"));
  hydrateMedia($("#view")); // fotos y audios de los clientes (Hoy, Conversaciones)
  $(".view").scrollTop = keepScroll;
  if (active && $("#" + active)) { const el = $("#" + active); el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch { } }
}

// ======================= Asesora virtual (IA) =======================
const aiName = () => (S.ai && S.ai.name) || "Sofía";
const isAiName = n => / · IA$/.test(n || "");
function aiState(c) {
  if (!S.ai || !S.ai.enabled) return { on: false, txt: "Asesora virtual apagada", cls: "" };
  if (c.aiOff) return { on: false, txt: `${aiName()} en pausa en este chat`, cls: "amber" };
  if (c.aiHandoff) return { on: false, txt: `${aiName()} pasó el chat a una persona · ${c.aiHandoff.reason || ""}`, cls: "red" };
  if ((c.aiPausedUntil || 0) > Date.now()) return { on: false, txt: `${aiName()} en pausa hasta ${whenLabel(c.aiPausedUntil)} porque escribió una persona`, cls: "amber" };
  return { on: true, txt: `${aiName()} responde este chat`, cls: "green" };
}
function aiBar(c) {
  if (!canSend(c) || !S.ai || !S.ai.enabled) return "";
  const st = aiState(c);
  return `<div class="aibar">${icon("asesora")}<span class="pill ${st.cls}">${esc(st.txt)}</span>
    ${c.aiError && c.aiError.at > (c.lastOutboundAt || 0) ? `<span class="muted ai-err">⚠ no pudo responder el último mensaje: ${esc(aiErrText(c.aiError.message))}</span>` : ""}
    <span class="spacer"></span><button class="btn sm" id="aiToggle" data-on="${st.on ? "0" : "1"}">${st.on ? "Pausar en este chat" : "Reactivar " + esc(aiName())}</button></div>`;
}
async function setAi(c, on) {
  const patch = on ? { aiOff: false, aiHandoff: null, aiPausedUntil: 0 } : { aiOff: true };
  if (on && c.aiHandoff && c.aiHandoff.at) patch["done." + safeKey("humano:" + c.aiHandoff.at)] = Date.now();
  await fb.update("contacts/" + c.id, { ...patch, ...stamp() });
  toast(on ? `${aiName()} vuelve a responder este chat` : `${aiName()} no responderá este chat hasta que la reactives`);
}
// ======================= Copiloto de ventas (IA) =======================
// Borrador del mensaje por contacto: no se pierde cuando la pantalla se redibuja con mensajes nuevos
const draftOf = c => (S.drafts && S.drafts[c.id]) || "";
const setDraft = (c, t) => { (S.drafts || (S.drafts = {}))[c.id] = t; };
const probCls = p => (p >= 70 ? "hi" : p >= 40 ? "mid" : "lo");
const SENT_ICON = { Positivo: "🙂", Neutral: "😐", Negativo: "🙁" };
// Tarjeta con el análisis de la IA (contacts.ai, lo deja la función copiloto)
function aiInsight(c, wide) {
  const a = c.ai, busy = S.cpBusy === "an:" + c.id;
  if (!a) return `<div class="aicard empty${wide ? " wide" : ""}"><div class="aic-h">${icon("asesora")}<b>Análisis con IA</b></div>
    <p class="muted">${busy ? "Analizando la conversación…" : c.lastInboundAt ? "Se analiza solo en unos minutos." : "Se analiza solo cuando el cliente escriba."}</p>
    ${busy || !c.lastInboundAt ? "" : `<button class="btn sm quiet" data-cp-an="${c.id}">Analizar ahora</button>`}</div>`;
  const stale = (c.lastInboundAt || 0) > (a.hasta || 0);
  const canMove = a.etapa && a.etapa !== (c.stage || "Nuevo") && stagesOf(c).includes(a.etapa) && !["Ganado", "Perdido"].includes(c.stage);
  return `<div class="aicard${wide ? " wide" : ""}">
    <div class="aic-h">${icon("asesora")}<b>Análisis con IA</b><small class="muted">${stale ? "hay mensajes nuevos" : "hace " + ago(a.at)}</small><span class="spacer"></span>
      <button class="btn sm quiet" data-cp-an="${c.id}" ${busy ? "disabled" : ""} title="Volver a analizar">${busy ? "Analizando…" : "↻ Actualizar"}</button></div>
    <div class="aic-prob"><div class="aic-num ${probCls(a.probabilidad)}"><b class="tabnum">${a.probabilidad}%</b><small>probabilidad de compra</small></div>
      <div class="aic-bar"><span class="${probCls(a.probabilidad)}" style="width:${a.probabilidad}%"></span></div></div>
    <div class="aic-tags">${a.temperatura ? `<span class="pill">${esc(a.temperatura)}</span>` : ""}<span class="pill">${esc(a.intencion)}</span><span class="pill">${SENT_ICON[a.sentimiento] || ""} ${esc(a.sentimiento)}</span>${a.urgente ? '<span class="pill red">Urgente</span>' : ""}${a.valor ? `<span class="pill tabnum">≈ ${money(a.valor)}</span>` : ""}</div>
    <p class="aic-sum">${esc(a.resumen)}</p>
    ${a.siguiente ? `<div class="aic-next"><span class="fl">Siguiente paso</span><b>${esc(a.siguiente)}</b></div>` : ""}
    ${a.riesgo ? `<div class="aic-risk">⚠ ${esc(a.riesgo)}</div>` : ""}
    ${(a.objeciones || []).length ? `<div class="aic-list"><span class="fl">Objeciones</span><ul>${a.objeciones.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
    ${(a.productos || []).length ? `<div class="aic-list"><span class="fl">Le interesa</span><div class="aic-tags">${a.productos.map(x => `<span class="pill">${esc(x)}</span>`).join("")}</div></div>` : ""}
    ${canMove ? `<button class="btn sm" data-cp-stage="${c.id}">Mover a «${esc(a.etapa)}»</button>` : ""}</div>`;
}
// Al abrir un chat sin análisis o con mensajes nuevos, se analiza solo (una vez por chat y por sesión)
function autoAnalyze(c) {
  const a = c.ai, last = Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0);
  if (!c.lastInboundAt || (a && last <= (a.hasta || 0)) || S.cpBusy) return;
  const auto = S.autoAn || (S.autoAn = {});
  if (auto[c.id] && Date.now() - auto[c.id] < 5 * 60 * 1000) return;
  if (S.ai && S.ai.autoAnalisis === false) return;
  auto[c.id] = Date.now();
  setTimeout(() => runAnalyze(c, true), 0);
}
function bindInsight(c) {
  autoAnalyze(c);
  $$(`[data-cp-an="${c.id}"]`).forEach(b => b.onclick = () => runAnalyze(c));
  $$(`[data-cp-stage="${c.id}"]`).forEach(b => b.onclick = () => moveStage(c, c.ai.etapa));
}
async function runAnalyze(c, quiet) {
  S.cpBusy = "an:" + c.id; renderShell();
  try { const r = await fb.call("copiloto", { action: "analizar", contactId: c.id }); c.ai = r.ai; if (!quiet) toast("Análisis listo"); }
  catch (e) { if (!quiet) toast("No se pudo analizar: " + errMsg(e)); else console.warn("análisis automático", e); }
  finally { S.cpBusy = null; renderShell(); }
}
// Oportunidades con más probabilidad de compra según la IA (vista Hoy)
function hotStrip() {
  const hot = S.contacts.filter(c => !c.archived && c.ai && c.ai.probabilidad >= 50 && !["Ganado", "Perdido"].includes(c.stage) && Date.now() - (c.ai.at || 0) < 14 * 864e5)
    .sort((a, b) => (b.ai.urgente - a.ai.urgente) || b.ai.probabilidad - a.ai.probabilidad).slice(0, 6);
  if (!hot.length) return "";
  const total = hot.reduce((n, c) => n + (c.ai.valor || 0), 0);
  return `<section class="hot"><div class="hot-h">${icon("asesora")}<b>Oportunidades más probables</b><small class="muted">según la IA${total ? " · ≈ " + money(total) + " en juego" : ""}</small></div>
    <div class="hot-row">${hot.map(c => `<button class="hot-c" data-hot="${c.id}"><span class="aiprob ${probCls(c.ai.probabilidad)}">${c.ai.probabilidad}%</span>
      <b>${esc(contactName(c))}</b><small>${esc(c.ai.siguiente || c.ai.resumen || "")}</small></button>`).join("")}</div></section>`;
}
// Fila del copiloto bajo el cuadro de texto: respuestas sugeridas y mejorar el borrador
const TONES = [["elegante", "Más elegante"], ["corto", "Más corto"], ["calido", "Más cálido"], ["corregir", "Corregir ortografía"]];
function copilotRow(c) {
  const sg = S.cpSug && S.cpSug.cid === c.id ? S.cpSug.list : null, busy = ["sug", "imp"].includes(S.cpBusy) ? S.cpBusy : null;
  return `<div class="cp-row"><button class="btn sm cp" id="cpSug" ${busy ? "disabled" : ""}>${busy === "sug" ? "Pensando…" : "✨ Sugerir respuesta"}</button>
      <select class="in sm" id="cpTone" aria-label="Cómo mejorar">${TONES.map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select>
      <button class="btn sm" id="cpImp" ${busy ? "disabled" : ""}>${busy === "imp" ? "Mejorando…" : "Mejorar mi texto"}</button></div>
    ${sg ? `<div class="cp-sugs">${sg.map((x, i) => `<button class="cp-s" data-sg="${i}"><small>${esc(x.enfoque)}</small><span>${fmtWa(x.texto)}</span></button>`).join("")}
      <button class="link" id="cpClose">Cerrar sugerencias</button></div>` : ""}`;
}
function bindCopilot(c) {
  if (!$("#cpSug")) return;
  const put = t => { setDraft(c, t); const x = $("#ctext"); if (x) { x.value = t; x.focus(); } };
  $("#cpSug").onclick = async () => {
    S.cpBusy = "sug"; renderShell();
    try { const r = await fb.call("copiloto", { action: "sugerir", contactId: c.id, text: draftOf(c) }); S.cpSug = { cid: c.id, list: r.sugerencias || [] }; if (!S.cpSug.list.length) toast("La IA no propuso respuestas"); }
    catch (e) { toast("No se pudo sugerir: " + errMsg(e)); }
    finally { S.cpBusy = null; renderShell(); }
  };
  $("#cpImp").onclick = async () => {
    const t = draftOf(c).trim(); if (!t) return toast("Escribe primero tu mensaje y luego lo mejoro");
    S.cpBusy = "imp"; renderShell();
    try { const r = await fb.call("copiloto", { action: "mejorar", text: t, tone: $("#cpTone").value }); setDraft(c, r.texto || t); }
    catch (e) { toast("No se pudo mejorar: " + errMsg(e)); }
    finally { S.cpBusy = null; renderShell(); }
  };
  $$("[data-sg]").forEach(b => b.onclick = () => { put(S.cpSug.list[+b.dataset.sg].texto); S.cpSug = null; renderShell(); });
  if ($("#cpClose")) $("#cpClose").onclick = () => { S.cpSug = null; renderShell(); };
}

// ======================= Automatizaciones =======================
const TRIGGERS = {
  nuevo_contacto: "Llega un contacto nuevo",
  etapa: "Un contacto pasa a la etapa…",
  palabra: "El cliente escribe una palabra clave",
  sin_respuesta: "El cliente no responde en… días",
};
const ACTIONS = {
  asignar: "Asignar responsable", etapa: "Cambiar etapa", mensaje: "Enviar mensaje", seguimiento: "Programar seguimiento",
  etiqueta: "Agregar etiqueta", temperatura: "Cambiar temperatura",
};
const RULE_IDEAS = [
  { name: "Repartir los chats nuevos entre el equipo", trigger: { type: "nuevo_contacto" }, actions: [{ type: "asignar", owner: "rotar" }] },
  { name: "Si no responde en 3 días, recordar escribirle", trigger: { type: "sin_respuesta", days: 3 }, actions: [{ type: "seguimiento", days: 0, text: "Escríbele de nuevo: no respondió en 3 días" }, { type: "temperatura", value: "❄️ Frío" }] },
  { name: "Cotización enviada: seguimiento en 2 días", trigger: { type: "etapa", stage: "Cotización enviada" }, actions: [{ type: "seguimiento", days: 2, text: "Pregúntale si revisó la cotización" }] },
  { name: "Venta ganada: mensaje de agradecimiento", trigger: { type: "etapa", stage: "Ganado" }, actions: [{ type: "mensaje", text: "¡Gracias por tu compra, {nombre}! 💛 Cualquier cosa que necesites, aquí estamos. — {empresa}" }] },
  { name: "Pregunta por precio: marcar como interesado", trigger: { type: "palabra", keywords: ["precio", "cuánto vale", "cuanto cuesta", "cotización"] }, actions: [{ type: "etiqueta", tag: "Interesado" }, { type: "temperatura", value: "🔥 Caliente" }] },
];
function triggerText(t = {}) {
  if (t.type === "etapa") return `Cuando un contacto pasa a <b>${esc(t.stage || "…")}</b>`;
  if (t.type === "palabra") return `Cuando el cliente escribe <b>${esc((t.keywords || []).join(", ") || "…")}</b>`;
  if (t.type === "sin_respuesta") return `Cuando el cliente no responde en <b>${t.days || 3} días</b>`;
  return `Cuando llega un contacto nuevo${t.channel ? " por <b>" + esc(CHN[t.channel].label) + "</b>" : ""}`;
}
function actionText(a = {}) {
  return ({
    asignar: () => a.owner === "rotar" ? "asignar por turnos al equipo" : "asignar a " + esc(a.owner || "…"),
    etapa: () => "mover a " + esc(a.stage || "…"),
    mensaje: () => `enviar “${esc((a.text || "").slice(0, 60))}${(a.text || "").length > 60 ? "…" : ""}”${a.template && a.template.name ? " (o plantilla " + esc(a.template.name) + ")" : ""}`,
    seguimiento: () => `seguimiento ${Number(a.days) ? "en " + a.days + " días" : "hoy"}: ${esc(a.text || "")}`,
    etiqueta: () => "etiquetar " + esc(a.tag || "…"),
    temperatura: () => "temperatura " + esc(a.value || "…"),
  }[a.type] || (() => a.type))();
}
function viewAutomatizaciones(el) {
  const adm = isAdmin(), list = (S.automations || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Automatizaciones</h1><span class="sub">Cuando pasa algo, House Chat hace el trabajo repetitivo por ti.</span><span class="spacer"></span>
      ${adm ? '<button class="btn primary" id="newRule">+ Nueva automatización</button>' : ""}</div>
    ${list.length ? `<div class="rules">${list.map(r => `<div class="rule ${r.on ? "" : "off"}" data-r="${r.id}">
        <div class="rule-h"><b>${esc(r.name || "Sin nombre")}</b><span class="spacer"></span>
          ${adm ? `<label class="tgl" title="${r.on ? "Activa" : "Apagada"}"><input type="checkbox" data-on="${r.id}" ${r.on ? "checked" : ""}><span></span></label>` : `<span class="pill ${r.on ? "green" : ""}">${r.on ? "Activa" : "Apagada"}</span>`}</div>
        <div class="rule-flow"><span class="when">${icon("automatizaciones")}${triggerText(r.trigger)}</span>
          ${(r.actions || []).map(a => `<span class="then">→ ${actionText(a)}</span>`).join("")}</div>
        <div class="rule-f muted">${r.runs ? `Se ha ejecutado ${r.runs} ${r.runs === 1 ? "vez" : "veces"} · última ${whenLabel(r.lastRunAt)}` : "Aún no se ha ejecutado"}
          ${adm ? `<span class="spacer"></span><button class="link" data-edit="${r.id}">Editar</button>` : ""}</div></div>`).join("")}</div>`
      : `<div class="empty"><p><b>Aún no tienes automatizaciones.</b></p><p>Empieza con una de estas ideas:</p></div>`}
    ${adm ? `<h2 class="sec-t">Ideas para empezar</h2><div class="ideas">${RULE_IDEAS.map((r, i) => `<button class="idea" data-idea="${i}"><b>${esc(r.name)}</b><span>${triggerText(r.trigger)} ${r.actions.map(a => "→ " + actionText(a)).join(" ")}</span></button>`).join("")}</div>` : ""}
  </div>`;
  if ($("#newRule")) $("#newRule").onclick = () => openRule(null);
  $$("[data-edit]", el).forEach(b => b.onclick = () => openRule(b.dataset.edit));
  $$("[data-idea]", el).forEach(b => b.onclick = () => openRule(null, JSON.parse(JSON.stringify(RULE_IDEAS[b.dataset.idea]))));
  $$("[data-on]", el).forEach(i => i.onchange = () => fb.update("automations/" + i.dataset.on, { on: i.checked, ...stamp() }).then(() => toast(i.checked ? "Activada" : "Apagada")));
}
function openRule(id, seed) {
  const r = id ? JSON.parse(JSON.stringify(byId(S.automations, id))) : (seed || { name: "", trigger: { type: "nuevo_contacto" }, actions: [{ type: "asignar", owner: "rotar" }] });
  r.on = id ? r.on : true;
  const m = $("#modal"), team = S.team.filter(u => u.active !== false).map(u => u.name), waTpls = S.templates.filter(t => t.waName);
  const sel = (key, opts, val, ph = "") => `<select class="in" data-f="${key}">${ph ? `<option value="">${ph}</option>` : ""}${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(val ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
  const actFields = (a, i) => {
    const f = {
      asignar: () => sel(`a${i}.owner`, [["rotar", "Por turnos entre asesores"], ...team], a.owner),
      etapa: () => sel(`a${i}.stage`, allStages(), a.stage),
      mensaje: () => `<textarea class="in" data-f="a${i}.text" rows="2" placeholder="Hola {nombre}…">${esc(a.text || "")}</textarea>
        ${sel(`a${i}.tpl`, waTpls.map(t => [t.id, "Plantilla WhatsApp: " + t.name]), (waTpls.find(t => a.template && t.waName === a.template.name) || {}).id, "Si la ventana de WhatsApp está cerrada: no enviar")}
        <small class="muted">Variables: {nombre} {empresa} {asesor} {producto} {busca}</small>`,
      seguimiento: () => `<input class="in" type="number" min="0" data-f="a${i}.days" value="${a.days ?? 1}" style="max-width:90px" aria-label="Días"><input class="in" data-f="a${i}.text" value="${esc(a.text || "")}" placeholder="Qué hacer">`,
      etiqueta: () => `<input class="in" data-f="a${i}.tag" value="${esc(a.tag || "")}" placeholder="Ej: Interesado">`,
      temperatura: () => sel(`a${i}.value`, TEMPS, a.value),
    }[a.type];
    return f ? f() : "";
  };
  const draw = () => {
    const t = r.trigger;
    m.innerHTML = `<form id="rf"><div class="mh"><h2>${id ? "Editar automatización" : "Nueva automatización"}</h2><button class="iconbtn" type="button" id="rx" aria-label="Cerrar">✕</button></div>
      <div class="mb">
        <div><label class="lb" for="rn">Nombre</label><input class="in" id="rn" value="${esc(r.name || "")}" required placeholder="Ej: Repartir chats nuevos"></div>
        <fieldset class="fs"><legend>Cuando</legend><div class="rule-row">${sel("t.type", Object.entries(TRIGGERS), t.type)}
          ${t.type === "etapa" ? sel("t.stage", allStages(), t.stage) : ""}
          ${t.type === "palabra" ? `<input class="in" data-f="t.keywords" value="${esc((t.keywords || []).join(", "))}" placeholder="precio, cotización, envío">` : ""}
          ${t.type === "sin_respuesta" ? `<input class="in" type="number" min="1" data-f="t.days" value="${t.days || 3}" style="max-width:90px"><span class="muted">días desde tu último mensaje</span>` : ""}
          ${t.type === "nuevo_contacto" ? sel("t.channel", Object.keys(CHN).map(k => [k, CHN[k].label]), t.channel, "Por cualquier canal") : ""}</div></fieldset>
        <fieldset class="fs"><legend>Entonces</legend><div class="acts">${r.actions.map((a, i) => `<div class="act"><span class="n">${i + 1}</span>
          <div class="act-b">${sel(`a${i}.type`, Object.entries(ACTIONS), a.type)}${actFields(a, i)}</div>
          <button class="iconbtn" type="button" data-del="${i}" aria-label="Quitar">✕</button></div>`).join("")}</div>
          <button class="btn sm" type="button" id="addAct">+ Agregar acción</button></fieldset>
        <label class="switch sm"><input type="checkbox" id="ron" ${r.on ? "checked" : ""}> <span>Activa</span></label>
      </div>
      <div class="mf">${id ? '<button class="btn danger" type="button" id="rdel">Eliminar</button><span class="spacer"></span>' : ""}<button class="btn" type="button" id="rc">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
    $("#rx").onclick = $("#rc").onclick = () => m.close();
    $$("[data-f]", m).forEach(i => i.onchange = () => { read(); if (/^t\.type$|^a\d+\.type$/.test(i.dataset.f)) setTimeout(draw); });
    $$("[data-del]", m).forEach(b => b.onclick = () => { read(); r.actions.splice(+b.dataset.del, 1); setTimeout(draw); });
    $("#addAct").onclick = () => { read(); r.actions.push({ type: "seguimiento", days: 1, text: "" }); setTimeout(draw); };
    if ($("#rdel")) $("#rdel").onclick = async () => { if (!await ask("¿Eliminar esta automatización?", "Eliminar")) return; await fb.remove("automations/" + id); m.close(); toast("Eliminada"); };
    $("#rf").onsubmit = async e => {
      e.preventDefault(); read();
      if (!r.actions.length) return toast("Agrega al menos una acción.");
      if (r.trigger.type === "palabra" && !(r.trigger.keywords || []).length) return toast("Escribe al menos una palabra clave.");
      const data = { name: r.name.trim() || "Automatización", on: r.on, trigger: r.trigger, actions: r.actions, ...stamp() };
      try {
        if (id) await fb.update("automations/" + id, data);
        else await fb.set("automations/" + fb.newId("automations"), { ...data, createdAt: Date.now(), runs: 0 }, false);
        m.close(); toast("Automatización guardada");
      } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
    };
  };
  const read = () => {
    if ($("#rn")) r.name = $("#rn").value; if ($("#ron")) r.on = $("#ron").checked;
    // Primero los tipos: si cambió el tipo, se descartan los campos del tipo anterior
    const changed = new Set();
    $$("[data-f]", m).forEach(i => { const [k, f] = i.dataset.f.split("."); if (f !== "type") return;
      if (k === "t" && i.value !== r.trigger.type) { r.trigger = { type: i.value }; changed.add("t"); }
      else if (k !== "t" && r.actions[+k.slice(1)] && i.value !== r.actions[+k.slice(1)].type) { r.actions[+k.slice(1)] = { type: i.value }; changed.add(k); } });
    $$("[data-f]", m).forEach(i => {
      const [k, f] = i.dataset.f.split("."), v = i.value;
      if (f === "type" || changed.has(k)) return;
      if (k === "t") {
        if (f === "type") return;
        else if (f === "keywords") r.trigger.keywords = v.split(",").map(x => x.trim()).filter(Boolean);
        else if (f === "days") r.trigger.days = Number(v) || 3;
        else if (f !== "type") { if (v) r.trigger[f] = v; else delete r.trigger[f]; }
      } else {
        const a = r.actions[+k.slice(1)]; if (!a) return;
        if (f === "days") a.days = Number(v) || 0;
        else if (f === "tpl") { const t = byId(S.templates, v); if (t) a.template = { name: t.waName, lang: t.waLang || "es", params: (t.waParams || []).map(p => "{" + p + "}") }; else delete a.template; }
        else if (f !== "type") a[f] = v;
      }
    });
  };
  draw(); m.showModal();
}

// ======================= Campañas =======================
const DAYMS = 864e5;
function campMatch(c, f = {}) {
  if (c.archived || c.optOut) return false;
  if (f.segment && c.segment !== f.segment) return false;
  if (f.stage && (c.stage || "Nuevo") !== f.stage) return false;
  if (f.type && c.type !== f.type) return false;
  if (f.temperature && c.temperature !== f.temperature) return false;
  if (f.owner && c.owner !== f.owner) return false;
  if (f.channel && chOf(c) !== f.channel) return false;
  if (f.tag && !(c.tags || []).includes(f.tag)) return false;
  if (f.quietDays) { const last = Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0); if (Date.now() - last < f.quietDays * DAYMS) return false; }
  if (f.segmentId) { const sg = byId(S.segments || [], f.segmentId); if (!sg || !inSegment(c, sg, segStats())) return false; }
  return true;
}
// Compras por contacto para los segmentos (se recalcula solo cuando cambian los pedidos)
let segMemo = null;
const segStats = () => (segMemo && segMemo.o === S.orders ? segMemo.st : (segMemo = { o: S.orders, st: orderStatsC() }).st);
function campReach(list, camp) {
  const r = { total: list.length, now: 0, tpl: 0, no: 0, byCh: {} };
  for (const c of list) {
    const ch = chOf(c); r.byCh[ch] = (r.byCh[ch] || 0) + 1;
    const open = winInfo(c).open;
    if (!canSend(c)) r.no++;
    else if (open && camp.text) r.now++;
    else if (ch === "whatsapp" && camp.template && camp.template.name) r.tpl++;
    else r.no++;
  }
  return r;
}
function campStats(cp) {
  const k = cp.counts || {}, since = cp.startedAt || 0;
  const replied = cp.startedAt ? S.contacts.filter(c => c.lastCampaign === cp.id && (c.lastInboundAt || 0) > since).length : 0;
  return { ...k, replied };
}
const reachHtml = r => `<b>${r.total}</b> contactos · <span class="ok">${r.now} reciben el texto</span>${r.tpl ? ` · <span class="ok">${r.tpl} reciben la plantilla</span>` : ""}${r.no ? ` · <span class="no">${r.no} no se pueden contactar ahora</span>` : ""}
  <div class="reach-ch">${Object.entries(r.byCh).map(([k, n]) => `${chIcon(k)} ${n}`).join(" ")}</div>`;
function viewCampanas(el) {
  const adm = isAdmin(), list = S.campaigns || [];
  const st = s => ({ borrador: '<span class="pill">Borrador</span>', enviando: '<span class="pill amber">Enviando de a poco…</span>', pausada: '<span class="pill red">Pausada</span>', enviada: '<span class="pill green">Enviada</span>' }[s] || "");
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Campañas</h1><span class="sub">Mensajes a un grupo de clientes, con resultados.</span><span class="spacer"></span>
      ${adm ? '<button class="btn primary" id="newCamp">+ Nueva campaña</button>' : ""}</div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Campaña</th><th>Estado</th><th>Fecha</th><th class="num">Destinatarios</th><th class="num">Enviados</th><th class="num">Respondieron</th><th class="num">Omitidos / fallidos</th></tr></thead><tbody>
      ${list.map(cp => { const s = campStats(cp); return `<tr data-cp="${cp.id}"><td><b>${esc(cp.name)}</b></td><td>${st(cp.status)}</td><td>${cp.sentAt ? fmtDT(cp.sentAt) : cp.createdAt ? fmtDT(cp.createdAt) : ""}</td>
        <td class="num">${s.total ?? "—"}</td><td class="num">${s.sent ?? "—"}</td><td class="num">${cp.startedAt ? `${s.replied}${s.sent ? ` <small class="muted">(${Math.round(100 * s.replied / s.sent)}%)</small>` : ""}` : "—"}</td><td class="num">${s.total != null ? (s.skipped || 0) + " / " + (s.failed || 0) : "—"}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty"><p><b>Aún no hay campañas.</b></p><p>Por ejemplo: avisar a los hoteles que tienes sábanas nuevas, o recordarle a los clientes que hace 90 días no compran.</p></div>`}
    <p class="muted" style="font-size:12.5px;margin-top:14px">WhatsApp solo permite escribir libremente a quien te escribió en las últimas 24 h; a los demás se les envía una <b>plantilla aprobada por Meta</b>. Messenger e Instagram no permiten mensajes promocionales fuera de esas 24 h. Telegram y el chat web no tienen ese límite.</p></div>`;
  if ($("#newCamp")) $("#newCamp").onclick = () => openCampaign(null);
  $$("[data-cp]", el).forEach(tr => tr.onclick = () => openCampaign(tr.dataset.cp));
}
function openCampaign(id, preset) {
  const base = id ? byId(S.campaigns, id) : null;
  const cp = base ? JSON.parse(JSON.stringify(base)) : { name: preset && preset.stage ? "Mensaje a " + preset.stage : preset && preset.segmentId ? "Mensaje a " + ((byId(S.segments || [], preset.segmentId) || {}).name || "segmento") : "", filter: { ...(preset || {}) }, text: "", template: null, status: "borrador" };
  const m = $("#modal"), adm = isAdmin(), locked = cp.status !== "borrador";
  const waTpls = S.templates.filter(t => t.waName), team = S.team.filter(u => u.active !== false).map(u => u.name);
  const tags = [...new Set(S.contacts.flatMap(c => c.tags || []))].sort();
  const sel = (k, opts, ph) => `<select class="in" data-cf="${k}" ${locked ? "disabled" : ""}><option value="">${ph}</option>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(cp.filter[k] ?? "") === String(v) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
  let unsub = null;
  const draw = () => {
    const list = S.contacts.filter(c => campMatch(c, cp.filter)), reach = campReach(list, cp);
    m.innerHTML = `<form id="cpf"><div class="mh"><h2>${id ? esc(cp.name) : "Nueva campaña"}</h2><button class="iconbtn" type="button" id="cpx" aria-label="Cerrar">✕</button></div>
      <div class="mb">
        <div><label class="lb" for="cpn">Nombre</label><input class="in" id="cpn" value="${esc(cp.name)}" required placeholder="Ej: Sábanas nuevas para hoteles" ${locked ? "disabled" : ""}></div>
        <fieldset class="fs"><legend>A quién</legend><div class="grid2">
          ${sel("segment", SEGMENTS, "Todos los segmentos")}${pipes().length > 1 ? sel("pipeline", pipes().map(p => [p.id, "Embudo " + p.name]), "Todos los embudos") : ""}${sel("stage", allStages(), "Todas las etapas")}${sel("type", ["Prospecto", "Cliente"], "Prospectos y clientes")}
          ${sel("temperature", TEMPS, "Cualquier temperatura")}${sel("owner", team, "Cualquier responsable")}${sel("channel", Object.keys(CHN).map(k => [k, CHN[k].label]), "Todos los canales")}
          ${sel("tag", tags, "Cualquier etiqueta")}${(S.segments || []).length ? sel("segmentId", S.segments.map(x => [x.id, "Segmento: " + x.name]), "Sin segmento") : ""}
          <div><input class="in" type="number" min="0" data-cf="quietDays" value="${cp.filter.quietDays || ""}" placeholder="Sin hablar hace… días" ${locked ? "disabled" : ""}></div></div></fieldset>
        <div class="reach" id="reach">${reachHtml(reach)}</div>
        <fieldset class="fs"><legend>Mensaje</legend>
          <textarea class="in" id="cpt" rows="4" placeholder="Hola {nombre}, te cuento que llegaron…" ${locked ? "disabled" : ""}>${esc(cp.text || "")}</textarea>
          <small class="muted">Variables: {nombre} {empresa} {asesor} {producto} {busca}</small>
          <div style="margin-top:10px"><label class="lb" for="cptpl">Plantilla de WhatsApp para quienes tienen la ventana cerrada</label>
          <select class="in" id="cptpl" ${locked ? "disabled" : ""}><option value="">No enviar a quienes tienen la ventana cerrada</option>${waTpls.map(t => `<option value="${t.id}" ${cp.template && cp.template.name === t.waName ? "selected" : ""}>${esc(t.name)} (${esc(t.waName)})</option>`).join("")}</select>
          ${waTpls.length ? "" : '<small class="muted">No tienes plantillas con "Nombre en Meta". Configúralas en Plantillas.</small>'}</div></fieldset>
        ${["enviando", "pausada"].includes(cp.status) ? `<div class="banner ${cp.status === "pausada" ? "warn" : ""}" style="${cp.status === "enviando" ? "background:var(--soft)" : ""}">${cp.status === "pausada" ? "⏸ " + esc(cp.pausedReason || "Pausada") : `Enviando de a poco: ${((cp.counts || {}).sent || 0) + ((cp.counts || {}).skipped || 0) + ((cp.counts || {}).failed || 0)} de ${(cp.counts || {}).total || 0}. Solo de 8 a. m. a 8 p. m., un mensaje cada 45 a 90 segundos.`}</div>` : ""}
        ${locked ? `<fieldset class="fs"><legend>Resultados</legend><div class="camp-k">${(() => { const s = campStats(cp); return `<div><b>${s.sent || 0}</b>enviados</div><div><b>${s.replied}</b>respondieron</div><div><b>${s.skipped || 0}</b>omitidos</div><div><b>${s.failed || 0}</b>fallidos</div>`; })()}</div>
          <div class="table-wrap" style="max-height:260px;margin-top:10px"><table class="t"><thead><tr><th>Contacto</th><th>Canal</th><th>Estado</th><th>Detalle</th></tr></thead><tbody id="cprec"><tr><td colspan="4" class="muted">Cargando…</td></tr></tbody></table></div></fieldset>` : ""}
      </div>
      <div class="mf">${id && !locked && adm ? '<button class="btn danger" type="button" id="cpdel">Eliminar</button><span class="spacer"></span>' : ""}
        <button class="btn" type="button" id="cpc">Cerrar</button>${adm && cp.status === "enviando" ? '<button class="btn" type="button" id="cppause">⏸ Pausar</button>' : ""}${adm && cp.status === "pausada" ? '<button class="btn primary" type="button" id="cpresume">▶ Reanudar</button>' : ""}
        ${!locked && adm ? `<button class="btn" type="submit">Guardar borrador</button><button class="btn primary" type="button" id="cpsend" ${reach.now + reach.tpl ? "" : "disabled"}>${icon("send")}Enviar a ${reach.now + reach.tpl}</button>` : ""}</div></form>`;
    $("#cpx").onclick = $("#cpc").onclick = () => m.close();
    const upd = () => { read(); const r = campReach(S.contacts.filter(c => campMatch(c, cp.filter)), cp); $("#reach").innerHTML = reachHtml(r);
      if ($("#cpsend")) { $("#cpsend").disabled = !(r.now + r.tpl); $("#cpsend").innerHTML = `${icon("send")}Enviar a ${r.now + r.tpl}`; } };
    $$("[data-cf]", m).forEach(i => i.onchange = upd);
    if ($("#cpt")) $("#cpt").oninput = upd;
    if ($("#cptpl")) $("#cptpl").onchange = upd;
    if ($("#cpdel")) $("#cpdel").onclick = async () => { if (!await ask("¿Eliminar esta campaña?", "Eliminar")) return; await fb.remove("campaigns/" + id); m.close(); };
    [["#cppause", "pausar"], ["#cpresume", "reanudar"]].forEach(([sel, action]) => { if ($(sel)) $(sel).onclick = async () => {
      try { await fb.call("runCampaign", { id, action }); toast(action === "pausar" ? "Difusión pausada" : "Difusión reanudada"); m.close(); } catch (er) { toast(errMsg(er)); } }; });
    if ($("#cpsend")) $("#cpsend").onclick = async () => {
      read(); if (!cp.name.trim()) return toast("Ponle un nombre a la campaña.");
      const r = campReach(S.contacts.filter(c => campMatch(c, cp.filter)), cp);
      const n = r.now + r.tpl, mins = Math.round(n * 1.1);
      if (!await ask(`Se enviará a ${n} contactos${r.no ? ` (${r.no} se omiten)` : ""}, goteado: un mensaje cada 45 a 90 segundos, máximo el 20% en la primera hora y solo de 8 a. m. a 8 p. m. Tardará unas ${mins < 90 ? mins + " minutos" : Math.round(mins / 60) + " horas"}. Si fallan 5 envíos seguidos, se pausa sola. ¿Empezar?`, "Empezar")) return;
      const cid = await save();
      m.close();
      fb.call("runCampaign", { id: cid }).then(k => toast(`Difusión en curso: ${k.total} destinatarios. Puedes ver el avance en Campañas.`))
        .catch(er => toast("La campaña no se pudo enviar: " + errMsg(er)));
    };
    if (locked && id) {
      unsub && unsub();
      unsub = fb.watch(`campaigns/${id}/recipients`, rows => { const b = $("#cprec"); if (!b) return;
        b.innerHTML = rows.map(x => `<tr><td>${esc(x.name || x.id)}</td><td>${x.channel ? chIcon(x.channel) : ""}</td><td>${esc(x.status || "")}</td><td class="muted">${esc(x.reason || "")}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Sin registros</td></tr>'; });
    }
    $("#cpf").onsubmit = async e => { e.preventDefault(); read(); await save(); m.close(); toast("Borrador guardado"); };
  };
  const read = () => {
    if (locked) return;
    cp.name = $("#cpn").value; cp.text = $("#cpt").value.trim();
    $$("[data-cf]", m).forEach(i => { const v = i.value; if (v === "") delete cp.filter[i.dataset.cf]; else cp.filter[i.dataset.cf] = i.dataset.cf === "quietDays" ? Number(v) : v; });
    const t = byId(S.templates, $("#cptpl").value);
    cp.template = t ? { name: t.waName, lang: t.waLang || "es", params: (t.waParams || []).map(p => "{" + p + "}") } : null;
  };
  const save = async () => {
    const data = { name: cp.name.trim() || "Campaña", filter: cp.filter, text: cp.text, template: cp.template, status: "borrador", ...stamp() };
    if (id) { await fb.update("campaigns/" + id, data); return id; }
    const nid = fb.newId("campaigns"); await fb.set("campaigns/" + nid, { ...data, createdAt: Date.now(), createdBy: S.me.name }, false); id = nid; return nid;
  };
  m.addEventListener("close", () => { unsub && unsub(); }, { once: true });
  draw(); m.showModal();
}

// ======================= Formularios de captura =======================
const FORM_BASE = [["name", "Nombre"], ["phone", "Celular / WhatsApp"], ["email", "Correo"], ["company", "Hotel / empresa"], ["city", "Ciudad"]];
const formUrl = f => `${location.origin}/f.html?id=${f.id}`;
const formEmbed = f => `<iframe src="${formUrl(f)}&embed=1" id="hc-${f.id}" style="width:100%;max-width:560px;border:0;height:640px" title="${(f.title || f.name || "Formulario").replace(/"/g, "")}"></iframe>\n<script>addEventListener("message",function(e){if(e.data&&e.data.houseChatForm==="${f.id}")document.getElementById("hc-${f.id}").style.height=e.data.height+"px"})<\/script>`;
function viewFormularios(el) {
  const adm = isAdmin(), list = (S.forms || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const leads = id => S.contacts.filter(c => c.formId === id);
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Formularios</h1><span class="sub">Captura clientes desde tu página web, Instagram o un código QR.</span><span class="spacer"></span>
      ${adm ? '<button class="btn primary" id="newForm">+ Nuevo formulario</button>' : ""}</div>
    ${list.length ? `<div class="forms">${list.map(f => { const l = leads(f.id), week = l.filter(c => (c.lastFormAt || 0) > Date.now() - 7 * DAY).length; return `<div class="fcard ${f.on === false ? "off" : ""}">
        <div class="fcard-h"><b>${esc(f.name)}</b><span class="spacer"></span>${f.on === false ? '<span class="pill">Apagado</span>' : '<span class="pill green">Activo</span>'}</div>
        <div class="fcard-k"><div><b>${l.length}</b>contactos</div><div><b>${week}</b>esta semana</div><div><b>${f.count || 0}</b>envíos</div></div>
        <div class="muted" style="font-size:12.5px">${esc(f.segment || "Formulario")} · ${esc((pipes().find(p => p.id === (f.pipeline || "ventas")) || DEFAULT_PIPE).name)} › ${esc(f.stage || "Nuevo")}${f.owner ? " · " + (f.owner === "rotar" ? "por turnos" : esc(f.owner)) : ""}</div>
        <div class="chrow"><a class="btn sm" href="${formUrl(f)}" target="_blank" rel="noopener">Abrir</a><button class="btn sm" data-flink="${f.id}">Copiar enlace</button><button class="btn sm" data-femb="${f.id}">Copiar código para tu web</button>
          ${l.length ? `<button class="btn sm" data-fleads="${f.id}">Ver contactos</button>` : ""}${adm ? `<span class="spacer"></span><button class="link" data-fedit="${f.id}">Editar</button>` : ""}</div></div>`; }).join("")}</div>`
      : `<div class="empty"><p><b>Aún no tienes formularios.</b></p><p>Crea uno para que los clientes dejen sus datos en tu página web o desde el enlace de tu Instagram. Cada envío crea el contacto, lo pone en el embudo y le asigna responsable.</p></div>`}</div>`;
  if ($("#newForm")) $("#newForm").onclick = () => openForm(null);
  $$("[data-fedit]", el).forEach(b => b.onclick = () => openForm(b.dataset.fedit));
  $$("[data-flink]", el).forEach(b => b.onclick = () => copy(formUrl(byId(S.forms, b.dataset.flink))));
  $$("[data-femb]", el).forEach(b => b.onclick = () => copy(formEmbed(byId(S.forms, b.dataset.femb))));
  $$("[data-fleads]", el).forEach(b => b.onclick = () => { S.search = ""; S.conF = { form: b.dataset.fleads }; go("contactos"); });
}
function openForm(id) {
  const base = id ? byId(S.forms, id) : null;
  const f = base ? JSON.parse(JSON.stringify(base)) : { name: "", title: "Cotiza tu dotación", intro: "Déjanos tus datos y un asesor te escribe por WhatsApp.", button: "Quiero que me contacten",
    thanks: "¡Gracias! Te escribimos muy pronto por WhatsApp.", color: "#0f7a4c", segment: "Hoteles", pipeline: "ventas", stage: "Nuevo", owner: "rotar", tags: ["Formulario"], on: true,
    fields: [{ key: "name", label: "Nombre", required: true }, { key: "phone", label: "Celular / WhatsApp", required: true }, { key: "company", label: "Hotel / empresa" }, { key: "city", label: "Ciudad" },
      { key: "q1", label: "¿Qué necesitas?", type: "textarea" }] };
  const m = $("#modal"), team = S.team.filter(u => u.active !== false).map(u => u.name);
  const draw = () => {
    const pipe = pipes().find(p => p.id === f.pipeline) || pipes()[0];
    const has = k => f.fields.find(x => x.key === k);
    const custom = f.fields.filter(x => !FORM_BASE.some(([k]) => k === x.key));
    m.innerHTML = `<form id="ff"><div class="mh"><h2>${id ? esc(f.name) : "Nuevo formulario"}</h2><button class="iconbtn" type="button" id="fx" aria-label="Cerrar">✕</button></div>
      <div class="mb">
        <div class="grid2"><div><label class="lb" for="fn">Nombre interno</label><input class="in" id="fn" value="${esc(f.name)}" required placeholder="Ej: Página web · Hoteles"></div>
          <div><label class="lb" for="fco">Color</label><input class="in" id="fco" type="color" value="${esc(f.color)}"></div>
          <div class="full"><label class="lb" for="ft">Título que ve el cliente</label><input class="in" id="ft" value="${esc(f.title)}"></div>
          <div class="full"><label class="lb" for="fi">Texto de introducción</label><input class="in" id="fi" value="${esc(f.intro)}"></div></div>
        <fieldset class="fs"><legend>Campos</legend><div class="fflds">
          ${FORM_BASE.map(([k, l]) => `<div class="ffld"><label class="switch sm"><input type="checkbox" data-fb="${k}" ${has(k) ? "checked" : ""}> <span>${l}</span></label>
            <label class="muted" style="font-size:12px"><input type="checkbox" data-fr="${k}" ${has(k) && has(k).required ? "checked" : ""}> obligatorio</label></div>`).join("")}
          ${custom.map(x => { const i = f.fields.indexOf(x); return `<div class="ffld cus"><input class="in" data-cl="${i}" value="${esc(x.label)}" placeholder="Pregunta">
            <select class="in" data-ct="${i}"><option value="text" ${x.type !== "textarea" && x.type !== "select" ? "selected" : ""}>Respuesta corta</option><option value="textarea" ${x.type === "textarea" ? "selected" : ""}>Respuesta larga</option><option value="select" ${x.type === "select" ? "selected" : ""}>Lista de opciones</option></select>
            ${x.type === "select" ? `<input class="in" data-co="${i}" value="${esc((x.options || []).join(", "))}" placeholder="Opciones separadas por coma">` : ""}
            <label class="muted" style="font-size:12px"><input type="checkbox" data-cr="${i}" ${x.required ? "checked" : ""}> obligatorio</label><button class="iconbtn" type="button" data-cdel="${i}" aria-label="Quitar">✕</button></div>`; }).join("")}
          <button class="btn sm" type="button" id="fadd">+ Agregar pregunta</button></div></fieldset>
        <fieldset class="fs"><legend>Qué pasa con cada envío</legend><div class="grid2">
          <div><label class="lb" for="fsg">Segmento</label><select class="in" id="fsg">${SEGMENTS.map(x => `<option ${f.segment === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
          <div><label class="lb" for="fow">Responsable</label><select class="in" id="fow"><option value="">Sin asignar</option><option value="rotar" ${f.owner === "rotar" ? "selected" : ""}>Por turnos entre asesores</option>${team.map(t => `<option ${f.owner === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
          ${pipes().length > 1 ? `<div><label class="lb" for="fpi">Embudo</label><select class="in" id="fpi">${pipes().map(p => `<option value="${p.id}" ${p.id === pipe.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>` : ""}
          <div><label class="lb" for="fst">Etapa</label><select class="in" id="fst">${pipe.stages.filter(x => x !== "Ganado" && x !== "Perdido").map(x => `<option ${f.stage === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
          <div><label class="lb" for="ftg">Etiquetas</label><input class="in" id="ftg" value="${esc((f.tags || []).join(", "))}"></div>
          <div><label class="lb" for="fbt">Texto del botón</label><input class="in" id="fbt" value="${esc(f.button)}"></div>
          <div class="full"><label class="lb" for="fth">Mensaje de gracias</label><input class="in" id="fth" value="${esc(f.thanks)}"></div></div>
          <small class="muted">Cada envío crea el contacto (o actualiza el que ya existe con ese celular), deja una nota con las respuestas y una tarea en Hoy para contactarlo. También dispara tus automatizaciones de "contacto nuevo".</small></fieldset>
        <label class="switch sm"><input type="checkbox" id="fon" ${f.on !== false ? "checked" : ""}> <span>Formulario activo</span></label>
      </div>
      <div class="mf">${id ? '<button class="btn danger" type="button" id="fdel">Eliminar</button><span class="spacer"></span>' : ""}<button class="btn" type="button" id="fc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`;
    $("#fx").onclick = $("#fc").onclick = () => m.close();
    $("#fadd").onclick = () => { read(); f.fields.push({ key: "q" + Date.now().toString(36), label: "", type: "text" }); setTimeout(draw); };
    $$("[data-cdel]", m).forEach(b => b.onclick = () => { read(); f.fields.splice(+b.dataset.cdel, 1); setTimeout(draw); });
    $$("[data-ct]", m).forEach(s2 => s2.onchange = () => { read(); setTimeout(draw); });
    if ($("#fpi")) $("#fpi").onchange = () => { read(); const p = pipes().find(x => x.id === f.pipeline); f.stage = p.stages[0]; setTimeout(draw); };
    if ($("#fdel")) $("#fdel").onclick = async () => { if (!await ask("¿Eliminar este formulario? El enlace dejará de funcionar.", "Eliminar")) return; await fb.remove("forms/" + id); m.close(); };
    $("#ff").onsubmit = async e => {
      e.preventDefault(); read();
      if (!f.fields.some(x => ["name", "phone", "email"].includes(x.key))) return toast("Incluye al menos Nombre, Celular o Correo.");
      if (f.fields.some(x => !x.label)) return toast("Escribe el texto de cada pregunta.");
      const data = { ...f, ...stamp() }; delete data.id; delete data.count; delete data.rate; delete data.lastAt;
      try {
        if (id) await fb.update("forms/" + id, data);
        else { const nid = fb.newId("forms"); await fb.set("forms/" + nid, { ...data, createdAt: Date.now(), count: 0 }, false); }
        m.close(); toast("Formulario guardado");
      } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
    };
  };
  const read = () => {
    f.name = $("#fn").value.trim(); f.color = $("#fco").value; f.title = $("#ft").value.trim(); f.intro = $("#fi").value.trim();
    // campos base en orden fijo, luego las preguntas propias
    const custom = f.fields.filter(x => !FORM_BASE.some(([k]) => k === x.key)).map(x => { const i = f.fields.indexOf(x);
      return { key: x.key, label: $(`[data-cl="${i}"]`).value.trim(), type: $(`[data-ct="${i}"]`).value, required: $(`[data-cr="${i}"]`).checked,
        ...($(`[data-co="${i}"]`) ? { options: $(`[data-co="${i}"]`).value.split(",").map(o => o.trim()).filter(Boolean) } : x.options ? { options: x.options } : {}) }; });
    const baseF = FORM_BASE.filter(([k]) => $(`[data-fb="${k}"]`).checked).map(([k, l]) => ({ key: k, label: (f.fields.find(x => x.key === k) || {}).label || l, required: $(`[data-fr="${k}"]`).checked }));
    f.fields = [...baseF, ...custom];
    f.segment = $("#fsg").value; f.owner = $("#fow").value; if ($("#fpi")) f.pipeline = $("#fpi").value; f.stage = $("#fst").value;
    f.tags = $("#ftg").value.split(",").map(t => t.trim()).filter(Boolean); f.button = $("#fbt").value.trim() || "Enviar"; f.thanks = $("#fth").value.trim(); f.on = $("#fon").checked;
  };
  draw(); m.showModal();
}

// ======================= Integraciones =======================
// ======================= Integraciones: centro organizado por categorías =======================
const crumb = t => `<nav class="crumb"><a href="#integraciones">Integraciones</a><span>›</span><b>${esc(t)}</b></nav>`;
function viewIntegraciones(el) {
  const ch = S.ch || {}, adm = isAdmin();
  const on = k => k === "whatsapp" ? waOn() : !!(ch[k] && ch[k].on);
  const lines = (ch.waLines || []).length;
  const tile = t => `<a class="itile" href="${t.href}"${t.id ? ` data-anchor="${t.id}"` : ""}>
      <span class="itile-ic" style="--ic:${t.color}">${t.svg || icon(t.icon)}</span>
      <span class="itile-b"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>
      <span class="itile-s ${t.state === "on" ? "on" : t.state === "warn" ? "warn" : ""}">${t.state === "on" ? "Conectado" : t.state === "warn" ? "Pendiente" : "Disponible"}</span></a>`;
  const chTile = k => ({ href: "#canales", id: "ch-" + k, name: CHN[k].label, color: CHN[k].color, svg: `<svg viewBox="0 0 24 24">${CHN[k].svg.replace(/(fill|stroke)="#fff"/g, `$1="${CHN[k].color}"`).replace(/fill="currentColor"/g, 'fill="#fff"')}</svg>`,
    desc: { whatsapp: waQr() ? "Conectado por QR · " + (ch.waqr.phone || "") : lines ? `${lines} líneas configuradas` : "Con código QR o con la API oficial de Meta", instagram: "Mensajes directos de tu cuenta profesional", messenger: "Mensajes de tu página de Facebook",
      telegram: ch.telegram && ch.telegram.on ? "@" + ch.telegram.username : "Bot con el nombre de tu empresa", web: "Burbuja de chat para tu página web" }[k], state: on(k) ? "on" : "" });
  const ai = S.ai || {}, autos = (S.automations || []).filter(a => a.on).length, forms = (S.forms || []).filter(f => f.on !== false).length;
  const groups = [
    ["Canales de mensajería", "Todos llegan a una sola bandeja de Conversaciones.", ["whatsapp", "instagram", "messenger", "telegram", "web"].map(chTile)],
    ["Inteligencia artificial", "Atención automática las 24 horas.", [{ href: "#asesora", name: "Asesora virtual", icon: "asesora", color: "#7c4dff", desc: `${ai.name || "Sofía"} · ${({ haiku: "Haiku 5.5", sonnet: "Sonnet 5.5", opus: "Opus 5.5" })[ai.model || "haiku"]} · ${(S.knowledge || []).length} ${(S.knowledge || []).length === 1 ? "artículo" : "artículos"} de conocimiento`, state: ai.enabled ? "on" : "" }]],
    ["Captura y automatización", "Consigue clientes y ahorra trabajo repetitivo.", [
      { href: "#formularios", name: "Formularios", icon: "formularios", color: "#0ea5a4", desc: forms ? `${forms} ${forms === 1 ? "formulario activo" : "formularios activos"}` : "Para tu web, Instagram o un QR", state: forms ? "on" : "" },
      { href: "#automatizaciones", name: "Automatizaciones", icon: "automatizaciones", color: "#f59e0b", desc: autos ? `${autos} ${autos === 1 ? "regla activa" : "reglas activas"}` : "Cuando pasa algo, House Chat actúa", state: autos ? "on" : "" },
      { href: "#campanas", name: "Campañas", icon: "campanas", color: "#ef4444", desc: (S.campaigns || []).length ? `${(S.campaigns || []).length} ${(S.campaigns || []).length === 1 ? "campaña" : "campañas"} · mensajes por segmento` : "Mensajes a un grupo de clientes", state: (S.campaigns || []).length ? "on" : "" }]],
    ["Aplicaciones", "Tu tienda en línea, tu facturación y la voz de tu agente.", [
      { href: "#apps", id: "app-elevenlabs", name: "ElevenLabs", svg: APP_ICONS.elevenlabs, color: APP_COLORS.elevenlabs, desc: (S.voz || {}).on ? "Voz: " + (((S.voz.voices || []).find(x => x.id === S.voz.voiceId) || {}).name || "elegida") : "Voz natural para tu agente", state: (S.voz || {}).on ? "on" : "" },
      { href: "#apps", id: "app-shopify", name: "Shopify", svg: APP_ICONS.shopify, color: APP_COLORS.shopify, desc: (S.apps || {}).shopify && S.apps.shopify.on ? `${S.apps.shopify.shop} · ${S.apps.shopify.orders || 0} pedidos` : "Pedidos, clientes, carritos y productos", state: (S.apps || {}).shopify && S.apps.shopify.on ? "on" : "" },
      { href: "#apps", id: "app-mastershop", name: "Mastershop", svg: APP_ICONS.mastershop, color: APP_COLORS.mastershop, desc: "Pedidos de dropshipping a través de Shopify", state: (S.apps || {}).mastershop && S.apps.mastershop.on ? ((S.apps.shopify || {}).on ? "on" : "warn") : "" },
      { href: "#apps", id: "app-siigo", name: "Siigo", svg: APP_ICONS.siigo, color: APP_COLORS.siigo, desc: (S.apps || {}).siigo && S.apps.siigo.on ? "Facturación desde cada pedido" : "Facturación electrónica y clientes", state: (S.apps || {}).siigo && S.apps.siigo.on ? "on" : "" }]],
    ["Conectores", "Une House Chat con otras herramientas.", [
      { href: "#conectores", name: "Webhooks", icon: "integraciones", color: "#334155", desc: "Avisa a tu tienda, ERP o Google Sheets", state: "" },
      { href: "#conectores", name: "API", icon: "integraciones", color: "#1f3a5f", desc: "Crea contactos y pedidos desde otros sistemas", state: "" },
      { href: "#conectores", name: "Zapier · Make · n8n", icon: "integraciones", color: "#ff4f00", desc: "Más de 5.000 apps mediante webhooks", state: "" }]],
  ];
  const total = groups.reduce((n, g) => n + g[2].length, 0), conn = groups.reduce((n, g) => n + g[2].filter(t => t.state === "on").length, 0);
  el.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Integraciones</h1><span class="sub">Canales, inteligencia artificial, automatización, aplicaciones y conectores, en un solo lugar.</span></div>
      <span class="spacer"></span><div class="hub-sum"><b>${conn}</b> de ${total} activas</div></div>
    ${groups.map(([t, d, tiles]) => `<section class="hub-g"><div class="hub-gh"><h2>${t}</h2><span>${d}</span></div><div class="itiles">${tiles.map(tile).join("")}</div></section>`).join("")}
    ${adm ? "" : '<p class="muted" style="font-size:12.5px">Solo la administradora puede cambiar las integraciones.</p>'}</div>`;
  $$("[data-anchor]", el).forEach(a => a.onclick = () => { S.chAnchor = a.dataset.anchor; });
}
// ======================= Voz de la tienda (ElevenLabs) =======================
// full: conectar y desconectar (en Integraciones); si no, solo elegir y escuchar la voz (en Configuración)
function vozBlock(full) {
  const v = S.voz || {}, a = S.ai || {}, adm = isAdmin(), dis = adm ? "" : "disabled";
  if (!v.on) return full && adm ? `<p>Dale a tu agente una voz propia y natural, como una asesora real.</p>
      <form id="vzF" class="chform"><label class="lb" for="vzk">Clave de API de ElevenLabs</label><input class="in" id="vzk" type="password" autocomplete="off" placeholder="sk_…"><div class="chrow"><button class="btn primary">Conectar</button></div></form>
      <p class="muted" style="font-size:12.5px">La clave se guarda en el servidor y nadie del equipo la puede ver. La sacas en elevenlabs.io › tu perfil › API Keys.</p>`
    : `<p class="muted">${adm ? "Sin conectar." : "Pídele a la administradora que la conecte."}</p>`;
  return `<div class="grid2"><div><label class="lb" for="vzv">Voz</label><select class="in" id="vzv" ${dis}>${(v.voices || []).map(x => `<option value="${esc(x.id)}" ${x.id === v.voiceId ? "selected" : ""}>${esc(x.name)}${x.lang ? " · " + esc(x.lang) : ""}</option>`).join("")}</select></div>
      <div class="full"><label class="lb" for="vzt">Texto de prueba</label><input class="in" id="vzt" value="¡Hola! Soy ${esc(a.name || "Sofía")}, de ${esc(EMPRESA)}. ¿En qué te puedo ayudar hoy?"></div></div>
    <div class="chrow" style="margin-top:12px"><button class="btn" type="button" id="vzTry">▶ Escuchar</button>${adm ? '<button class="btn primary" type="button" id="vzSave">Guardar voz</button>' : ""}${full && adm ? '<span class="spacer"></span><button class="link" type="button" id="vzOff">Desconectar</button>' : ""}</div>
    <audio id="vzAudio" controls hidden style="margin-top:10px;width:100%"></audio>
    <p class="muted" style="margin-top:10px;font-size:12.5px">Las respuestas con nota de voz a los clientes se activan en el siguiente paso.</p>`;
}
function bindVoz(el) {
  if ($("#vzF", el)) $("#vzF", el).onsubmit = async e => { e.preventDefault(); const b = $("#vzF button", el); b.disabled = true; b.textContent = "Conectando…";
    try { const r = await fb.call("voz", { action: "conectar", apiKey: $("#vzk", el).value.trim() }); toast(`ElevenLabs conectado: ${r.voices} voces`); } catch (er) { toast(errMsg(er)); b.disabled = false; b.textContent = "Conectar"; } };
  if ($("#vzTry", el)) $("#vzTry", el).onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = "Generando…";
    try { const r = await fb.call("voz", { action: "probar", voiceId: $("#vzv", el).value, text: $("#vzt", el).value }); const au = $("#vzAudio", el); au.src = "data:audio/mpeg;base64," + r.audio; au.hidden = false; au.play().catch(() => {}); }
    catch (er) { toast(errMsg(er)); } finally { b.disabled = false; b.textContent = "▶ Escuchar"; } };
  if ($("#vzSave", el)) $("#vzSave", el).onclick = () => fb.set("settings/voz", { voiceId: $("#vzv", el).value }).then(() => toast("Voz guardada"));
  if ($("#vzOff", el)) $("#vzOff", el).onclick = async () => { if (await ask("¿Desconectar ElevenLabs?", "Desconectar")) await fb.call("voz", { action: "desconectar" }); };
}

// ======================= Aplicaciones: Shopify, Mastershop y Siigo =======================
const APP_ICONS = {
  shopify: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  mastershop: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></svg>',
  elevenlabs: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
  siigo: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
};
const APP_COLORS = { shopify: "#5e8e3e", mastershop: "#5b21b6", siigo: "#0077c8", elevenlabs: "#111111" };
const appCall = (action, data = {}) => fb.call("apps", { action, ...data });
function viewApps(el) {
  const A = S.apps || {}, adm = isAdmin(), sh = A.shopify || {}, sg = A.siigo || {}, ms = A.mastershop || {};
  const hookUrl = `${location.origin}/api/shopify`;
  const head = (k, name, sub, on) => `<div class="chcard-h"><span class="itile-ic sm" style="--ic:${APP_COLORS[k]}">${APP_ICONS[k]}</span><div><b>${name}</b><small>${sub}</small></div><span class="pill ${on ? "green" : ""}">${on ? "Conectado" : "Sin conectar"}</span></div>`;
  el.innerHTML = `<div class="page">${crumb("Aplicaciones")}<div class="page-head"><div><h1>Aplicaciones</h1><span class="sub">Tu tienda en línea, tu facturación y la voz de tu agente, unidas a House Chat.</span></div></div>
    <div class="chgrid apps">
    <section class="chcard" id="app-shopify">${head("shopify", "Shopify", "Pedidos, clientes, carritos abandonados y productos", sh.on)}
      ${sh.on ? `<div class="app-k"><div><b>${sh.orders || 0}</b>pedidos recibidos</div><div><b>${sh.products || 0}</b>productos importados</div><div><b>${sh.lastAt ? ago(sh.lastAt) : "—"}</b>último pedido</div></div>
        <div class="chrow"><span>Tienda: <b>${esc(sh.shop)}</b></span><span class="spacer"></span>${adm ? `<button class="btn" type="button" id="shImp">Importar productos</button><button class="btn" type="button" id="shPromos" title="${sh.hasToken ? "Trae los descuentos automáticos y códigos de Shopify a Promociones" : "Necesita el acceso de Admin (Client ID y Client secret)"}">Leer descuentos ahora</button>` : ""}</div>
        ${sh.hasToken ? `<p class="muted" style="margin:6px 0 0;font-size:12.5px">${sh.promosAt ? `${sh.promos || 0} descuentos de Shopify en Promociones · leídos ${ago(sh.promosAt)} · se actualizan solos cada 3 horas` : "Los descuentos se leen solos cada 3 horas"}</p>`
          : `<p class="muted" style="margin:6px 0 0;font-size:12.5px">Para que ${esc(aiName())} lea tus <b>descuentos y códigos</b> de Shopify, conecta el acceso de Admin abajo (Client ID y Client secret).</p>`}
        ${sh.promosError && (sh.promosErrorAt || 0) > (sh.promosAt || 0) ? `<p class="errc" style="margin:6px 0 0;font-size:12.5px">⚠ No se pudieron leer los descuentos: ${esc(sh.promosError)}</p>` : ""}` : ""}
      <ul class="app-what"><li>Cada <b>pedido</b> de Shopify llega a Pedidos con su número, productos, dirección y estado de pago, y el cliente queda como Ganado.</li>
        <li>Los <b>carritos abandonados</b> crean una tarea en Hoy con el enlace para recuperarlos.</li><li>Los <b>productos</b> se importan con cada color y medida, su foto, sus ofertas y su <b>stock</b>, y se actualizan solos cada hora: la asesora nunca ofrece algo agotado.</li>
        <li>Con el acceso de Admin, la asesora lee tus <b>descuentos y códigos</b> de Shopify y los ofrece.</li></ul>
      ${adm ? `<details class="app-steps" ${sh.on ? "" : "open"}><summary>${sh.on ? "Cambiar la conexión" : "Cómo conectarlo"}</summary><ol class="steps">
          <li>En Shopify ve a <b>Configuración › Notificaciones › Webhooks</b> y pulsa <b>Crear webhook</b> una vez por evento: <i>Creación de pedido</i>, <i>Pago de pedido</i>, <i>Actualización de pedido</i>, <i>Creación de cliente</i> y <i>Creación de pago (checkout)</i>. Opcional, para que el stock se actualice al instante (si no, se actualiza solo cada hora): <i>Creación de producto</i>, <i>Actualización de producto</i> y <i>Eliminación de producto</i>. Formato <b>JSON</b> y esta URL:<div class="codebox"><code class="sel">${esc(hookUrl)}</code><button class="btn sm" type="button" data-copy="${esc(hookUrl)}">Copiar</button></div></li>
          <li>Debajo de la lista, Shopify muestra "Tus webhooks se firmarán con…": copia esa clave y pégala aquí.</li>
          <li>Productos: cuando la tienda esté conectada, toca <b>Importar productos</b>. Se leen del catálogo público de tu tienda; cada medida o talla con precio distinto queda como un producto.</li>
          <li><b>Descuentos y códigos</b> (acceso de Admin): entra a <b>dev.shopify.com</b> con la cuenta dueña de la tienda › <b>Crear app</b> (ponle "House Chat") › en la versión de la app, en los permisos de la <b>Admin API</b>, agrega <code>read_discounts</code> y <code>read_products</code> › <b>Publicar</b> la versión › <b>Instalar</b> la app en tu tienda › en <b>Configuración</b> de la app copia el <b>Client ID</b> y el <b>Client secret</b> y pégalos aquí. House Chat renueva el acceso solo.</li></ol>
        <form id="shf" class="chform"><div class="grid2"><div><label class="lb" for="shs">Dominio de la tienda</label><input class="in" id="shs" placeholder="casadorada.myshopify.com" value="${esc(sh.shop || "")}" required></div>
          <div><label class="lb" for="shk">Clave de firma de webhooks</label><input class="in" id="shk" placeholder="${sh.on ? "Guardada · escribe para cambiarla" : "Pega la clave"}" autocomplete="off"></div>
          <div><label class="lb" for="shci">Client ID (para descuentos)</label><input class="in" id="shci" placeholder="${sh.hasToken ? "Guardado · escribe para cambiarlo" : "Opcional"}" autocomplete="off"></div>
          <div><label class="lb" for="shcs">Client secret (para descuentos)</label><input class="in" id="shcs" type="password" placeholder="${sh.hasToken ? "Guardado · escribe para cambiarlo" : "Opcional"}" autocomplete="off"></div>
          <details class="full"><summary class="muted" style="font-size:12.5px;cursor:pointer">¿Tienes un token de Admin antiguo (shpat_…)?</summary><input class="in" id="sht" style="margin-top:6px" placeholder="shpat_…" autocomplete="off"></details></div>
          <div class="chrow"><button class="btn primary">${sh.on ? "Guardar cambios" : "Conectar Shopify"}</button>${sh.on ? '<span class="spacer"></span><button class="btn danger" type="button" data-appoff="shopify">Desconectar</button>' : ""}</div></form></details>` : ""}
    </section>
    <section class="chcard" id="app-siigo">${head("siigo", "Siigo", "Facturación electrónica y clientes", sg.on)}
      ${sg.on ? `<p>Usuario de la API: <b>${esc(sg.user)}</b>. En cada pedido verás el botón <b>Facturar en Siigo</b>.</p>` : ""}
      <ul class="app-what"><li>Desde un <b>pedido</b> creas la <b>factura en Siigo</b> con un clic: se crea el cliente si no existe y se usa la referencia de cada producto.</li>
        <li>El número de la factura queda guardado en el pedido.</li><li>Para facturar, el contacto debe tener <b>tipo y número de documento</b> (cédula o NIT) en su ficha.</li></ul>
      ${adm ? `<details class="app-steps" ${sg.on ? "" : "open"}><summary>${sg.on ? "Cambiar la configuración" : "Cómo conectarlo"}</summary><ol class="steps">
          <li>La API está incluida en los planes de Siigo Nube para empresas. En Siigo Nube, entra a <b>Alianzas › Mi credencial API</b> y copia el <b>usuario</b>, la <b>clave de acceso (access key)</b> y el <b>Partner-ID</b>.</li>
          <li>En Siigo, busca los <b>identificadores</b> del tipo de comprobante de factura, de la forma de pago, del vendedor y del impuesto IVA. Tu contador o el soporte de Siigo te los pueden dar.</li>
          <li>En <b>Productos</b>, escribe en "Referencia" el mismo código que tiene cada producto en Siigo.</li></ol>
        <form id="sgf" class="chform"><div class="grid2">
          <div><label class="lb" for="sgu">Usuario de la API</label><input class="in" id="sgu" value="${esc(sg.user || "")}" required></div>
          <div><label class="lb" for="sga">Clave de acceso</label><input class="in" id="sga" placeholder="${sg.on ? "Guardada · escribe para cambiarla" : ""}" autocomplete="off"></div>
          <div><label class="lb" for="sgp">Partner-ID</label><input class="in" id="sgp" value="${esc(sg.partnerId || "")}"></div>
          <div><label class="lb" for="sgd">ID tipo de comprobante (factura)</label><input class="in tabnum" id="sgd" value="${esc(sg.documentId || "")}" required></div>
          <div><label class="lb" for="sgy">ID forma de pago</label><input class="in tabnum" id="sgy" value="${esc(sg.paymentId || "")}" required></div>
          <div><label class="lb" for="sgv">ID vendedor (opcional)</label><input class="in tabnum" id="sgv" value="${esc(sg.sellerId || "")}"></div>
          <div><label class="lb" for="sgi">ID impuesto IVA (opcional)</label><input class="in tabnum" id="sgi" value="${esc(sg.ivaId || "")}"></div>
          <div><label class="lb" for="sgr">IVA %</label><input class="in tabnum" id="sgr" type="number" value="${sg.ivaRate ?? 19}"></div>
          <div><label class="lb" for="sgc">Código de producto por defecto</label><input class="in" id="sgc" value="${esc(sg.defaultCode || "")}" placeholder="Si un producto no tiene referencia"></div>
          <div><label class="lb" for="sgcity">Ciudad por defecto (DANE)</label><input class="in tabnum" id="sgcity" value="${esc(sg.cityCode || "05001")}"></div></div>
          <label class="switch sm"><input type="checkbox" id="sgin" ${sg.pricesIncludeIva !== false ? "checked" : ""}> <span>Mis precios ya incluyen IVA</span></label>
          <label class="switch sm"><input type="checkbox" id="sgdian" ${sg.sendDian ? "checked" : ""}> <span>Enviar la factura a la DIAN y al correo del cliente al crearla</span></label>
          <div class="chrow"><button class="btn primary">${sg.on ? "Guardar y probar" : "Conectar Siigo"}</button>${sg.on ? '<span class="spacer"></span><button class="btn danger" type="button" data-appoff="siigo">Desconectar</button>' : ""}</div></form></details>` : ""}
    </section>
    <section class="chcard" id="app-mastershop">${head("mastershop", "Mastershop", "Dropshipping y logística", ms.on && sh.on)}
      <p>Mastershop no publica una API abierta: sincroniza sus pedidos con tu tienda <b>Shopify</b>, y por ahí llegan a House Chat.</p>
      <ul class="app-what"><li>Conecta <b>Shopify</b> arriba y activa aquí Mastershop.</li><li>Los pedidos que Mastershop crea o actualiza en Shopify llegan a <b>Pedidos</b> con su cliente, y aparecen marcados como de Shopify.</li>
        <li>¿Vendes con Mastershop sin Shopify? Pide a Mastershop un webhook de pedidos y conéctalo a la <a href="#conectores">API de House Chat</a> (por ejemplo, con Zapier o Make).</li></ul>
      ${adm ? `<label class="switch sm"><input type="checkbox" id="msOn" ${ms.on ? "checked" : ""}> <span>Uso Mastershop con mi tienda Shopify</span></label>${ms.on && !sh.on ? '<p class="errc" style="font-size:12.5px;margin:6px 0 0">Falta conectar Shopify para recibir los pedidos.</p>' : ""}` : ""}
    </section>
    <section class="chcard" id="app-elevenlabs">${head("elevenlabs", "ElevenLabs", "Voz de la tienda: una voz natural para tu agente", !!(S.voz || {}).on)}${vozBlock(true)}</section></div></div>`;
  bindVoz(el);
  $$("[data-copy]", el).forEach(b => b.onclick = () => copy(b.dataset.copy));
  const busy = (b, t) => { b.disabled = true; b.dataset.t = b.textContent; b.textContent = t; }, done = b => { b.disabled = false; b.textContent = b.dataset.t; };
  if ($("#shf")) $("#shf").onsubmit = async e => { e.preventDefault(); const b = $("#shf .btn.primary"); busy(b, "Guardando…");
    try { const r = await appCall("saveShopify", { shop: $("#shs").value, secret: $("#shk").value, token: $("#sht").value, clientId: $("#shci").value, clientSecret: $("#shcs").value });
      toast(r && r.promos != null ? `Shopify conectado · ${r.promos} descuentos leídos` : "Shopify conectado"); } catch (er) { info(errMsg(er)); } finally { done(b); } };
  if ($("#shPromos")) $("#shPromos").onclick = async () => { const b = $("#shPromos"); busy(b, "Importando…");
    try { const r = await appCall("importShopifyPromos"); toast(`${r.promos} descuentos de Shopify en Promociones`); }
    catch (er) { info(errMsg(er)); } finally { done(b); } };
  if ($("#shImp")) $("#shImp").onclick = async () => { const b = $("#shImp"); busy(b, "Importando…");
    try { const r = await appCall("importShopify"); toast(`${r.products} productos importados de Shopify`); } catch (er) { toast(errMsg(er)); } finally { done(b); } };
  if ($("#sgf")) $("#sgf").onsubmit = async e => { e.preventDefault(); const b = $("#sgf .btn.primary"); busy(b, "Probando conexión…");
    try { await appCall("saveSiigo", { username: $("#sgu").value, accessKey: $("#sga").value, partnerId: $("#sgp").value, documentId: $("#sgd").value, paymentId: $("#sgy").value,
      sellerId: $("#sgv").value, ivaId: $("#sgi").value, ivaRate: $("#sgr").value, defaultCode: $("#sgc").value, cityCode: $("#sgcity").value, stateCode: $("#sgcity").value.slice(0, 2),
      pricesIncludeIva: $("#sgin").checked, sendDian: $("#sgdian").checked }); toast("Siigo conectado"); } catch (er) { toast(errMsg(er)); } finally { done(b); } };
  if ($("#msOn")) $("#msOn").onchange = e => appCall("setMastershop", { on: e.target.checked }).then(() => toast(e.target.checked ? "Mastershop activado" : "Mastershop desactivado")).catch(er => toast(errMsg(er)));
  $$("[data-appoff]", el).forEach(b => b.onclick = async () => { if (!await ask(`¿Desconectar ${b.dataset.appoff === "shopify" ? "Shopify" : "Siigo"}?`, "Desconectar")) return;
    try { await appCall("disconnect", { app: b.dataset.appoff }); toast("Desconectado"); } catch (er) { toast(errMsg(er)); } });
  if (S.chAnchor && $("#" + S.chAnchor)) { const t = $("#" + S.chAnchor); S.chAnchor = null; t.scrollIntoView({ block: "start" }); t.classList.add("flash"); }
}

function viewConectores(el) {
  const adm = isAdmin(), base = location.origin + "/api/v1";
  if (!adm) { el.innerHTML = `<div class="page">${crumb("Webhooks y API")}<div class="page-head"><h1>Webhooks y API</h1></div><p class="muted">Solo la administradora puede ver y configurar las integraciones.</p></div>`; return; }
  const I = S.integ;
  if (!I && !S.integLoading) {
    S.integLoading = true;
    fb.call("integrations", { action: "get" }).then(r => { S.integ = r; }).catch(er => { S.integ = { error: errMsg(er), webhooks: [], events: {} }; }).finally(() => { S.integLoading = false; renderShell(); });
  }
  const ev = (I && I.events) || {};
  const ok = st => /^2\d\d$/.test(String(st));
  el.innerHTML = `<div class="page">${crumb("Webhooks y API")}<div class="page-head"><div><h1>Webhooks y API</h1><span class="sub">Conecta House Chat con tu tienda, tu ERP, Zapier, Make o n8n.</span></div></div>
    ${!I ? '<div class="empty">Cargando…</div>' : I.error ? `<div class="card" style="padding:14px 16px"><b>No se pudo cargar.</b><p class="muted" style="margin:6px 0 0">${esc(I.error)}. Si aún no publicas las funciones nuevas, en Cloud Shell: <code>firebase deploy --only functions</code></p></div>` : `
    <div class="chgrid">
      <section class="chcard"><div class="chcard-h">${icon("integraciones")}<div><b>Webhooks: avisar a otros sistemas</b><small>House Chat envía un POST con JSON cuando pasa algo</small></div></div>
        ${(I.webhooks || []).map(h => `<div class="hook"><div class="hook-u mono">${esc(h.url)}</div><div class="hook-e">${h.events.map(e => `<span class="tag k-gray">${esc(ev[e] || e)}</span>`).join("")}</div>
          <div class="hook-s muted">${h.lastAt ? `Último envío ${whenLabel(h.lastAt)}: <span class="${ok(h.lastStatus) ? "okc" : "errc"}">${esc(h.lastStatus)}</span>` : "Sin envíos todavía"} · firma: <code class="sel" title="Clave para verificar X-HouseChat-Signature">${esc(h.secret)}</code></div>
          <div class="chrow"><button class="btn sm" data-test="${h.id}">Enviar prueba</button><button class="btn sm danger" data-delh="${h.id}">Eliminar</button></div></div>`).join("") || '<p class="muted">Aún no hay webhooks.</p>'}
        <form id="hookf" class="chform"><input class="in" id="hurl" type="url" placeholder="https://hooks.zapier.com/…" required>
          <div class="evs">${Object.entries(ev).map(([k, l]) => `<label><input type="checkbox" value="${k}" ${["contacto.creado", "pedido.creado"].includes(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>
          <div class="chrow"><button class="btn primary">+ Agregar webhook</button></div></form></section>
      <section class="chcard"><div class="chcard-h">${icon("integraciones")}<div><b>API: recibir datos de otros sistemas</b><small>Crea contactos, notas y pedidos desde tu página, tienda o ERP</small></div>${I.apiKeyHint ? '<span class="pill green">Activa</span>' : '<span class="pill">Sin clave</span>'}</div>
        ${I.apiKeyHint ? `<p>Clave actual: <code>${esc(I.apiKeyHint)}</code></p>` : '<p class="muted">Genera una clave para empezar. Se muestra una sola vez: guárdala en un lugar seguro.</p>'}
        <div id="newKey"></div>
        <div class="chrow"><button class="btn primary" id="genKey">${I.apiKeyHint ? "Generar clave nueva" : "Generar clave"}</button>${I.apiKeyHint ? '<button class="btn danger" id="revKey">Desactivar la API</button>' : ""}</div>
        <details class="apidoc"><summary>Cómo usarla</summary>
<pre><code># Crear o actualizar un contacto (por celular o correo)
curl -X POST ${esc(base)}/contacts \
  -H "Authorization: Bearer TU_CLAVE" -H "Content-Type: application/json" \
  -d '{"name":"Hotel Sol","phone":"3001112233","segment":"Hoteles","tags":["Web"],"note":"Pidió catálogo desde la página"}'

# Buscar por celular
curl "${esc(base)}/contacts?phone=3001112233" -H "Authorization: Bearer TU_CLAVE"

# Agregar una nota
curl -X POST ${esc(base)}/contacts/ID/notes -H "Authorization: Bearer TU_CLAVE" \
  -H "Content-Type: application/json" -d '{"text":"Pagó por transferencia"}'

# Crear un pedido (desde tu tienda en línea)
curl -X POST ${esc(base)}/orders -H "Authorization: Bearer TU_CLAVE" \
  -H "Content-Type: application/json" \
  -d '{"phone":"3001112233","items":[{"name":"Sábana 1.40","qty":2,"price":58000}]}'

# Ver el catálogo
curl ${esc(base)}/products -H "Authorization: Bearer TU_CLAVE"</code></pre></details></section>
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:14px">Con Zapier, Make o n8n puedes unir House Chat con Shopify, WooCommerce, Google Sheets, Siigo, Alegra, Gmail y cientos de apps más: usa los webhooks para que House Chat les avise, y la API para que ellos le escriban a House Chat.</p>`}
  </div>`;
  const refresh = r => { S.integ = { ...S.integ, ...r }; renderShell(); };
  if ($("#hookf")) $("#hookf").onsubmit = async e => {
    e.preventDefault();
    const events = $$(".evs input:checked", el).map(i => i.value);
    try { refresh(await fb.call("integrations", { action: "saveWebhook", url: $("#hurl").value.trim(), events })); toast("Webhook agregado"); } catch (er) { toast(errMsg(er)); }
  };
  $$("[data-test]", el).forEach(b => b.onclick = async () => { b.disabled = true;
    try { const r = await fb.call("integrations", { action: "testWebhook", id: b.dataset.test }); toast(ok(r.status) ? "La prueba llegó (" + r.status + ")" : "No llegó: " + r.status); S.integ = null; renderShell(); }
    catch (er) { toast(errMsg(er)); b.disabled = false; } });
  $$("[data-delh]", el).forEach(b => b.onclick = async () => { if (!await ask("¿Eliminar este webhook?", "Eliminar")) return; refresh(await fb.call("integrations", { action: "deleteWebhook", id: b.dataset.delh })); });
  if ($("#genKey")) $("#genKey").onclick = async () => {
    if (I.apiKeyHint && !await ask("La clave anterior dejará de funcionar. ¿Generar una nueva?", "Generar")) return;
    try { const r = await fb.call("integrations", { action: "newApiKey" }); S.integ = { ...S.integ, apiKeyHint: r.key.slice(0, 6) + "…" + r.key.slice(-4) }; renderShell();
      $("#newKey").innerHTML = `<div class="codebox"><code class="sel">${esc(r.key)}</code><button class="btn sm" id="cpKey">Copiar</button></div><p class="errc" style="font-size:12.5px">Cópiala ahora: no se volverá a mostrar.</p>`;
      $("#cpKey").onclick = () => copy(r.key); } catch (er) { toast(errMsg(er)); } };
  if ($("#revKey")) $("#revKey").onclick = async () => { if (!await ask("¿Desactivar la API? Los sistemas que la usan dejarán de funcionar.", "Desactivar")) return;
    await fb.call("integrations", { action: "revokeApiKey" }); S.integ = { ...S.integ, apiKeyHint: "" }; renderShell(); };
}

// Aviso arriba de todo cuando la revisión automática encuentra un problema con WhatsApp
function waAlert() {
  const w = (S.ch && S.ch.waStatus) || {};
  if (!WHATSAPP_ENABLED || !isAdmin() || !w.checkedAt) return "";
  const why = w.meta === "error" ? "Meta no acepta la conexión (revisa el token)" : w.quality === "RED" ? "la calidad del número está baja y Meta podría limitarlo"
    : w.quality === "YELLOW" ? "la calidad del número bajó: evita enviar mensajes masivos" : w.subscribed === false ? "los mensajes no están llegando (falta la suscripción)"
    : w.number && !["CONNECTED", "VERIFIED"].includes(w.number) ? "el número no está activo en WhatsApp" : "";
  return why ? `<div class="banner warn"><span>⚠ WhatsApp: ${why}. <a href="#canales">Ver detalles</a></span></div>` : "";
}
// ======================= Canales =======================
// WhatsApp por la API oficial: estado que revisa la función waStatus (settings/channels.waStatus)
const dotRow = (label, cls, txt) => `<div class="wst"><small>${label}</small><span class="wdot ${cls}">${esc(txt)}</span></div>`;
function waStatusRows(w = {}) {
  const none = !w.checkedAt, sub = w.subscribed;
  const lastIn = Math.max(0, ...S.contacts.filter(c => chOf(c) === "whatsapp").map(c => c.lastInboundAt || 0));
  return [
    dotRow("Acceso a Meta", w.meta === "ok" ? "ok" : w.meta === "error" ? "bad" : "", none ? "sin comprobar" : w.meta === "ok" ? "confirmado" : w.meta === "error" ? "con error" : "sin configurar"),
    dotRow("El número en WhatsApp", !w.number ? "" : w.number === "CONNECTED" || w.number === "VERIFIED" ? "ok" : "warn", !w.number ? "sin comprobar" : w.number === "CONNECTED" || w.number === "VERIFIED" ? "activo en WhatsApp" : w.number.toLowerCase().replace(/_/g, " ")),
    dotRow("Calidad del número", { GREEN: "ok", YELLOW: "warn", RED: "bad" }[w.quality] || "", { GREEN: "normal", YELLOW: "media: cuidado con los envíos", RED: "baja: riesgo de bloqueo" }[w.quality] || (none ? "sin comprobar" : "sin datos todavía")),
    dotRow("Cuenta", { APPROVED: "ok", PENDING: "warn", REJECTED: "bad" }[w.account] || "", { APPROVED: "aprobada", PENDING: "en revisión", REJECTED: "rechazada", error: "no se pudo revisar" }[w.account] || "sin comprobar"),
    dotRow("Recepción de mensajes", sub === true ? "ok" : sub === false ? "bad" : lastIn ? "ok" : "", sub === true ? "suscripción confirmada" : sub === false ? "sin suscripción" : lastIn ? "último mensaje hace " + ago(lastIn) : "sin comprobar"),
    dotRow("Alertas preventivas", "ok", "activas"),
  ].join("");
}
function waApiPanel(ch, adm, hook) {
  const w = ch.waStatus || {}, ok = w.meta === "ok";
  const tier = { TIER_250: "250 clientes nuevos al día", TIER_1K: "1.000 clientes al día", TIER_10K: "10.000 clientes al día", TIER_100K: "100.000 clientes al día", TIER_UNLIMITED: "sin límite" }[w.tier] || "";
  return `<section class="wapanel" id="ch-whatsapp">
    <div class="wp-h"><span class="wp-ic">${chIcon("whatsapp")}</span><div><b>WhatsApp</b><small>La conexión de tu negocio con tus clientes.</small></div>
      <span class="pill ${w.meta === "error" ? "red" : "green"}">${w.meta === "error" ? "Revisar conexión" : "Conexión configurada"}</span></div>
    <div class="wp-grid">${waStatusRows(w)}</div>
    ${w.meta === "error" && w.error ? `<p class="wp-err">Meta respondió: ${esc(w.error)}</p>` : ""}
    <p class="wp-last">${w.checkedAt ? `Última comprobación: ${new Date(w.checkedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false })}${new Date(w.checkedAt).toDateString() !== new Date().toDateString() ? " del " + new Date(w.checkedAt).toLocaleDateString("es-CO") : ""}. ` : "Aún no se ha comprobado. "}Revisión automática cada hora.</p>
    <details class="wp-how"><summary>Cómo configurar la recepción de mensajes</summary>
      <ol class="steps"><li>En <b>developers.facebook.com</b> › tu app › WhatsApp › Configuración, pon esta URL de devolución de llamada: <code class="sel">${esc(hook)}</code></li>
        <li>Token de verificación: la palabra que guardaste en <code>WA_VERIFY_TOKEN</code>.</li>
        <li>Suscríbete al campo <b>messages</b> y prende <b>Suscribir webhooks</b> en tu número.</li>
        <li>Para revisar la cuenta y la suscripción desde aquí, agrega <code>WA_WABA_ID</code> (el identificador de tu cuenta de WhatsApp) en <code>functions/.env</code>.</li></ol></details>
    <p class="eyebrow wp-eb">Número conectado${(ch.waLines || []).length ? ` · ${(ch.waLines || []).length + 1} líneas` : ""}</p>
    <div class="wp-num"><div class="wp-num-h"><b class="tabnum">${esc(w.phone || "Número principal")}</b><span class="pill ${ok ? "green" : ""}">${ok ? "Conexión configurada" : "Sin comprobar"}</span>${w.name ? `<small class="muted">${esc(w.name)}</small>` : ""}</div>
      ${tier ? `<p class="muted wp-tier">Límite de Meta: ${tier}</p>` : ""}
      <label class="wp-dest"><span>Destino de las conversaciones</span><select class="in" id="waDest" ${adm ? "" : "disabled"}>${pipes().map(p => `<option value="${p.id}" ${(ch.waPipeline || "ventas") === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label></div>
    ${adm ? `<div class="wp-actions"><button class="btn" id="waCheck">Comprobar acceso a Meta</button></div>` : ""}
    <details class="wp-how"><summary>Varias líneas de WhatsApp</summary>
      <div class="lines">${(ch.waLines || []).map((l, i) => `<div class="line-i"><span class="ln-n">${esc(l.name)}</span><span class="mono muted">${esc(l.number || "")}</span><span class="muted">${l.owner ? "→ " + esc(l.owner) : "sin responsable fijo"}</span>${adm ? `<button class="link" data-rmline="${i}">Quitar</button>` : ""}</div>`).join("")
        || '<p class="muted" style="margin:4px 0">Solo usas el número principal. Agrega otra línea si tienes más números en la misma cuenta de WhatsApp Business.</p>'}
      ${adm ? `<form id="linef" class="line-f"><input class="in" id="lnm" placeholder="Nombre (ej. Ventas hoteles)" required><input class="in" id="lnum" placeholder="Número (+57…)"><input class="in" id="lid" placeholder="Identificador del número (Phone number ID)" required>
        <select class="in" id="low"><option value="">Responsable: sin asignar</option>${S.team.filter(u => u.active !== false).map(u => `<option>${esc(u.name)}</option>`).join("")}</select><button class="btn">+ Agregar línea</button></form>` : ""}</div></details>
  </section>`;
}
// WhatsApp por código QR: el estado lo escribe el puente (whatsapp-qr/puente.mjs) en waqr/state
function waQrBlock(adm) {
  const pub = (S.ch && S.ch.waqr) || {}, q = S.waqr, alive = q && Date.now() - (q.seenAt || 0) < 3 * 60000;
  if (!adm) return pub.on ? `<p>Conectado por código QR: <b>${esc(pub.phone || "")}</b>.</p>` : `<p class="muted">Pídele a la administradora que conecte WhatsApp.</p>`;
  const warn = `<p class="qr-warn">⚠️ Conexión no oficial: WhatsApp puede bloquear el número. Usa un número que no sea el principal y evita campañas masivas.</p>`;
  if (!alive) return `<div class="qrbox"><b>Conexión por código QR</b><p class="muted">${q ? "El servidor del puente no responde desde hace " + esc(ago(q.seenAt || 0)) + ". Revisa que esté encendido." : "Falta encender el servidor del puente. Sigue la <b>Fase 2B</b> de la guía de instalación (son 3 comandos en Cloud Shell)."}</p>${warn}</div>`;
  const st = q.status;
  if (st === "conectado") return `<div class="qrbox on"><b>Conectado por código QR</b><p><span class="mono">${esc(q.phone || "")}</span>${q.name ? " · " + esc(q.name) : ""}</p>
    <p class="muted">Los mensajes que llegan a ese WhatsApp entran a Conversaciones, y lo que respondes aquí sale desde el celular.</p>${warn}<button class="btn danger sm" data-qr="desvincular">Desvincular</button></div>`;
  if (st === "esperando_qr" && q.qr) return `<div class="qrbox"><b>Escanea este código con el celular del número nuevo</b>
    <div class="qr-row"><img class="qr-img" src="${esc(q.qr)}" alt="Código QR de WhatsApp" width="240" height="240">
    <ol class="steps"><li>En ese celular abre <b>WhatsApp</b>.</li><li>Toca <b>⋮</b> (Android) o <b>Configuración</b> (iPhone) › <b>Dispositivos vinculados</b>.</li><li>Toca <b>Vincular un dispositivo</b> y apunta la cámara a este código.</li></ol></div>
    <p class="muted">El código cambia cada 20 segundos; si vence, aparece uno nuevo solo.</p>${warn}</div>`;
  if (["iniciando", "conectando", "reconectando"].includes(st)) return `<div class="qrbox"><b>Conectando con WhatsApp…</b><p class="muted">Espera unos segundos.</p></div>`;
  return `<div class="qrbox"><b>Conexión por código QR</b><p class="muted">Vincula el WhatsApp de tu número nuevo escaneando un código, igual que WhatsApp Web. No necesitas Facebook.</p>
    ${q.error ? `<p class="qr-err">${esc(q.error)}</p>` : ""}${warn}<button class="btn primary" data-qr="vincular">Mostrar código QR</button></div>`;
}
function viewCanales(el) {
  const ch = S.ch || {}, adm = isAdmin(), pid = firebaseConfig.projectId || "TU-PROYECTO";
  const hook = `https://${REGION}-${pid}.cloudfunctions.net/whatsappWebhook`;
  const embed = `<script src="${location.origin}/widget.js" defer><\/script>`;
  const web = ch.web || {};
  const st = on => `<span class="pill ${on ? "green" : ""}">${on ? "Conectado" : "Sin conectar"}</span>`;
  const card = (k, on, body) => `<section class="chcard" id="ch-${k}"><div class="chcard-h">${chIcon(k, "lg")}<div><b>${CHN[k].label}</b><small>${{
    whatsapp: "Tu número de ventas, con código QR o con la API oficial de Meta", instagram: "Mensajes directos de tu cuenta de Instagram de empresa",
    messenger: "Mensajes de tu página de Facebook", telegram: "Un bot de Telegram con el nombre de tu empresa", web: "Una burbuja de chat en tu página web" }[k]}</small></div>${st(on)}</div>${body}</section>`;
  el.innerHTML = `<div class="page">${crumb("Canales de mensajería")}<div class="page-head"><div><h1>Canales de mensajería</h1><span class="sub">Todo llega a <b>Conversaciones</b> y la asesora virtual puede responder en todos.</span></div></div>
    ${WHATSAPP_ENABLED ? `<h2 class="sec-t">Canal de atención</h2><p class="sec-s">El punto de entrada de las conversaciones de tus clientes.</p>${waApiPanel(ch, adm, hook)}<h2 class="sec-t">Otros canales</h2>` : ""}
    <div class="chgrid">
    ${WHATSAPP_ENABLED ? "" : card("whatsapp", waOn(), `${waQrBlock(adm)}
      <details class="wa-api"><summary>Opción oficial: API de Meta (sin riesgo de bloqueo)</summary>
      <p class="muted">Se conecta con la app de Meta (WhatsApp Cloud API). Sigue la <b>fase 2</b> de la guía de instalación; cuando termines, cambia <code>WHATSAPP_ENABLED</code> a <code>true</code> en <code>firebase-config.js</code>.</p>
      <p class="muted">Webhook para Meta: <code class="sel">${esc(hook)}</code></p>
      <div class="lines"><b class="lines-t">Líneas de WhatsApp</b>
        ${(ch.waLines || []).map((l, i) => `<div class="line-i"><span class="ln-n">${esc(l.name)}</span><span class="mono muted">${esc(l.number || "")}</span><span class="muted">${l.owner ? "→ " + esc(l.owner) : "sin responsable fijo"}</span>${adm ? `<button class="link" data-rmline="${i}">Quitar</button>` : ""}</div>`).join("")
          || '<p class="muted" style="margin:4px 0">Una sola línea (la de WA_PHONE_ID). Agrega más si tienes varios números en la misma cuenta de WhatsApp Business.</p>'}
        ${adm ? `<form id="linef" class="line-f"><input class="in" id="lnm" placeholder="Nombre (ej. Ventas hoteles)" required><input class="in" id="lnum" placeholder="Número (+57…)"><input class="in" id="lid" placeholder="Identificador del número (Phone number ID)" required>
          <select class="in" id="low"><option value="">Responsable: sin asignar</option>${S.team.filter(u => u.active !== false).map(u => `<option>${esc(u.name)}</option>`).join("")}</select><button class="btn">+ Agregar línea</button></form>` : ""}</div></details>`)}
    ${card("web", !!web.on, adm ? `<form id="webf" class="chform">
      <label class="switch"><input type="checkbox" id="won" ${web.on ? "checked" : ""}> <span>Mostrar el chat en mi página web</span></label>
      <div class="grid2"><div><label class="lb" for="wt">Título</label><input class="in" id="wt" value="${esc(web.title || EMPRESA)}"></div>
        <div><label class="lb" for="wc">Color</label><input class="in" id="wc" type="color" value="${esc(web.color || "#0f7a4c")}"></div>
        <div class="full"><label class="lb" for="wg">Saludo</label><input class="in" id="wg" value="${esc(web.greeting || "¡Hola! 👋 ¿En qué te podemos ayudar?")}"></div></div>
      <label class="switch sm"><input type="checkbox" id="wa" ${web.askName !== false ? "checked" : ""}> <span>Pedir nombre y celular antes de chatear</span></label>
      <div class="chrow"><button class="btn primary">Guardar</button><a class="btn" href="widget-demo.html" target="_blank" rel="noopener">Probar el chat</a></div></form>
      <label class="lb" style="margin-top:12px">Pega esto en tu página web, antes de &lt;/body&gt;</label><div class="codebox"><code id="embed">${esc(embed)}</code><button class="btn sm" id="cpEmbed">Copiar</button></div>`
      : `<p class="muted">Solo la administradora puede configurarlo.</p>`)}
    ${card("telegram", !!(ch.telegram && ch.telegram.on), ch.telegram && ch.telegram.on
      ? `<p>Conectado como <a href="https://t.me/${esc(ch.telegram.username)}" target="_blank" rel="noopener">@${esc(ch.telegram.username)}</a>. Comparte ese enlace con tus clientes.</p>${adm ? '<button class="btn danger" data-off="telegram">Desconectar</button>' : ""}`
      : adm ? `<ol class="steps"><li>En Telegram, abre <b>@BotFather</b> y escribe <code>/newbot</code>.</li><li>Ponle el nombre <b>${esc(EMPRESA)}</b> y un usuario que termine en <code>bot</code> (por ejemplo <code>casadorada_bot</code>).</li><li>Copia el <b>token</b> que te da y pégalo aquí:</li></ol>
        <form id="tgf" class="chrow"><input class="in" id="tgt" placeholder="123456789:ABCdef…" autocomplete="off"><button class="btn primary">Conectar</button></form>` : `<p class="muted">Pídele a la administradora que lo conecte.</p>`)}
    ${card("messenger", !!(ch.messenger && ch.messenger.on), ch.messenger && ch.messenger.on
      ? `<p>Conectado a la página <b>${esc(ch.messenger.pageName || "")}</b>.</p>${adm ? '<button class="btn danger" data-off="messenger">Desconectar Messenger e Instagram</button>' : ""}`
      : adm ? metaSteps(hook) : `<p class="muted">Pídele a la administradora que lo conecte.</p>`)}
    ${card("instagram", !!(ch.instagram && ch.instagram.on), ch.instagram && ch.instagram.on ? `<p>Conectado junto con Messenger.</p>`
      : `<p class="muted">Se conecta junto con Messenger, con el mismo token de la página. Tu cuenta de Instagram debe ser <b>profesional</b> y estar vinculada a la página de Facebook, y en Instagram activa <b>Configuración › Mensajes › Permitir acceso a los mensajes</b>.</p>`)}
    </div></div>`;
  if (S.chAnchor && $("#" + S.chAnchor)) { const t = $("#" + S.chAnchor); S.chAnchor = null; t.scrollIntoView({ block: "start" }); t.classList.add("flash"); }
  if ($("#waDest")) $("#waDest").onchange = async e => { try { await fb.set("settings/channels", { waPipeline: e.target.value }); toast("Los chats nuevos de WhatsApp entrarán a " + e.target.selectedOptions[0].text); } catch (er) { toast("No se pudo guardar: " + errMsg(er)); } };
  if ($("#waCheck")) $("#waCheck").onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = "Comprobando…";
    try { const r = await fb.call("waStatus", {}); toast(r.meta === "ok" ? "Conexión con Meta confirmada" : "Meta reportó un problema: revisa los detalles"); }
    catch (er) { toast("No se pudo comprobar: " + errMsg(er)); } finally { b.disabled = false; b.textContent = "Comprobar acceso a Meta"; } };
  $$("[data-qr]", el).forEach(b => b.onclick = async () => {
    if (b.dataset.qr === "desvincular" && !await ask("¿Desvincular WhatsApp? Los mensajes dejarán de entrar a House Chat hasta que vuelvas a escanear el código.", "Desvincular")) return;
    b.disabled = true;
    try { await fb.set("waqr/cmd", { action: b.dataset.qr, at: Date.now(), by: S.me.name || "" }); toast(b.dataset.qr === "vincular" ? "Generando el código QR…" : "Listo"); }
    catch (er) { b.disabled = false; toast("No se pudo: " + errMsg(er)); }
  });
  if ($("#linef")) $("#linef").onsubmit = async e => {
    e.preventDefault();
    const line = { id: $("#lid").value.replace(/\D/g, ""), name: $("#lnm").value.trim(), number: $("#lnum").value.trim(), owner: $("#low").value };
    if (!line.id || !line.name) return toast("Escribe el nombre y el identificador del número.");
    if ((ch.waLines || []).some(l => l.id === line.id)) return toast("Esa línea ya está agregada.");
    await fb.set("settings/channels", { waLines: [...(ch.waLines || []), line] }); toast("Línea agregada");
  };
  $$("[data-rmline]", el).forEach(b => b.onclick = async () => { if (!await ask("¿Quitar esta línea? Los chats existentes se quedan.", "Quitar")) return;
    await fb.set("settings/channels", { waLines: (ch.waLines || []).filter((_, i) => i !== +b.dataset.rmline) }); });
  if ($("#cpEmbed")) $("#cpEmbed").onclick = () => copy(embed.replace("<\\/", "</"));
  if ($("#webf")) $("#webf").onsubmit = async e => {
    e.preventDefault();
    try {
      await fb.set("settings/channels", { web: { on: $("#won").checked, title: $("#wt").value.trim() || EMPRESA, greeting: $("#wg").value.trim(), color: $("#wc").value, askName: $("#wa").checked, at: Date.now() } });
      toast($("#won").checked ? "Chat web activo" : "Chat web apagado");
    } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
  if ($("#tgf")) $("#tgf").onsubmit = async e => {
    e.preventDefault(); const b = $("#tgf button"); b.disabled = true; b.textContent = "Conectando…";
    try { const r = await fb.call("connectTelegram", { token: $("#tgt").value.trim() }); toast("Telegram conectado: @" + r.username); }
    catch (er) { toast(errMsg(er)); b.disabled = false; b.textContent = "Conectar"; }
  };
  if ($("#mf")) $("#mf").onsubmit = async e => {
    e.preventDefault(); const b = $("#mf button"); b.disabled = true; b.textContent = "Conectando…";
    try { const r = await fb.call("connectMeta", { pageToken: $("#mpt").value.trim(), igId: $("#mig").value.trim() }); toast(`Conectado a ${r.pageName}${r.instagram ? " e Instagram" : ""}`); }
    catch (er) { toast(errMsg(er)); b.disabled = false; b.textContent = "Conectar"; }
  };
  $$("[data-off]", el).forEach(b => b.onclick = async () => {
    if (!await ask(`¿Desconectar ${CHN[b.dataset.off].label}? Dejarán de llegar mensajes por ese canal.`, "Desconectar")) return;
    try { await fb.call("disconnectChannel", { channel: b.dataset.off }); toast("Desconectado"); } catch (er) { toast(errMsg(er)); }
  });
}
function metaSteps(hook) {
  return `<ol class="steps"><li>En <b>developers.facebook.com</b>, en tu app de Meta (la misma de WhatsApp), agrega los productos <b>Messenger</b> e <b>Instagram</b>.</li>
    <li>En cada uno, configura el webhook con esta URL y tu palabra de verificación (WA_VERIFY_TOKEN), y suscribe el campo <b>messages</b> (y <b>feed</b> en Página y <b>comments</b> en Instagram para <a href="#captacion">responder comentarios</a>):<br><code class="sel">${esc(hook)}</code></li>
    <li>Genera un <b>token de acceso de la página</b> (permisos <code>pages_messaging</code> e <code>instagram_manage_messages</code>; para comentarios también <code>pages_manage_engagement</code>, <code>pages_read_user_content</code> e <code>instagram_manage_comments</code>) y pégalo aquí:</li></ol>
    <form id="mf" class="chform"><input class="in" id="mpt" placeholder="Token de acceso de la página (EAAG…)" autocomplete="off">
    <input class="in" id="mig" placeholder="ID de Instagram (opcional, se detecta solo)" autocomplete="off"><div class="chrow"><button class="btn primary">Conectar</button></div></form>`;
}

function openKb(id) {
  const k = id ? byId(S.knowledge, id) : { title: "", content: "", on: true }, adm = isAdmin(), m = $("#modal");
  m.innerHTML = `<form id="kf"><div class="mh"><h2>${id ? "Artículo" : "Nuevo artículo"}</h2><button class="iconbtn" type="button" id="kx" aria-label="Cerrar">✕</button></div>
    <div class="mb"><div><label class="lb" for="kt">Título</label><input class="in" id="kt" required value="${esc(k.title || "")}" placeholder="Ej: Envíos y tiempos de entrega" ${adm ? "" : "disabled"}></div>
      <div><label class="lb" for="kc">Contenido</label><textarea class="in" id="kc" rows="14" placeholder="Escribe como si le explicaras a una asesora nueva…" ${adm ? "" : "disabled"}>${esc(k.content || "")}</textarea>
        <small class="muted" id="kn"></small></div>
      ${adm ? `<div class="chrow"><label class="btn sm" for="kfile">Cargar desde archivo .txt o .md</label><input type="file" id="kfile" accept=".txt,.md,text/plain" hidden>
        <label class="switch sm"><input type="checkbox" id="kon" ${k.on !== false ? "checked" : ""}> <span>La asesora lo usa</span></label></div>` : ""}</div>
    <div class="mf">${id && adm ? '<button class="btn danger" type="button" id="kdel">Eliminar</button><span class="spacer"></span>' : ""}<button class="btn" type="button" id="kc2">Cerrar</button>${adm ? '<button class="btn primary">Guardar</button>' : ""}</div></form>`;
  const count = () => { $("#kn").textContent = $("#kc").value.length.toLocaleString("es-CO") + " caracteres"; };
  count(); $("#kc").oninput = count;
  $("#kx").onclick = $("#kc2").onclick = () => m.close();
  if ($("#kfile")) $("#kfile").onchange = async e => { const f = e.target.files[0]; if (!f) return; if (f.size > 300000) return toast("El archivo es muy grande (máximo 300 KB)."); $("#kc").value = await f.text(); if (!$("#kt").value) $("#kt").value = f.name.replace(/\.[^.]+$/, ""); count(); };
  if ($("#kdel")) $("#kdel").onclick = async () => { if (!await ask("¿Eliminar este artículo?", "Eliminar")) return; await fb.remove("knowledge/" + id); m.close(); };
  $("#kf").onsubmit = async e => {
    e.preventDefault(); if (!adm) return;
    const data = { title: $("#kt").value.trim(), content: $("#kc").value.trim().slice(0, 60000), on: $("#kon").checked, ...stamp() };
    if (!data.title || !data.content) return toast("Escribe el título y el contenido.");
    try { if (id) await fb.update("knowledge/" + id, data); else await fb.set("knowledge/" + fb.newId("knowledge"), { ...data, createdAt: Date.now() }, false); m.close(); toast("Guardado"); }
    catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
}
function viewAsesora(el) {
  const a = S.ai || {}, adm = isAdmin(), dis = adm ? "" : "disabled";
  const TABS = [["agente", "Agente"], ["politicas", "Políticas de la tienda"], ["sedes", "Sedes"], ["empresa", "Datos de la empresa"], ["comprobantes", "Comprobantes de pago"], ["voz", "Voz de la tienda"]];
  const SECS = [["agente", "Tu agente"], ["atencion", "Atención y seguimiento"], ["pagos", "Pagos"], ["entrega", "Entrega"], ["descuentos", "Descuentos y margen"], ["permisos", "Permisos de contacto"], ["prueba", "Números de prueba"]];
  const tab = S.cfgTab || "agente", sec = S.cfgSec || "agente";
  const save = (patch, msg = "Guardado") => fb.set("settings/asesora", { ...patch, empresa: EMPRESA, ...stamp() }).then(() => toast(msg)).catch(er => toast("No se pudo guardar: " + errMsg(er)));
  const card = (t, sub, body, btn = true) => `<form class="card cfg-card" id="cfgf"><h2>${t}</h2><p class="muted cfg-sub">${sub}</p>${body}${adm && btn ? '<div class="chrow" style="margin-top:16px"><button class="btn primary">Guardar</button></div>' : ""}${adm ? "" : '<p class="muted">Solo la administradora puede cambiar esta configuración.</p>'}</form>`;
  const field = (id, label, help, input, top) => `<div class="cfg-f"><label class="lb" for="${id}">${label}</label>${help && top ? `<small class="muted">${help}</small>` : ""}${input}${help && !top ? `<small class="muted">${help}</small>` : ""}</div>`;
  const waiting = S.contacts.filter(c => c.aiHandoff).sort((x, y) => y.aiHandoff.at - x.aiHandoff.at);
  let body = "", onSave = null;
  if (tab === "agente") {
    let panel = "";
    if (sec === "agente") {
      panel = card("Tu agente", "Define cómo se presenta y cómo atiende a tus clientes.",
        `<label class="switch" style="margin-bottom:14px"><input type="checkbox" id="aen" ${a.enabled ? "checked" : ""} ${dis}> <span>Responder automáticamente los mensajes de todos los canales, las 24 horas</span></label>
        ${field("anm", "Nombre del agente", "Cómo se presenta en WhatsApp.", `<input class="in" id="anm" value="${esc(a.name || "Sofía")}" ${dis}>`)}
        ${field("aton", "Tono", "", `<input class="in" id="aton" value="${esc(a.tone || "cercano, amigable")}" placeholder="cercano, amigable" ${dis}>`)}
        ${field("ain", "Instrucciones para atender", "Lo que el agente tiene que saber de tu negocio para atender como lo harías tú. Lo lee completo en cada conversación. Escribe un tema por párrafo, con una línea en blanco entre uno y otro.",
          `<textarea class="in cfg-big" id="ain" rows="14" ${dis} placeholder="Cómo se vende en Casa Dorada: primero entiendo qué necesita la persona…">${esc(a.instructions || "")}</textarea>`, true)}
        ${field("amd", "Modelo de IA", "", `<select class="in" id="amd" ${dis}>${[["haiku", "Haiku 5.5 · rápido y económico (recomendado)"], ["sonnet", "Sonnet 5.5 · más inteligente"], ["opus", "Opus 5.5 · el más inteligente"]].map(([k, l]) => `<option value="${k}" ${(a.model || "haiku") === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)}`);
      onSave = () => save({ enabled: $("#aen").checked, name: $("#anm").value.trim() || "Sofía", tone: $("#aton").value.trim(), instructions: $("#ain").value.trim(), model: $("#amd").value });
    } else if (sec === "atencion") {
      panel = card("Atención y seguimiento", "Cuándo responde el agente, cuándo se aparta y qué hace solo.",
        `${field("aph", "Se pausa en un chat cuando una persona del equipo escribe, durante (horas)", "", `<input class="in tabnum" id="aph" type="number" min="1" max="168" value="${a.pauseHours || 12}" ${dis} style="max-width:140px">`)}
        <label class="switch"><input type="checkbox" id="aqa" ${a.quoteAuto !== false ? "checked" : ""} ${dis}> <span>Cuando el cliente pida cotización, enviársela de una vez en PDF por el chat</span></label>
        <label class="switch"><input type="checkbox" id="aan" ${a.autoAnalisis !== false ? "checked" : ""} ${dis}> <span>Copiloto: analizar solas las conversaciones (probabilidad de compra, siguiente paso, lo que piden y no hay)</span></label>
        <div class="card soft" style="margin-top:12px"><b>Qué pasa a una persona</b><p class="muted" style="margin:4px 0 0">Solo el cierre de la venta (confirmar el pedido, datos de envío y pago) o si el cliente pide hablar con una persona. Todo lo demás lo resuelve el agente.</p></div>
        <h3 style="margin:18px 0 8px">Esperando a una persona <span class="pill">${waiting.length}</span></h3>
        ${waiting.length ? `<div class="table-wrap"><table class="t"><tbody>${waiting.map(c => `<tr data-c="${c.id}"><td><b>${esc(contactName(c))}</b></td><td>${esc(c.aiHandoff.reason || "")}</td><td class="muted">${esc(c.aiHandoff.summary || "")}</td><td>${ago(c.aiHandoff.at)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Nadie esperando.</p>'}`);
      onSave = () => save({ pauseHours: Math.min(168, Math.max(1, Number($("#aph").value) || 12)), quoteAuto: $("#aqa").checked, autoAnalisis: $("#aan").checked });
    } else if (sec === "pagos") {
      panel = card("Pagos", "Cómo te pagan los clientes. El agente lo dice tal cual cuando preguntan cómo pagar, y cuando le mandan un comprobante te avisa para que lo verifiques.",
        field("apay", "Formas de pago", "Cuentas, Nequi, Daviplata, contra entrega, anticipo para pedidos por mayor…", `<textarea class="in cfg-big" id="apay" rows="8" ${dis} placeholder="Transferencia Bancolombia cuenta de ahorros 000-000000-00 a nombre de Casa Dorada S.A.S.&#10;Nequi 300 000 0000&#10;Contra entrega en Medellín y área metropolitana&#10;Pedidos por mayor: 50% de anticipo y 50% antes del despacho">${esc(a.payments || "")}</textarea>`));
      onSave = () => save({ payments: $("#apay").value.trim() });
    } else if (sec === "entrega") {
      panel = card("Entrega", "Envíos, cobertura, tiempos y costos. El agente lo usa para responder, sin prometer fechas exactas.",
        field("adel", "Entrega y envíos", "", `<textarea class="in cfg-big" id="adel" rows="8" ${dis} placeholder="Envíos a todo Colombia con Servientrega e Interrapidísimo.&#10;Medellín: 1 a 2 días hábiles. Otras ciudades: 2 a 5 días hábiles.&#10;Envío gratis desde $200.000.">${esc(a.delivery || "")}</textarea>`));
      onSave = () => save({ delivery: $("#adel").value.trim() });
    } else if (sec === "descuentos") {
      panel = card("Descuentos y margen", "Cuánto puede negociar el agente y el margen de tus ventas (para saber si la pauta da plata).",
        `${field("amax", "Descuento máximo que el agente puede dar al negociar (%)", "0 = solo ofrece las promociones vigentes y el precio por mayor. Si pones, por ejemplo, 5, puede dar hasta 5% extra una vez para cerrar la venta.", `<input class="in tabnum" id="amax" type="number" min="0" max="30" value="${Number(a.maxDiscount) || 0}" ${dis} style="max-width:140px">`)}
        ${field("amar", "Margen de tus ventas (%)", "Lo que te queda de cada venta después del costo del producto. Se usa en Anuncios para decir si la pauta gana o pierde plata.", `<input class="in tabnum" id="amar" type="number" min="1" max="95" value="${Number((S.ads || {}).margin) || 25}" ${dis} style="max-width:140px">`)}
        <p class="muted">Las promociones y los códigos se manejan en <a href="#promociones">Promociones</a>; los precios por volumen en <a href="#listas">Precios mayoristas</a>.</p>`);
      onSave = async () => { await fb.set("settings/ads", { margin: Math.max(1, Math.min(95, Number($("#amar").value) || 25)) }); return save({ maxDiscount: Math.max(0, Math.min(30, Number($("#amax").value) || 0)) }); };
    } else if (sec === "permisos") {
      const out = S.contacts.filter(c => c.optOut);
      panel = card("Permisos de contacto", "A quién se le puede escribir con difusiones y recordatorios automáticos.",
        `<ul class="cfg-list"><li>Si un cliente escribe <b>SALIR</b>, <b>STOP</b>, "no me escriban más" o "darme de baja", queda marcado y no le llegan más difusiones ni recordatorios. En su ficha aparece el aviso.</li>
          <li>Las difusiones salen goteadas (un mensaje cada 45 a 90 segundos, de 8 a. m. a 8 p. m.) y nadie recibe dos plantillas de difusión en menos de 3 días.</li>
          <li>Los recordatorios de carritos solo van a quien dio permiso, salvo que lo cambies en <a href="#carritos">Carritos</a>.</li></ul>
        <h3 style="margin:16px 0 8px">Pidieron no recibir mensajes <span class="pill">${out.length}</span></h3>
        ${out.length ? `<div class="table-wrap"><table class="t"><tbody>${out.slice(0, 100).map(c => `<tr><td><b>${esc(contactName(c))}</b></td><td class="muted">${c.optOutAt ? fmtDT(c.optOutAt) : ""}</td><td class="num">${adm ? `<button class="link" type="button" data-optin="${c.id}">Volver a permitir</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Nadie por ahora.</p>'}`, false);
    } else if (sec === "prueba") {
      panel = card("Números de prueba", "Mientras haya números aquí, el agente solo responde a esos. Sirve para probar cambios antes de soltarlo con los clientes.",
        field("atn", "Números", "Sepáralos con coma. Déjalo vacío para que atienda a todos.", `<input class="in" id="atn" value="${esc((a.testNumbers || []).join(", "))}" placeholder="300 111 2233, 310 444 5566" ${dis}>`)
        + ((a.testNumbers || []).length ? `<div class="banner warn">Modo de prueba: ${esc(a.name || "Sofía")} solo responde a ${(a.testNumbers || []).length} ${(a.testNumbers || []).length === 1 ? "número" : "números"}.</div>` : ""));
      onSave = () => save({ testNumbers: $("#atn").value.split(/[,;\n]/).map(x => x.replace(/\D/g, "")).filter(x => x.length >= 7) });
    }
    body = `<div class="cfg-layout"><nav class="cfg-side">${SECS.map(([k, t]) => `<button type="button" class="${k === sec ? "on" : ""}" data-sec="${k}">${t}</button>`).join("")}</nav><div>${panel}</div></div>`;
  } else if (tab === "politicas") {
    body = `<div class="card cfg-card"><h2>Políticas de la tienda</h2><p class="muted cfg-sub">Garantías, cambios y devoluciones, cuidados de los productos, preguntas frecuentes… El agente las busca cuando un cliente pregunta. También puedes subir un archivo .txt.</p>
      <div class="kb">${(S.knowledge || []).slice().sort((x, y) => String(x.title).localeCompare(String(y.title))).map(k => `<button class="kb-item ${k.on === false ? "off" : ""}" data-kb="${k.id}"><b>${esc(k.title)}</b><span>${esc(String(k.content || "").slice(0, 140))}${String(k.content || "").length > 140 ? "…" : ""}</span><small class="muted">${String(k.content || "").length.toLocaleString("es-CO")} caracteres${k.on === false ? " · apagado" : ""}</small></button>`).join("")}
        ${adm ? '<button class="kb-item add" id="kbNew"><b>+ Agregar política</b><span>Cambios y devoluciones, garantía, cuidados de las sábanas, medidas…</span></button>' : ""}</div></div>`;
  } else if (tab === "sedes") {
    const sedes = a.sedes || [];
    body = `<form class="card cfg-card" id="cfgf"><h2>Sedes</h2><p class="muted cfg-sub">Tus tiendas, bodegas o puntos de entrega. El agente las da cuando preguntan dónde están o si pueden recoger.</p>
      <div id="sedesL" style="display:grid;gap:10px">${(sedes.length ? sedes : [{}]).map((x, i) => `<div class="card soft sede" data-i="${i}"><div class="grid2">
        <div><label class="lb">Nombre</label><input class="in" data-k="name" value="${esc(x.name || "")}" placeholder="Tienda principal" ${dis}></div><div><label class="lb">Ciudad</label><input class="in" data-k="city" value="${esc(x.city || "")}" placeholder="Medellín" ${dis}></div>
        <div class="full"><label class="lb">Dirección</label><input class="in" data-k="address" value="${esc(x.address || "")}" placeholder="Calle 10 # 40-20, local 105" ${dis}></div>
        <div><label class="lb">Horario</label><input class="in" data-k="hours" value="${esc(x.hours || "")}" placeholder="Lun a sáb 9 a. m. a 6 p. m." ${dis}></div><div><label class="lb">Teléfono</label><input class="in" data-k="phone" value="${esc(x.phone || "")}" ${dis}></div>
        <div class="full"><label class="lb">Enlace de Google Maps (opcional)</label><input class="in" data-k="map" value="${esc(x.map || "")}" placeholder="https://maps.app.goo.gl/…" ${dis}></div></div>
        ${adm ? '<button class="link danger" type="button" data-rmsede>Quitar sede</button>' : ""}</div>`).join("")}</div>
      ${adm ? '<div class="chrow" style="margin-top:12px"><button class="btn" type="button" id="addSede">+ Agregar sede</button><span class="spacer"></span><button class="btn primary">Guardar</button></div>' : ""}</form>`;
    onSave = () => save({ sedes: $$(".sede", el).map(d => Object.fromEntries($$("[data-k]", d).map(i => [i.dataset.k, i.value.trim().slice(0, 200)]))).filter(x => x.name) });
  } else if (tab === "empresa") {
    const d = S.qbrand || {};
    if (!S.qbrandLoaded) { S.qbrandLoaded = true; fb.get("settings/cotizacion").then(x => { S.qbrand = x || {}; if (S.view === "asesora" && S.cfgTab === "empresa") renderShell(); }).catch(() => {}); }
    const f = (k, l, ph = "", full) => `<div class="${full ? "full" : ""}"><label class="lb" for="qb_${k}">${l}</label><input class="in" id="qb_${k}" value="${esc(d[k] || "")}" placeholder="${esc(ph)}" ${dis}></div>`;
    body = `<form class="card cfg-card" id="cfgf"><h2>Datos de la empresa</h2><p class="muted cfg-sub">Salen en el encabezado y el pie de las cotizaciones en PDF, y el agente los usa cuando se los piden.</p>
      <div class="grid2">${f("nombre", "Nombre de la empresa", EMPRESA)}${f("lema", "Lema", "Textiles para el hogar y la hotelería")}${f("nit", "NIT", "901.234.567-8")}${f("telefono", "Teléfono", "+57 300 000 0000")}
        ${f("correo", "Correo", "ventas@casadorada.co")}${f("web", "Sitio web", "casadorada.co")}${f("direccion", "Dirección", "Medellín, Colombia", true)}
        <div class="full"><label class="lb" for="qb_condiciones">Condiciones de las cotizaciones (opcional)</label><textarea class="in" id="qb_condiciones" rows="4" ${dis}>${esc(d.condiciones || "")}</textarea></div></div>
      ${adm ? '<div class="chrow" style="margin-top:16px"><button class="btn primary">Guardar</button></div>' : ""}</form>`;
    onSave = async () => { const data = Object.fromEntries(["nombre", "lema", "nit", "telefono", "correo", "web", "direccion", "condiciones"].map(k => [k, $("#qb_" + k).value.trim().slice(0, k === "condiciones" ? 1500 : 160)]));
      await fb.set("settings/cotizacion", { ...data, ...stamp() }); S.qbrand = data; toast("Guardado: las cotizaciones salen con estos datos"); };
  } else if (tab === "comprobantes") {
    const all = S.contacts.filter(c => c.paymentProof).sort((x, y) => y.paymentProof.at - x.paymentProof.at);
    body = `<div class="card cfg-card"><h2>Comprobantes de pago</h2><p class="muted cfg-sub">Cuando un cliente manda la foto de su pago, el agente lee el valor, el banco y la referencia, le dice que lo verifican y te avisa. Aquí confirmas si la plata entró.</p>
      ${proofsBlock() || '<p class="muted">No hay comprobantes por revisar.</p>'}
      <h3 style="margin:16px 0 8px">Revisados</h3>${all.filter(c => c.paymentProof.status !== "por revisar").length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th class="num">Valor</th><th>Banco</th><th>Estado</th><th>Revisó</th></tr></thead><tbody>${all.filter(c => c.paymentProof.status !== "por revisar").slice(0, 80).map(c => { const p = c.paymentProof; return `<tr data-c="${c.id}"><td><b>${esc(contactName(c))}</b></td><td class="num tabnum">${p.monto ? money(p.monto) : "—"}</td><td>${esc(p.banco || "")}</td><td><span class="pill ${p.status === "confirmado" ? "green" : "red"}">${esc(p.status)}</span></td><td class="muted">${esc(p.reviewedBy || "")} ${p.reviewedAt ? ago(p.reviewedAt) : ""}</td></tr>`; }).join("")}</tbody></table></div>` : '<p class="muted">Todavía no hay comprobantes revisados.</p>'}</div>`;
  } else if (tab === "voz") {
    body = `<div class="card cfg-card"><h2>Voz de la tienda</h2><p class="muted cfg-sub">La voz con la que habla tu agente.</p>${(S.voz || {}).on ? vozBlock(false) : `<p>ElevenLabs todavía no está conectado.</p><a class="btn primary" href="#apps" data-anchor="app-elevenlabs">Conectarlo en Integraciones</a>`}</div>`;
  }
  el.innerHTML = `<div class="page" style="max-width:1150px"><div class="page-head"><h1>Configuración</h1><span class="spacer"></span><span class="pill ${a.enabled ? "green" : ""}">${esc(a.name || "Sofía")}: ${a.enabled ? "activa" : "apagada"}</span></div>
    <div class="cfg-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${k === tab ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</div>
    <p class="muted" style="margin:12px 0 16px">Gestiona tus conexiones en <a href="#integraciones">Integraciones</a>.</p>${body}</div>`;
  $$("[data-tab]", el).forEach(b => b.onclick = () => { S.cfgTab = b.dataset.tab; renderShell(); });
  $$("[data-sec]", el).forEach(b => b.onclick = () => { S.cfgSec = b.dataset.sec; renderShell(); });
  $$("[data-c]", el).forEach(tr => tr.onclick = () => go("conv", tr.dataset.c));
  $$("[data-kb]", el).forEach(b => b.onclick = () => openKb(b.dataset.kb));
  if ($("#kbNew")) $("#kbNew").onclick = () => openKb(null);
  if ($("#cfgf") && onSave) $("#cfgf").onsubmit = async e => { e.preventDefault(); if (adm) { try { await onSave(); } catch (er) { toast(errMsg(er)); } } };
  $$("[data-optin]", el).forEach(b => b.onclick = () => fb.update("contacts/" + b.dataset.optin, { optOut: false, ...stamp() }).then(() => toast("Puede volver a recibir mensajes")));
  if ($("#addSede")) $("#addSede").onclick = () => { const cur = $$(".sede", el).map(d => Object.fromEntries($$("[data-k]", d).map(i => [i.dataset.k, i.value]))); S.ai = { ...a, sedes: [...cur, {}] }; renderShell(); };
  $$("[data-rmsede]", el).forEach(b => b.onclick = () => { const i = +b.closest(".sede").dataset.i, cur = $$(".sede", el).map(d => Object.fromEntries($$("[data-k]", d).map(x => [x.dataset.k, x.value]))); cur.splice(i, 1); S.ai = { ...a, sedes: cur }; renderShell(); });
  bindProofs(el);
  bindVoz(el);
  $$("[data-anchor]", el).forEach(x => x.onclick = () => { S.chAnchor = x.dataset.anchor; });
}

// ======================= Plantillas de mensaje =======================
function tplFor(key) { return S.templates.find(t => t.key === key) || DEFAULT_TEMPLATES.find(t => t.key === key); }
function fillTpl(text, c, extra = {}) {
  const vars = {
    nombre: firstName(c && c.name) || (c && c.company) || "", empresa: EMPRESA, asesor: firstName(S.me && S.me.name),
    producto: c && c.chosenProduct ? c.chosenProduct.name : "", precio: c && c.chosenProduct ? money(c.chosenProduct.price) : "",
    hotel: (c && c.company) || "", ...extra,
  };
  return String(text || "").replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m).replace(/\s+([,?.!])/g, "$1").replace(/ {2,}/g, " ").trim();
}

// ======================= Tareas de "Hoy" =======================
// ---- Reposición: cuándo le toca volver a comprar a cada cliente ----
const FREQ_DAYS = { Mensual: 30, Bimestral: 60, Trimestral: 90, Semestral: 180, Anual: 365 };
const DEFAULT_REORDER = 90;
let _ordIdx = null, _ordRef = null;
function ordersOf(cid) {
  if (_ordRef !== S.orders) { _ordRef = S.orders; _ordIdx = {}; S.orders.forEach(o => { if (o.status !== "Cancelado") (_ordIdx[o.contactId] = _ordIdx[o.contactId] || []).push(o); }); Object.values(_ordIdx).forEach(l => l.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))); }
  return _ordIdx[cid] || [];
}
function reorderInfo(c) {
  if (!c || c.archived || c.noReorder || c.stage === "Perdido") return null;
  const os = ordersOf(c.id), ex = c.extra || {};
  let last = c.lastPurchaseAt || 0, items = "", total = 0;
  ["Fecha última compra", "Fecha último servicio"].forEach(k => { if (isoRe.test(ex[k] || "")) { const t = new Date(ex[k] + "T12:00:00").getTime(); if (t > last) { last = t; items = ex["Productos comprados"] || ex["Servicio contratado"] || ""; total = num(ex["Última compra ($)"] || ex["Último servicio $"] || 0); } } });
  const lo = os[os.length - 1];
  if (lo && (lo.createdAt || 0) >= last) { last = lo.createdAt; items = (lo.items || []).map(i => i.name).join(", "); total = lo.total || 0; }
  if (!last || (c.type !== "Cliente" && !os.length)) return null;
  let days = Number(c.reorderDays) || 0, how = "definido en la ficha";
  if (!days && FREQ_DAYS[ex.Frecuencia]) { days = FREQ_DAYS[ex.Frecuencia]; how = "frecuencia " + ex.Frecuencia.toLowerCase(); }
  if (!days && os.length >= 2) { days = Math.round((os[os.length - 1].createdAt - os[0].createdAt) / (os.length - 1) / DAY); how = "promedio entre sus pedidos"; }
  if (!days || days < 7) { days = DEFAULT_REORDER; how = "valor por defecto"; }
  const due = last + days * DAY;
  return { last, days, how, due, dueIso: new Date(due - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), items, total, inDays: Math.round((due - Date.now()) / DAY) };
}
const safeKey = s => String(s).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
function tasksFor(c) {
  const out = [], now = Date.now(), done = c.done || {}, t = todayIso();
  if (c.archived) return out;
  if (c.aiHandoff && c.aiHandoff.at && !done[safeKey("humano:" + c.aiHandoff.at)])
    out.push({ key: safeKey("humano:" + c.aiHandoff.at), kind: "humano", rank: -1, title: `${aiName()} te pasó este chat: ${c.aiHandoff.reason || "atiéndelo"}`,
      sub: `pasado a una persona hace ${ago(c.aiHandoff.at)}`, hint: c.aiHandoff.summary || "Revisa la conversación y respóndele.", handoff: true });
  if (c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt) && !done[safeKey("responder:" + c.lastInboundAt)])
    out.push({ key: safeKey("responder:" + c.lastInboundAt), kind: "responder", rank: 0, title: "Respóndele", sub: `sin respuesta hace ${ago(c.lastInboundAt)}`,
      hint: c.lastMessage ? `Escribió: “${c.lastMessage}”` : "Te escribió y está esperando respuesta." });
  S.quotes.filter(q => q.contactId === c.id && q.status === "Aceptada").forEach(q => {
    if (!done[safeKey("pedido:" + q.id)]) out.push({ key: safeKey("pedido:" + q.id), kind: "pedido", rank: 1, q, title: `Convierte en pedido la cotización ${q.number} por ${money(q.total)}`,
      sub: `aceptó la cotización ${q.number} por ${money(q.total)}: conviértela en pedido`, hint: "Ya la aceptó: crea el pedido y confírmale la entrega." });
  });
  S.quotes.filter(q => q.contactId === c.id && q.status === "Borrador" && q.aiCreated).forEach(q => {
    if (!done[safeKey("revisar:" + q.id)]) out.push({ key: safeKey("revisar:" + q.id), kind: "cotizacion", rank: 1.5, q, title: `Revisa y envía la cotización ${q.number} por ${money(q.total)}`,
      sub: `la preparó ${aiName()} hace ${ago(q.createdAt)}`, hint: "La armó la asesora virtual con precios del catálogo: revísala, márcala como enviada y confírmasela al cliente." });
  });
  if (c.chosenProduct && !["Ganado", "Perdido"].includes(c.stage) && !done[safeKey("cerrar:" + c.chosenProduct.name)])
    out.push({ key: safeKey("cerrar:" + c.chosenProduct.name), kind: "cerrar", rank: 2, title: "Ciérrale con lo que ya eligió: " + c.chosenProduct.name,
      sub: c.lastInboundAt ? `sin respuesta hace ${ago(c.lastInboundAt)}` : "producto elegido", hint: "Ya lo eligió: no se lo vuelvas a vender desde cero. Confírmale el pedido." });
  S.quotes.filter(q => q.contactId === c.id && q.status === "Enviada" && q.sentAt && now - q.sentAt > 3 * DAY).forEach(q => {
    if (!done[safeKey("cotizacion:" + q.id)]) out.push({ key: safeKey("cotizacion:" + q.id), kind: "cotizacion", rank: 3, q, title: `Pregúntale qué le faltó para decidir la cotización ${q.number}`,
      sub: `recibió la cotización ${q.number} por ${money(q.total)} hace ${ago(q.sentAt)} y no ha respondido`, hint: "Pregúntale qué le falta: precio, medidas, tiempos de entrega o forma de pago." });
  });
  const ri = reorderInfo(c);
  if (ri && ri.inDays <= 7 && !done[safeKey("reponer:" + ri.dueIso)])
    out.push({ key: safeKey("reponer:" + ri.dueIso), kind: "reponer", rank: 3.5, ri, title: `Ofrécele reponer: última compra hace ${ago(ri.last)}`,
      sub: ri.inDays < 0 ? `le tocaba volver a comprar el ${fmtDate(ri.dueIso)}` : `le toca volver a comprar ${ri.inDays === 0 ? "hoy" : "en " + ri.inDays + " d"}`,
      hint: (ri.items ? `Compró: ${ri.items}${ri.total ? " por " + money(ri.total) : ""}. ` : "") + `Compra cada ${ri.days} días (${ri.how}).` });
  if (c.nextDate && c.nextDate <= t && !done[safeKey("seguimiento:" + c.nextDate)])
    out.push({ key: safeKey("seguimiento:" + c.nextDate), kind: "seguimiento", rank: 4, title: c.nextAction || "Seguimiento programado",
      sub: c.nextDate < t ? `seguimiento vencido desde ${fmtDate(c.nextDate)}` : "seguimiento para hoy", hint: c.obs ? `Nota: ${c.obs}` : "Tenías programado contactarlo hoy." });
  return out.sort((a, b) => a.rank - b.rank);
}
function allTasks() {
  const list = [];
  for (const c of S.contacts) { const ts = tasksFor(c); if (ts.length) list.push({ c, task: ts[0], more: ts.length - 1, win: winInfo(c) }); }
  const lvl = c => Number(c.level) || 0;
  list.sort((a, b) => {
    if ((a.task.rank < 0) !== (b.task.rank < 0)) return a.task.rank < 0 ? -1 : 1; // chats que la asesora virtual pasó a una persona
    if (a.win.open !== b.win.open) return a.win.open ? -1 : 1;
    if (a.win.open) return (a.win.closesAt || Infinity) - (b.win.closesAt || Infinity) || (b.c.lastInboundAt || 0) - (a.c.lastInboundAt || 0);
    return a.task.rank - b.task.rank || lvl(b.c) - lvl(a.c) || (b.c.lastInboundAt || 0) - (a.c.lastInboundAt || 0);
  });
  return list;
}
const pendingCount = () => S.contacts.reduce((n, c) => n + (tasksFor(c).length ? 1 : 0), 0);

// ======================= Vista: Hoy =======================
const KIND = {
  humano: { label: "Atender", cls: "k-red" }, responder: { label: "Responder", cls: "k-blue" }, pedido: { label: "Pedido", cls: "k-green" },
  cerrar: { label: "Cerrar", cls: "k-green" }, cotizacion: { label: "Cotización", cls: "k-orange" }, reponer: { label: "Reposición", cls: "k-purple" },
  seguimiento: { label: "Seguimiento", cls: "k-gray" },
};
const shortLeft = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + " min" : Math.round(m / 60) + " h"; };
function viewHoy(el) {
  const items = allTasks(), t0 = new Date(); t0.setHours(0, 0, 0, 0); const since = t0.getTime();
  const convToday = S.contacts.filter(c => (c.lastInboundAt || 0) >= since || (c.lastOutboundAt || 0) >= since).length;
  const answered = S.contacts.filter(c => (c.lastOutboundAt || 0) >= since);
  const mine = answered.filter(c => c.lastOutboundBy === S.me.name).length, team = answered.length - mine;
  const upd = S.syncedAt && Date.now() - S.syncedAt > 9e4 ? "hace " + ago(S.syncedAt) : "hace un momento";
  const ordersToday = S.orders.filter(o => (o.createdAt || 0) >= since && o.status !== "Cancelado");
  const closed = ordersToday.reduce((s, o) => s + (o.total || 0), 0);
  if (!S.sel || !items.some(i => i.c.id === S.sel)) S.sel = items[0] ? items[0].c.id : null;
  const openItems = items.filter(i => i.win.open), closedItems = items.filter(i => !i.win.open);
  const row = i => { const k = KIND[i.task.kind] || KIND.seguimiento, left = i.win.open ? i.win.closesAt - Date.now() : 0;
    return `<button class="hrow ${i.c.id === S.sel ? "on" : ""}" data-sel="${i.c.id}">
      <span class="av-wrap"><span class="avatar c" style="${avColor(contactName(i.c))}">${esc((contactName(i.c) || "?")[0].toUpperCase())}</span>${chIcon(chOf(i.c), "badge")}</span>
      <span class="hr-main">
        <span class="hr-top"><span class="hr-name">${esc(contactName(i.c))}</span>
          <span class="hr-time ${i.win.open && !i.win.nolimit && left < 3 * 3600e3 ? "urgent" : ""}">${i.win.open && !i.win.nolimit ? "cierra en " + shortLeft(left) : i.c.lastInboundAt ? "hace " + ago(i.c.lastInboundAt) : ""}</span></span>
        ${i.c.company && i.c.name ? `<span class="hr-co">${esc(i.c.company)}</span>` : ""}
        <span class="hr-task"><span class="tag ${k.cls}">${k.label}</span><span class="hr-title">${i.task.kind === "responder" && i.c.lastMessage ? "“" + esc(i.c.lastMessage) + "”" : monoNums(esc(i.task.title))}</span>${i.more ? `<span class="hr-more">+${i.more}</span>` : ""}</span>
      </span></button>`; };
  const fmtDay = t0.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  el.innerHTML = `<div class="hoy">
    <header class="hoy-head">
      <div><h1>Hoy</h1><p>${fmtDay.charAt(0).toUpperCase() + fmtDay.slice(1)} · actualizado ${upd}</p></div>
      <div class="stats">
        <div class="stat"><span>Conversaciones hoy</span><b>${convToday}</b></div>
        <div class="stat"><span>Respondidas por ti</span><b>${mine}</b></div>
        <div class="stat"><span>Por tu equipo</span><b>${team}</b></div>
        <div class="stat money"><span>Vendido hoy</span><b>${money(closed)}</b><small>${ordersToday.length} ${ordersToday.length === 1 ? "venta" : "ventas"}</small></div>
      </div></header>
    ${hotStrip()}
    <div class="today ${S.sel && innerWidth <= 860 && S.hoyOpen ? "has-sel" : ""}">
      <div class="today-list">
        <div class="hl-head"><b>Pendientes</b><span class="hl-count">${items.length}</span><span class="spacer"></span>
          <details class="how"><summary title="Cómo se ordena">?</summary><div class="how-pop">
            <b>Cómo se ordena</b><ol>
            <li>Primero los chats con la ventana de WhatsApp abierta; arriba el que cierra más pronto.</li>
            <li>Luego los que tienen la ventana cerrada (solo plantilla aprobada).</li>
            <li>En cada uno, la acción más importante: responder, convertir una cotización, cerrar, seguir una cotización, reponer o el seguimiento programado.</li></ol></div></details></div>
        ${openItems.length ? `<div class="hl-group"><span class="dot live"></span>Ventana abierta<span class="n">${openItems.length}</span></div>` : ""}
        ${openItems.map(row).join("")}
        ${closedItems.length ? `<div class="hl-group">${icon("lock")}Sin ventana · solo plantilla<span class="n">${closedItems.length}</span></div>` : ""}
        ${closedItems.map(row).join("")}
        ${!items.length ? `<div class="empty"><p><b>Todo al día.</b></p><p>Aquí aparecen los clientes que te escriben, las cotizaciones por cerrar y los seguimientos programados.</p></div>` : ""}
      </div>
      <div class="detail" id="detail"></div>
    </div></div>`;
  $$("[data-sel]", el).forEach(b => b.onclick = () => { S.sel = b.dataset.sel; S.hoyOpen = true; renderShell(); });
  $$("[data-hot]", el).forEach(b => b.onclick = () => go("conv", b.dataset.hot));
  const it = items.find(i => i.c.id === S.sel);
  renderHoyDetail($("#detail"), it);
}
function watchHoyMsgs(cid) {
  if (S.hoyMsgsFor === cid) return;
  S.hoyMsgsUnsub && S.hoyMsgsUnsub(); S.hoyMsgs = []; S.hoyMsgsFor = cid;
  if (!cid) return;
  S.hoyMsgsUnsub = fb.watch(`contacts/${cid}/messages`, list => { S.hoyMsgs = list.reverse(); if (S.view === "hoy") scheduleRender(); }, { orderBy: ["ts", "desc"], limit: 4 });
}
function renderHoyDetail(el, it) {
  if (!it) { el.innerHTML = ""; watchHoyMsgs(null); return; }
  const { c, task, win } = it;
  watchHoyMsgs(c.id);
  const tpl = tplFor(task.kind) || tplFor("seguimiento");
  const msg = fillTpl(tpl.text, c, task.q ? { cotizacion: task.q.number, total: money(task.q.total) }
    : task.ri ? { ultimo: task.ri.items || "tu último pedido", dias: String(Math.round((Date.now() - task.ri.last) / DAY)) } : {});
  const winTxt = win.nolimit ? `${CHN[chOf(c)].label} · sin límite de 24 h` : win.open ? `Ventana abierta · cierra ${whenLabel(win.closesAt)}` : win.never ? "Aún no te escribe por WhatsApp · primer mensaje con plantilla"
    : `Ventana cerrada hace ${ago(win.closesAt)} · solo plantilla`;
  const k = KIND[task.kind] || KIND.seguimiento;
  const since = c.sourceSheet ? (c.type === "Cliente" ? "Cliente" : "Prospecto") + " del Excel" : (c.type === "Cliente" ? "Cliente" : "Contacto") + " desde " + fmtDMY(c.createdAt || Date.now());
  el.innerHTML = `<button class="btn sm back" id="back">← Volver</button>
    <div class="hd-head">
      <span class="avatar c lg" style="${avColor(contactName(c))}">${esc((contactName(c) || "?")[0].toUpperCase())}</span>
      <div class="hd-id"><h2>${esc(contactName(c))} ${chIcon(chOf(c), "h")}</h2>
        <div class="hd-meta"><span class="mono">${esc(phoneId(c.phone) || c.phone || "sin teléfono")}</span>${c.company && c.name ? `<span>${esc(c.company)}</span>` : ""}<span>${esc(since)}</span>${c.stage ? `<span class="tag k-stage">${esc(c.stage)}</span>` : ""}</div></div>
      <div class="hd-actions"><button class="btn" id="openContact">Ver ficha</button><button class="btn primary" id="openConv">${icon("conv")}Abrir conversación</button></div>
    </div>
    ${aiInsight(c, true)}
    <div class="hd-fields">
      <div class="field"><span class="fl">Qué busca</span><div class="fv inline-edit ${c.looking ? "" : "empty-v"}" id="looking" title="Clic para editar">${esc(c.looking || "Sin registrar · clic para escribir")}</div></div>
      <div class="field"><span class="fl">Producto elegido</span><div class="fv">${c.chosenProduct ? `${esc(c.chosenProduct.name)} <b class="mono">${money(c.chosenProduct.price)}</b>` : '<span class="empty-v">Ninguno todavía</span>'}
        <button class="link" id="chooseProd">${c.chosenProduct ? "Cambiar" : "Elegir"}</button></div></div>
    </div>
    <section class="next">
      <div class="next-head"><span class="fl">Siguiente paso</span><span class="win ${win.open ? "open" : "closed"}">${win.open ? '<span class="dot live"></span>' : icon("lock")}${esc(winTxt)}</span></div>
      <div class="next-task"><span class="tag ${k.cls}">${k.label}</span><div><b>${monoNums(esc(task.title))}</b><p>${esc(task.hint)}</p></div></div>
      <div class="sugg"><span class="fl">Mensaje sugerido · ${esc(tpl.name)}</span>
        <div class="sugg-chat"><div class="bubble out tail"><span class="btx" id="sugg">${esc(msg)}</span></div></div></div>
      <div class="next-actions">
        ${canSend(c) && win.open ? `<button class="btn primary" id="sendMsg">${icon("send")}Enviar por ${CHN[chOf(c)].label}</button>` : ""}
        ${!canSend(c) && chOf(c) === "whatsapp" && waLink(c.phone) ? `<a class="btn wa" href="${waLink(c.phone, msg)}" target="_blank" rel="noopener" id="waOpen">${icon("send")}Abrir en WhatsApp</a>` : ""}
        <button class="btn" id="copyMsg">Copiar</button>
        ${task.kind === "pedido" ? `<button class="btn primary" id="toOrder">Crear pedido</button>` : ""}
        ${task.handoff ? `<button class="btn" id="aiBack">Devolver a ${esc(aiName())}</button>` : ""}
        ${task.q ? `<button class="btn" id="openQuote">Ver ${esc(task.q.number)}</button>` : ""}
        <span class="spacer"></span>
        <button class="btn quiet" id="snooze">Recordar en…</button><button class="btn ok" id="doneTask">✓ Ya terminó</button>
      </div>
    </section>
    <section class="last"><span class="fl">Lo último de la conversación</span>
      <div class="lastmsgs">${S.hoyMsgsFor === c.id && S.hoyMsgs.length ? chatHtml(S.hoyMsgs) : '<div class="daychip">Sin mensajes registrados</div>'}</div></section>`;
  $("#back").onclick = () => { S.hoyOpen = false; renderShell(); };
  $("#openConv").onclick = () => go("conv", c.id);
  $("#openContact").onclick = () => openContact(c.id);
  bindInsight(c);
  $("#copyMsg").onclick = () => copy(msg);
  if ($("#waOpen")) $("#waOpen").onclick = () => logOutbound(c, msg, "Abierto en WhatsApp");
  if ($("#sendMsg")) $("#sendMsg").onclick = () => sendText(c, msg);
  if ($("#toOrder")) $("#toOrder").onclick = () => quoteToOrder(task.q);
  if ($("#aiBack")) $("#aiBack").onclick = () => setAi(c, true);
  if ($("#openQuote")) $("#openQuote").onclick = () => openQuote(task.q.id);
  $("#chooseProd").onclick = () => chooseProduct(c);
  $("#looking").onclick = () => editLooking(c);
  $("#doneTask").onclick = async () => { await fb.update("contacts/" + c.id, { ["done." + task.key]: Date.now(), ...stamp() }); toast("Listo"); };
  $("#snooze").onclick = () => snooze(c);
}
// Burbujas estilo WhatsApp: hora y palomitas dentro, cola en el primer mensaje de cada racha
const TICK1 = '<svg viewBox="0 0 16 11" class="tk"><path d="M1 5.5l3.5 3.5L11 2.5"/></svg>';
const TICK2 = '<svg viewBox="0 0 18 11" class="tk"><path d="M1 5.5l3.5 3.5L11 2.5M7.5 8.5l.6.6L14.6 2.5"/></svg>';
function ticks(st) { return st === "read" ? `<span class="tks read" title="Leído">${TICK2}</span>` : st === "delivered" ? `<span class="tks" title="Entregado">${TICK2}</span>` : st === "failed" ? "" : `<span class="tks" title="Enviado">${TICK1}</span>`; }
// Archivo que mandó el cliente (lo guarda la función guardarMedia en un bucket privado): foto, audio con reproductor,
// video o documento. El HTML lleva data-mpath y hydrateMedia lo descarga con la sesión de la persona.
function mediaHtml(m) {
  const md = m.media;
  if (!md) return "";
  const p = m.mediaPath && /^media\//.test(m.mediaPath) ? esc(m.mediaPath) : "";
  if (!p) return `<span class="bmedia-wait">${m.mediaError ? "⚠ No se pudo cargar el archivo" : md.kind === "audio" ? "🎤 Cargando audio…" : md.kind === "image" ? "🖼 Cargando foto…" : "📎 Cargando archivo…"}</span>`;
  const mime = m.mediaMime || "";
  if (md.kind === "image" || /^image\//.test(mime)) return `<a class="bimg" data-mpath="${p}" target="_blank" rel="noopener"><img data-mpath="${p}" alt="Foto del cliente"></a>`;
  if (md.kind === "audio") return `<div class="baudio"><audio controls preload="metadata" data-mpath="${p}"></audio><a data-mpath="${p}" download="audio.${esc((p.split(".").pop()))}">Descargar audio</a>${m.transcript
    ? `<div class="btrans"><b>📝 Transcripción</b>${esc(m.transcript)}</div>` : m.transcriptError ? `<div class="btrans off">No se pudo transcribir este audio.</div>` : `<div class="btrans off">📝 Transcribiendo…</div>`}</div>`;
  if (md.kind === "video") return `<video class="bvideo" controls preload="metadata" data-mpath="${p}"></video>`;
  return `<a class="bdoc" data-mpath="${p}" target="_blank" rel="noopener" download="${esc(md.filename || "documento")}">📄 ${esc(md.filename || "Abrir documento")}</a>`;
}
const MEDIA_CACHE = new Map(); // ruta → URL local (blob) ya descargada
async function mediaBlobUrl(path) {
  if (!MEDIA_CACHE.has(path)) MEDIA_CACHE.set(path, (async () => {
    const r = await fetch("/api/media?p=" + encodeURIComponent(path), { headers: { Authorization: "Bearer " + await fb.idToken() } });
    if (!r.ok) throw new Error("media " + r.status);
    return URL.createObjectURL(await r.blob());
  })().catch(e => { MEDIA_CACHE.delete(path); throw e; }));
  return MEDIA_CACHE.get(path);
}
function hydrateMedia(root) {
  $$("[data-mpath]", root).forEach(async el => {
    try { const u = await mediaBlobUrl(el.dataset.mpath); if (el.tagName === "A") el.href = u; else el.src = u; }
    catch { if (el.tagName === "IMG") el.alt = "No se pudo cargar la foto"; }
  });
}
// Formato de WhatsApp en las burbujas: *negrita*, _cursiva_, ~tachado~ (sobre texto ya escapado)
const WA_MARK = /(^|[\s(¡¿"'])([*_~])([^\s*_~](?:[^*_~\n]*[^\s*_~])?)\2(?=$|[\s).,!?:;"'])/g;
const fmtWa = t => esc(t).replace(WA_MARK, (m, pre, k, x) => `${pre}<${{ "*": "b", "_": "i", "~": "s" }[k]}>${x}</${{ "*": "b", "_": "i", "~": "s" }[k]}>`);
const stripWa = t => String(t || "").replace(WA_MARK, "$1$3");
function bubble(m, tail = true, withDate = true) {
  const t = `<span class="bt">${m.ts ? (withDate ? fmtDT(m.ts) : fmtTime(m.ts)) : ""}${m.dir === "out" ? ticks(m.status) : ""}</span>`;
  if (m.dir === "note") return `<div class="bubble note"><small class="bw">Nota interna${m.byName ? " · " + esc(m.byName) : ""}</small><span class="btx">${esc(m.text)}</span>${t}</div>`;
  const out = m.dir === "out";
  const who = out ? `<small class="bw${m.ai || isAiName(m.byName) ? " ai" : ""}">${esc(m.byName || "Equipo")}</small>` : "";
  const pic = m.document && /^https:\/\//.test(m.document.url) ? `<a class="bdoc pdf" href="${esc(m.document.url)}" target="_blank" rel="noopener"><span class="pdf-ic">PDF</span><span>${esc(m.document.filename || "Documento")}</span></a>`
    : m.image && /^https:\/\//.test(m.image) ? `<a class="bimg" href="${esc(m.image)}" target="_blank" rel="noopener"><img src="${esc(m.image)}" alt="Foto enviada" loading="lazy"></a>` : mediaHtml(m);
  // El texto "[Imagen]" o "[Audio]" sobra cuando ya se ve el archivo; queda solo el pie de foto, si lo hay
  let txt = pic && m.media ? String(m.text || "").replace(/^\[(Imagen|Audio|Nota de voz|Video|Documento|Sticker)\]\s*/, "") : m.text;
  if (pic && m.media && txt.trim() === String(m.media.filename || "").trim()) txt = "";
  const rate = out && m.id && (m.ai || isAiName(m.byName)) && txt ? `<span class="rate" aria-label="Calificar la respuesta">${[[1, "👍", "Buena respuesta"], [-1, "👎", "Mala respuesta"]].map(([v, e, l]) => `<button type="button" class="${m.rating && m.rating.v === v ? "on" : ""}" data-rv="${v}" data-mid="${esc(m.id)}" title="${l}" aria-label="${l}">${e}</button>`).join("")}</span>` : "";
  return `<div class="bubble ${out ? "out" : "in"}${tail ? " tail" : ""}${pic ? " has-img" : ""}">${tail ? who : ""}${pic}${txt ? `<span class="btx">${fmtWa(txt)}</span>` : ""}${t}${rate}${m.status === "failed" ? `<span class="bfail">⚠ No se entregó${m.error ? ": " + esc(failText(m.error)) : ""}</span>` : ""}</div>`;
}
// Motivo de un mensaje no entregado, en palabras simples
function failText(e) {
  const s = String(e || "");
  if (/re-?engagement|24 ?hours|window/i.test(s)) return "pasaron más de 24 h desde su último mensaje; usa una plantilla aprobada";
  if (/not a valid whatsapp|undeliverable|not.*whatsapp user/i.test(s)) return "el número no tiene WhatsApp o no se pudo entregar";
  if (/spam|quality|limit/i.test(s)) return "WhatsApp limitó los envíos de este número; intenta más tarde";
  return s.slice(0, 140);
}
function dayLabel(ms) {
  const d = new Date(ms), t = new Date(), y = new Date(Date.now() - DAY), same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, t)) return "Hoy";
  if (same(d, y)) return "Ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", ...(d.getFullYear() !== t.getFullYear() ? { year: "numeric" } : {}) });
}
function chatHtml(list) {
  let out = "", day = "", prev = null;
  for (const m of list) {
    const dl = dayLabel(m.ts || 0);
    if (dl !== day) { out += `<div class="daychip">${esc(dl)}</div>`; day = dl; prev = null; }
    const tail = !prev || prev.dir !== m.dir || (m.dir === "out" && prev.byName !== m.byName);
    out += bubble(m, tail, false); prev = m;
  }
  return out;
}
const avColor = s => { let h = 0; for (const ch of String(s || "")) h = (h * 31 + ch.charCodeAt(0)) % 360; return `--av:hsl(${h} 45% 52%)`; };
async function editLooking(c) {
  const v = await promptText("Qué busca " + contactName(c), c.looking || "", "Ej: sábana para cama de 1.40");
  if (v === null) return;
  await fb.update("contacts/" + c.id, { looking: v, ...stamp() });
}
async function snooze(c) {
  const d = await promptText("¿Cuándo vuelves a contactar a " + contactName(c) + "?", addDays(todayIso(), 3), "", "date");
  if (!d) return;
  await fb.update("contacts/" + c.id, { nextDate: d, ...stamp() });
  toast("Recordatorio para el " + fmtDate(d));
}
function promptText(title, value, placeholder = "", type = "text") {
  return new Promise(res => {
    const m = $("#modal");
    m.innerHTML = `<form method="dialog" id="pf"><div class="mh"><h2>${esc(title)}</h2></div><div class="mb">
      ${type === "textarea" ? `<textarea class="in" id="pv" rows="4">${esc(value)}</textarea>` : `<input class="in" id="pv" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`}</div>
      <div class="mf"><button class="btn" type="button" id="pc">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
    const done = v => { m.close(); res(v); };
    $("#pc").onclick = () => done(null);
    $("#pf").onsubmit = e => { e.preventDefault(); done($("#pv").value.trim()); };
    m.oncancel = () => res(null);
    m.showModal(); $("#pv").focus();
  });
}
function chooseProduct(c) {
  const m = $("#modal"), act = S.products.filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  m.innerHTML = `<div class="mh"><h2>Producto elegido por ${esc(contactName(c))}</h2><button class="iconbtn" id="mx">✕</button></div>
    <div class="mb">${act.length ? `<input class="in" id="pq" placeholder="Buscar producto"><div id="pl" class="lines"></div>`
      : `<div class="empty"><p>No hay productos todavía.</p><button class="btn primary" id="goProd">Agregar productos</button></div>`}</div>
    <div class="mf">${c.chosenProduct ? '<button class="btn danger" id="clr">Quitar producto</button>' : ""}</div>`;
  const draw = () => {
    const q = norm($("#pq") ? $("#pq").value : "");
    $("#pl").innerHTML = act.filter(p => !q || norm(p.name + " " + (p.desc || "")).includes(q)).map(p =>
      `<button class="btn" style="text-align:left;display:flex;justify-content:space-between;gap:10px" data-p="${p.id}"><span>${esc(p.name)} <span class="muted">${esc(p.desc || "")}</span></span><b class="tabnum">${money(p.priceRetail)}</b></button>`).join("");
    $$("[data-p]", m).forEach(b => b.onclick = async () => {
      const p = byId(S.products, b.dataset.p);
      await fb.update("contacts/" + c.id, { chosenProduct: { id: p.id, name: p.name, price: p.priceRetail || 0, desc: p.desc || "" }, ...stamp() });
      m.close(); toast("Producto elegido: " + p.name);
    });
  };
  if (act.length) { draw(); $("#pq").oninput = draw; }
  $("#mx").onclick = () => m.close();
  if ($("#goProd")) $("#goProd").onclick = () => { m.close(); go("productos"); };
  if ($("#clr")) $("#clr").onclick = async () => { await fb.update("contacts/" + c.id, { chosenProduct: null, ...stamp() }); m.close(); };
  m.showModal();
}

// ======================= Envío y registro de mensajes =======================
async function sendText(c, text) {
  if (!text.trim()) return;
  try {
    await fb.call("sendMessage", { contactId: c.id, text });
    toast("Mensaje enviado por " + CHN[chOf(c)].label);
  } catch (e) {
    if (/VENTANA_CERRADA/.test(errMsg(e))) return info(chOf(c) === "whatsapp" ? "La ventana de 24 h está cerrada: usa una plantilla aprobada." : `Pasaron más de 24 h desde su último mensaje: ${CHN[chOf(c)].label} no deja escribirle hasta que vuelva a escribir.`);
    toast("No se pudo enviar: " + errMsg(e));
  }
}
const info = msg => ask(msg, "Entendido", null);
// Elegir un producto del catálogo y enviar su foto con nombre y precio como pie de foto
// Ficha del producto con el mismo formato que usa la asesora (functions/ficha.js): nombre, puntos clave y precio
function prodCaption(p) {
  const b = bestPromo(p), before = p.compareAt > p.priceRetail ? p.compareAt : b ? p.priceRetail : 0;
  const pts = String(p.desc || "").split(/[.;\n•·▫️]+/).map(x => x.trim()).flatMap(x => (x.length > 90 ? x.split(/,\s*/) : [x]))
    .map(x => x.trim().replace(/^[-–*]\s*/, "").replace(/^(y|e|junto a)\s+/i, "")).filter(x => x.length > 2 && x.length <= 90).slice(0, 2).map(x => "• " + x[0].toUpperCase() + x.slice(1));
  const [base, ...rest] = String(p.name || "").split(" · ");
  const title = base.replace(/\s*[|–-]\s*casa dorada\s*$/i, "").replace(/\s*\|\s*$/, "").replace(/\s{2,}/g, " ").trim();
  const variant = rest.join(" · ").split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean).join(" · ");
  const L = [`*${title}*`];
  if (variant || p.category) L.push(`_${variant || p.category}_`);
  if (pts.length) L.push("", ...pts);
  L.push("", before ? `*${money(b ? b.price : p.priceRetail)}*   Antes ~${money(before)}~` : `*${money(p.priceRetail)}*`);
  if (b) L.push(`🏷️ ${b.promo.name}${b.promo.code ? ` · código *${b.promo.code}*` : ""}`); else if (before) L.push("🏷️ Precio de oferta");
  if (p.priceWholesale && p.minWholesale) L.push(`Por mayor: desde ${p.minWholesale} unidades a ${money(p.priceWholesale)} c/u`);
  return L.join("\n");
}
function pickProduct(c) {
  const m = $("#modal"); let q = "", sel = null;
  const draw = () => {
    const nq = norm(q), list = S.products.filter(p => p.active !== false && (!nq || norm(`${p.name} ${p.category || ""} ${p.sku || ""}`).includes(nq)))
      .sort((a, b) => ((b.available !== false) - (a.available !== false)) || (!!b.image - !!a.image) || a.name.localeCompare(b.name)).slice(0, 60);
    m.innerHTML = sel ? `<div class="mh"><h2>Enviar a ${esc(contactName(c))}</h2><button class="iconbtn" id="ppx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><img class="pp-big" src="${esc(sel.image)}" alt="${esc(sel.name)}"><label class="lb" for="ppcap">Texto que acompaña la foto</label><textarea class="in" id="ppcap" rows="3">${esc(prodCaption(sel))}</textarea></div>
      <div class="mf"><button class="btn" id="ppback">← Otro producto</button><span class="spacer"></span><button class="btn primary" id="ppsend">Enviar por ${CHN[chOf(c)].label}</button></div>`
      : `<div class="mh"><h2>Enviar foto de un producto</h2><button class="iconbtn" id="ppx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><input class="in" id="ppq" placeholder="Buscar producto" value="${esc(q)}" autocomplete="off">
        <div class="pp-grid">${list.map(p => `<button class="pp-item" data-pp="${p.id}" ${p.image && p.available !== false ? "" : "disabled"} ${p.available === false ? 'title="Agotado en la tienda"' : ""}>${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="pp-noimg">Sin foto</span>'}<b>${esc(p.name)}</b><small class="tabnum">${p.available === false ? '<span class="soldout">Agotado</span>' : money(p.priceRetail)}</small></button>`).join("")
          || '<p class="muted">No hay productos con ese nombre.</p>'}</div>
        ${S.products.some(p => p.image) ? "" : `<p class="muted">Ningún producto tiene foto todavía. ${isAdmin() ? "Impórtalas desde Shopify en Integraciones › Aplicaciones, o agrega el enlace de la foto en Productos." : ""}</p>`}</div>`;
    $("#ppx").onclick = () => m.close();
    if ($("#ppq")) { $("#ppq").oninput = e => { q = e.target.value; draw(); const i = $("#ppq"); i.focus(); i.setSelectionRange(q.length, q.length); }; }
    $$("[data-pp]", m).forEach(b => b.onclick = () => { sel = byId(S.products, b.dataset.pp); draw(); });
    if ($("#ppback")) $("#ppback").onclick = () => { sel = null; draw(); };
    if ($("#ppsend")) $("#ppsend").onclick = async () => {
      const b = $("#ppsend"); b.disabled = true; b.textContent = "Enviando…";
      try { await fb.call("sendMessage", { contactId: c.id, text: $("#ppcap").value.trim(), image: sel.image }); m.close(); toast("Foto enviada"); }
      catch (e) { b.disabled = false; b.textContent = "Enviar"; toast(/VENTANA_CERRADA/.test(errMsg(e)) ? "La ventana de 24 h está cerrada." : "No se pudo enviar: " + errMsg(e)); }
    };
  };
  draw(); m.showModal();
}
async function sendTemplate(c, tpl) {
  const params = (tpl.waParams || []).map(k => fillTpl("{" + k + "}", c));
  try { await fb.call("sendWhatsApp", { contactId: c.id, template: { name: tpl.waName, lang: tpl.waLang || "es", params }, preview: fillTpl(tpl.text, c) }); toast("Plantilla enviada"); }
  catch (e) { toast("No se pudo enviar la plantilla: " + errMsg(e)); }
}
async function logOutbound(c, text, how) {
  // Sin la API: se registra lo que se envió desde el WhatsApp del teléfono
  await fb.add(`contacts/${c.id}/messages`, { dir: "out", text, ts: Date.now(), by: S.user.uid, byName: S.me.name, via: how || "manual" });
  await fb.update("contacts/" + c.id, { lastOutboundAt: Date.now(), lastOutboundBy: S.me.name, lastMessage: text, lastMessageDir: "out", ...stamp() });
}
async function addNote(c, text) {
  await fb.add(`contacts/${c.id}/messages`, { dir: "note", text, ts: Date.now(), by: S.user.uid, byName: S.me.name });
  await fb.update("contacts/" + c.id, stamp());
}

// ======================= Vista: Conversaciones =======================
function watchConv(cid) {
  if (S.msgsFor === cid) return;
  const same = cid && S.msgLimitFor === cid; // al cargar anteriores no se borra lo que ya se ve
  S.msgsUnsub && S.msgsUnsub(); if (!same) S.msgs = []; S.msgsFor = cid;
  if (!cid) return;
  if (S.msgLimitFor !== cid) { S.msgLimit = 150; S.msgLimitFor = cid; }
  const lim = S.msgLimit;
  S.msgsUnsub = fb.watch(`contacts/${cid}/messages`, list => { S.msgsMore = list.length >= lim; S.msgs = list.reverse(); if (S.view === "conv") scheduleRender(); }, { orderBy: ["ts", "desc"], limit: lim });
  const c = byId(S.contacts, cid);
  if (c && c.unread) fb.update("contacts/" + cid, { unread: 0 }).catch(() => { });
}
function viewConv(el) {
  const q = norm(S.convQ || "");
  let list = S.contacts.filter(c => c.lastInboundAt || c.lastOutboundAt);
  if (S.convFilter === "sin") list = list.filter(c => c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt));
  if (S.convFilter === "mias") list = list.filter(c => c.owner === S.me.name);
  if (S.convCh) list = list.filter(c => chOf(c) === S.convCh);
  const lines = (S.ch && S.ch.waLines) || [];
  if (S.convLine) list = list.filter(c => c.waLine === S.convLine);
  if (q) list = list.filter(c => norm(contactName(c) + " " + c.phone + " " + (c.company || "")).includes(q));
  list.sort((a, b) => Math.max(b.lastInboundAt || 0, b.lastOutboundAt || 0) - Math.max(a.lastInboundAt || 0, a.lastOutboundAt || 0));
  const c = byId(S.contacts, S.convSel);
  watchConv(c ? c.id : null);
  const w = c ? winInfo(c) : null;
  const waTpls = S.templates.filter(t => t.waName);
  el.innerHTML = `<div class="chat ${c ? "has-sel" : ""}">
    <div class="chat-list"><div class="search"><input class="in" id="convQ" placeholder="Buscar conversación" value="${esc(S.convQ || "")}">
      <select class="in" id="convF"><option value="todas">Todas</option><option value="sin" ${S.convFilter === "sin" ? "selected" : ""}>Sin responder</option><option value="mias" ${S.convFilter === "mias" ? "selected" : ""}>Mías</option></select>
      ${lines.length > 1 ? `<select class="in" id="convL" style="grid-column:1/-1"><option value="">Todas las líneas de WhatsApp</option>${lines.map(l => `<option value="${esc(l.id)}" ${S.convLine === l.id ? "selected" : ""}>${esc(l.name)}${l.number ? " · " + esc(l.number) : ""}</option>`).join("")}</select>` : ""}</div>
      <div class="ch-tabs"><button data-ch="" class="${!S.convCh ? "on" : ""}">Todos</button>${Object.keys(CHN).map(k => `<button data-ch="${k}" class="${S.convCh === k ? "on" : ""}" title="${CHN[k].label}">${chIcon(k)}</button>`).join("")}</div>
      ${list.map(x => { const last = Math.max(x.lastInboundAt || 0, x.lastOutboundAt || 0); return `<button class="conv ${c && x.id === c.id ? "on" : ""}" data-c="${x.id}">
        <span class="av-wrap"><span class="avatar c" style="${avColor(contactName(x))}">${esc((contactName(x) || "?")[0].toUpperCase())}</span>${chIcon(chOf(x), "badge")}</span><div class="meta"><div class="l1"><b>${esc(contactName(x))}</b><small class="tm ${x.unread ? "new" : ""}">${last ? whenLabel(last).replace(/^hoy /, "") : ""}</small></div>
        <div class="l1"><span class="l2">${x.lastMessageDir === "out" ? (isAiName(x.lastOutboundBy) ? "✨ " : ticks("sent")) : ""}${esc(stripWa(x.lastMessage || ""))}</span>${x.unread ? `<span class="unread">${x.unread}</span>` : ""}</div></div></button>`; }).join("")
        || `<div class="empty"><p>${anyChannel() ? "Aún no hay conversaciones. Cuando un cliente escriba por un canal conectado aparecerá aquí." : "Aquí verás las conversaciones de WhatsApp, Instagram, Messenger, Telegram y el chat web cuando los conectes en Canales."}</p></div>`}
    </div>
    <div class="chat-pane">${c ? `
      <div class="chat-top"><button class="btn sm back" id="cback">←</button><div class="avatar c" style="${avColor(contactName(c))}">${esc(contactName(c)[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0"><b class="ct-name">${esc(contactName(c))}</b><div class="ct-sub tabnum">${chIcon(chOf(c), "inl")} ${CHN[chOf(c)].label}${chOf(c) === "whatsapp" && c.waLine && lines.find(l => l.id === c.waLine) ? " · " + esc(lines.find(l => l.id === c.waLine).name) : ""}${c.phone ? " · " : ""}${esc(c.phone || "")}${c.company ? " · " + esc(c.company) : ""}</div></div>
        ${w.nolimit ? "" : `<span class="pill ${w.open ? "green" : "red"}">${w.open ? "Ventana abierta · cierra " + whenLabel(w.closesAt) : "Ventana cerrada"}</span>`}</div>
      ${aiBar(c)}
      <details class="aic-mob" ${S.aicOpen ? "open" : ""}><summary>${icon("asesora")}<b>Análisis con IA</b>${c.ai ? `<span class="aiprob ${probCls(c.ai.probabilidad)}">${c.ai.probabilidad}%</span><span class="aic-mob-next">${esc(c.ai.siguiente || "")}</span>` : `<span class="muted">${S.cpBusy === "an:" + c.id ? "analizando…" : "pendiente"}</span>`}</summary>${aiInsight(c)}</details>
      <div class="msgs" id="msgs">${S.msgsMore ? '<button class="older" id="older">Cargar mensajes anteriores</button>' : ""}${chatHtml(S.msgs) || '<div class="daychip">Sin mensajes todavía</div>'}</div>
      <div class="composer">
        ${canSend(c) && w.open ? `<div class="row"><button class="iconbtn cpic" id="cprod" type="button" aria-label="Enviar foto de un producto" title="Enviar foto de un producto">${icon("foto")}</button><textarea class="in" id="ctext" rows="1" placeholder="Escribe un mensaje por ${CHN[chOf(c)].label}">${esc(draftOf(c))}</textarea><button class="send" id="csend" aria-label="Enviar" title="Enviar">${icon("send")}</button></div>` : ""}
        ${canSend(c) && !w.open && chOf(c) === "whatsapp" ? `<div class="row"><select class="in" id="ctpl">${waTpls.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("") || "<option value=''>No hay plantillas aprobadas</option>"}</select><button class="btn primary" id="ctplsend" ${waTpls.length ? "" : "disabled"}>Enviar plantilla</button></div>
          <small class="muted">Pasaron más de 24 h desde su último mensaje: WhatsApp solo permite plantillas aprobadas por Meta.</small>` : ""}
        ${canSend(c) && !w.open && chOf(c) !== "whatsapp" ? `<small class="muted">Pasaron más de 24 h desde su último mensaje: ${CHN[chOf(c)].label} no deja escribirle hasta que vuelva a escribir.</small>` : ""}
        ${!canSend(c) && chOf(c) === "whatsapp" ? `<div class="row"><textarea class="in" id="ctext" rows="1" placeholder="Escribe el mensaje y ábrelo en WhatsApp">${esc(draftOf(c))}</textarea>
          ${waLink(c.phone) ? `<button class="send" id="cwa" aria-label="Abrir en WhatsApp" title="Abrir en WhatsApp">${icon("send")}</button>` : ""}</div>` : ""}
        ${!canSend(c) && chOf(c) !== "whatsapp" ? `<small class="muted">${CHN[chOf(c)].label} no está conectado. ${isAdmin() ? 'Conéctalo en <a href="#canales">Canales</a>.' : "Pídele a la administradora que lo conecte."}</small>` : ""}
        ${(canSend(c) && w.open) || (!canSend(c) && chOf(c) === "whatsapp") ? copilotRow(c) : ""}
        <div class="row note-row"><input class="in" id="cnote" placeholder="Nota interna: el cliente no la ve"><button class="btn sm" id="cnotebtn">Guardar nota</button></div>
      </div>` : `<div class="empty" style="margin:auto">Elige una conversación.</div>`}</div>
    ${c ? `<aside class="chat-info">${contactSummary(c)}</aside>` : ""}</div>`;
  $("#convQ").oninput = e => { S.convQ = e.target.value; renderShell(); };
  $("#convF").onchange = e => { S.convFilter = e.target.value; renderShell(); };
  $$("[data-ch]", el).forEach(b => b.onclick = () => { S.convCh = b.dataset.ch; renderShell(); });
  if ($("#convL")) $("#convL").onchange = e => { S.convLine = e.target.value; renderShell(); };
  $$("[data-c]", el).forEach(b => b.onclick = () => go("conv", b.dataset.c));
  if (!c) return;
  const box = $("#msgs");
  if (S.keepScroll != null) { box.scrollTop = box.scrollHeight - S.keepScroll; S.keepScroll = null; } else box.scrollTop = box.scrollHeight;
  if ($("#older")) $("#older").onclick = () => { S.keepScroll = box.scrollHeight - box.scrollTop; S.msgLimit += 300; S.msgsFor = null; watchConv(c.id); };
  $("#cback").onclick = () => { S.convSel = null; go("conv"); };
  if ($("#csend")) $("#csend").onclick = async () => { const t = $("#ctext").value.trim(); if (!t) return; $("#csend").disabled = true; await sendText(c, t); setDraft(c, ""); $("#ctext").value = ""; };
  if ($("#ctext") && $("#csend")) $("#ctext").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#csend").click(); } };
  if ($("#ctplsend")) $("#ctplsend").onclick = () => sendTemplate(c, byId(S.templates, $("#ctpl").value));
  if ($("#cprod")) $("#cprod").onclick = () => pickProduct(c);
  if ($("#ctext")) $("#ctext").addEventListener("input", e => setDraft(c, e.target.value));
  bindCopilot(c);
  if ($(".aic-mob")) $(".aic-mob").ontoggle = e => { S.aicOpen = e.target.open; };
  if ($("#cwa")) $("#cwa").onclick = async () => { const t = $("#ctext").value.trim(); window.open(waLink(c.phone, t), "_blank"); if (t) { await logOutbound(c, t, "Abierto en WhatsApp"); } };
  if ($("#aiToggle")) $("#aiToggle").onclick = () => setAi(c, $("#aiToggle").dataset.on === "1");
  $("#cnotebtn").onclick = async () => { const t = $("#cnote").value.trim(); if (!t) return; await addNote(c, t); $("#cnote").value = ""; };
  bindSummary(c);
}
function contactSummary(c) {
  const qs = S.quotes.filter(q => q.contactId === c.id).slice(0, 5);
  return `${aiInsight(c)}${c.ad ? `<div class="ad-from">${icon("anuncios")}<span>Llegó por el anuncio <b>${esc(c.ad.headline || c.ad.id || "")}</b></span></div>` : ""}${c.paymentProof && c.paymentProof.status === "por revisar" ? `<div class="ad-from proof">💳<span>Envió un comprobante${c.paymentProof.monto ? " por <b>" + money(c.paymentProof.monto) + "</b>" : ""}${c.paymentProof.banco ? " · " + esc(c.paymentProof.banco) : ""}: revísalo en <a href="#oportunidades">Oportunidades</a></span></div>` : ""}${c.optOut ? `<div class="ad-from">🚫<span>Pidió no recibir mensajes: no le llegan difusiones ni recordatorios</span></div>` : ""}${c.comment ? `<div class="ad-from">${icon("captacion")}<span>Comentó: <b>"${esc(c.comment.text)}"</b>${c.comment.url ? ` · <a href="${esc(c.comment.url)}" target="_blank" rel="noopener">ver publicación</a>` : ""}</span></div>` : ""}${c.webFunnel ? `<div class="ad-from">${icon("captacion")}<span>Llegó por el mensaje automático <b>${esc(c.webFunnel.name || "de la web")}</b>${c.webPage ? ` en <a href="${esc(c.webPage)}" target="_blank" rel="noopener">${esc(c.webPage.replace(/^https?:\/\//, "").slice(0, 40))}</a>` : ""}</span></div>` : ""}<div><p class="eyebrow">Etapa${pipes().length > 1 ? " · " + esc(pipeOf(c).name) : ""}</p><select class="in" id="sStage">${stagesOf(c).map(s => `<option ${c.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    ${(S.priceLists || []).length ? `<div><p class="eyebrow">Lista de precios</p><select class="in" id="sList" ${isAdmin() ? "" : "disabled"}><option value="">${listFor({ ...c, priceList: "" }) ? "La del embudo: " + esc(listFor({ ...c, priceList: "" }).name) : "Precio normal"}</option>${S.priceLists.map(l => `<option value="${l.id}" ${c.priceList === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></div>` : ""}
    <div><p class="eyebrow">Responsable</p><select class="in" id="sOwner"><option value="">Sin asignar</option>${ownerOptions().map(n => `<option ${c.owner === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    <div><p class="eyebrow">Qué busca</p><div class="inline-edit" id="sLook">${esc(c.looking || "—")}</div></div>
    <div><p class="eyebrow">Producto elegido</p><div>${c.chosenProduct ? esc(c.chosenProduct.name) + " · " + money(c.chosenProduct.price) : "—"}</div><button class="btn sm" id="sProd" style="margin-top:6px">Elegir</button></div>
    <div><p class="eyebrow">Cotizaciones</p>${qs.map(q => `<div><a href="#" data-q="${q.id}">${esc(q.number)}</a> · ${money(q.total)} · <span class="muted">${esc(q.status)}</span></div>`).join("") || '<span class="muted">Ninguna</span>'}
      <button class="btn sm" id="sQuote" style="margin-top:6px">Nueva cotización</button></div>
    <button class="btn" id="sCard">Ver ficha completa</button>`;
}
function bindSummary(c) {
  bindInsight(c);
  $("#sStage").onchange = e => setStage(c, e.target.value);
  $("#sOwner").onchange = e => fb.update("contacts/" + c.id, { owner: e.target.value, ...stamp() });
  if ($("#sList")) $("#sList").onchange = e => fb.update("contacts/" + c.id, { priceList: e.target.value, ...stamp() });
  $("#sLook").onclick = () => editLooking(c);
  $("#sProd").onclick = () => chooseProduct(c);
  $("#sQuote").onclick = () => openQuote(null, c.id);
  $("#sCard").onclick = () => openContact(c.id);
  $$("[data-q]").forEach(a => a.onclick = e => { e.preventDefault(); openQuote(a.dataset.q); });
}
async function setStage(c, stage) {
  const patch = { stage, stageAt: Date.now(), ...stamp() };
  if (stage === "Ganado") patch.type = "Cliente";
  await fb.update("contacts/" + c.id, patch);
}

// ======================= Vista: Embudo =======================
async function moveStage(c, stage) {
  if (!c || (c.stage || "Nuevo") === stage) return;
  const prev = c.stage || "Nuevo", extra = {};
  if (stage === "Perdido") {
    const why = await promptText("¿Por qué se perdió " + contactName(c) + "? (opcional)", "", "Ej: precio, compró a otro proveedor");
    if (why === null) return;
    if (why) extra.lostReason = why;
  }
  c.stage = stage; c.stageAt = Date.now(); renderShell(); // se ve al instante; Firebase confirma después
  try { await fb.update("contacts/" + c.id, { stage, stageAt: Date.now(), ...(stage === "Ganado" ? { type: "Cliente" } : {}), ...extra, ...stamp() }); toast(contactName(c) + " → " + stage); }
  catch (e) { c.stage = prev; renderShell(); toast("No se pudo mover: " + errMsg(e)); }
}
function stageSheet(c) {
  const m = $("#modal"), cur = c.stage || "Nuevo";
  m.innerHTML = `<div class="mh"><h2>${esc(contactName(c))}</h2><button class="iconbtn" id="sx" aria-label="Cerrar">✕</button></div>
    <div class="mb">${pipes().length > 1 ? `<div><label class="lb" for="spipe">Embudo</label><select class="in" id="spipe">${pipes().map(p => `<option value="${p.id}" ${p.id === pipeOf(c).id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>` : ""}
      <p class="eyebrow" style="margin:0">Mover a la etapa</p>
      <div class="stage-pick">${stagesOf(c).map(st => `<button class="btn ${st === cur ? "on" : ""}" data-st="${st}">${st === cur ? "✓ " : ""}${st}</button>`).join("")}</div>
      ${c.company && c.name ? `<p class="muted" style="margin:0">${esc(c.company)}</p>` : ""}${c.lostReason && cur === "Perdido" ? `<p class="muted" style="margin:0">Motivo: ${esc(c.lostReason)}</p>` : ""}</div>
    <div class="mf"><button class="btn" id="sconv">Conversación</button><button class="btn primary" id="scard">Ver ficha</button></div>`;
  $("#sx").onclick = () => m.close();
  $("#scard").onclick = () => { m.close(); openContact(c.id); };
  $("#sconv").onclick = () => { m.close(); go("conv", c.id); };
  $$("[data-st]", m).forEach(b => b.onclick = () => { m.close(); moveStage(c, b.dataset.st); });
  if ($("#spipe")) $("#spipe").onchange = async e => { const p = pipes().find(x => x.id === e.target.value); m.close();
    await fb.update("contacts/" + c.id, { pipeline: p.id, stage: p.stages[0], stageAt: Date.now(), ...stamp() }); toast(`${contactName(c)} → embudo ${p.name}`); };
  m.showModal();
}
function openPipes() {
  const list = JSON.parse(JSON.stringify(pipes())), m = $("#modal");
  const draw = () => {
    m.innerHTML = `<form id="pf"><div class="mh"><h2>Embudos y etapas</h2><button class="iconbtn" type="button" id="px" aria-label="Cerrar">✕</button></div>
      <div class="mb"><p class="muted" style="margin:0">Crea un embudo por cada tipo de venta (por ejemplo: Hoteles, Mayoristas, Tienda en línea). Escribe una etapa por línea. <b>Ganado</b> y <b>Perdido</b> se agregan solas al final.</p>
      ${list.map((p, i) => `<fieldset class="fs"><legend>${esc(p.name || "Nuevo embudo")}</legend><div class="grid2">
        <div><label class="lb">Nombre</label><input class="in" data-pn="${i}" value="${esc(p.name)}" required ${p.id === "ventas" ? "" : ""}></div>
        <div class="full"><label class="lb">Etapas</label><textarea class="in" data-ps="${i}" rows="${Math.max(4, p.stages.length - 1)}">${esc(p.stages.filter(s => s !== "Ganado" && s !== "Perdido").join("\n"))}</textarea></div></div>
        ${p.id !== "ventas" ? `<button class="btn sm danger" type="button" data-pdel="${i}">Eliminar embudo</button>` : '<small class="muted">Embudo principal: no se puede eliminar.</small>'}</fieldset>`).join("")}
      <button class="btn" type="button" id="padd">+ Nuevo embudo</button></div>
      <div class="mf"><button class="btn" type="button" id="pc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`;
    const read = () => list.forEach((p, i) => { p.name = $(`[data-pn="${i}"]`).value.trim(); p.stages = [...new Set($(`[data-ps="${i}"]`).value.split("\n").map(x => x.trim()).filter(x => x && x !== "Ganado" && x !== "Perdido")), "Ganado", "Perdido"]; });
    $("#px").onclick = $("#pc").onclick = () => m.close();
    $("#padd").onclick = () => { read(); list.push({ id: "p" + Date.now().toString(36), name: "", stages: ["Nuevo", "Contactado", "Propuesta", "Ganado", "Perdido"] }); setTimeout(draw); };
    $$("[data-pdel]", m).forEach(b => b.onclick = async () => { read(); const p = list[+b.dataset.pdel], n = S.contacts.filter(c => c.pipeline === p.id).length;
      if (!await ask(`¿Eliminar el embudo ${p.name}?${n ? ` Sus ${n} contactos pasan al embudo Ventas.` : ""}`, "Eliminar")) return draw();
      list.splice(+b.dataset.pdel, 1); p._moved = true; S._pipeDeleted = [...(S._pipeDeleted || []), p.id]; setTimeout(draw); });
    $("#pf").onsubmit = async e => {
      e.preventDefault(); read();
      if (list.some(p => !p.name)) return toast("Ponle nombre a cada embudo.");
      if (list.some(p => p.stages.length < 3)) return toast("Cada embudo necesita al menos una etapa además de Ganado y Perdido.");
      try {
        await fb.set("settings/pipelines", { list: list.map(({ id, name, stages }) => ({ id, name, stages })), ...stamp() });
        const gone = S._pipeDeleted || []; S._pipeDeleted = [];
        const moved = S.contacts.filter(c => gone.includes(c.pipeline));
        if (moved.length) await fb.batch(moved.map(c => ({ path: "contacts/" + c.id, data: { pipeline: "ventas", stage: "Nuevo", stageAt: Date.now() }, merge: true })));
        // contactos cuya etapa ya no existe en su embudo: a la primera etapa
        const fix = S.contacts.filter(c => !gone.includes(c.pipeline)).map(c => [c, list.find(p => p.id === (c.pipeline || "ventas"))]).filter(([c, p]) => p && c.stage && !p.stages.includes(c.stage));
        if (fix.length && await ask(`${fix.length} contactos están en etapas que borraste. ¿Pasarlos a la primera etapa de su embudo?`, "Sí, pasarlos", "Dejarlos así"))
          await fb.batch(fix.map(([c, p]) => ({ path: "contacts/" + c.id, data: { stage: p.stages[0], stageAt: Date.now() }, merge: true })));
        m.close(); toast("Embudos guardados");
      } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
    };
  };
  draw(); m.showModal();
}
// Tarjeta del embudo: hora corta del último movimiento ("10:19 a.m.", "ayer", "19/10")
function shortWhen(ms) {
  if (!ms) return "";
  const d = new Date(ms), t = new Date(), y = new Date(Date.now() - DAY);
  if (d.toDateString() === t.toDateString()) return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }).replace(/\s/g, " ");
  if (d.toDateString() === y.toDateString()) return "ayer";
  return d.getDate() + "/" + (d.getMonth() + 1);
}
// Estado de la ventana de 24 h en palabras cortas, como un chip
function winChip(c) {
  if (!canSend(c) && chOf(c) !== "whatsapp") return "";
  const w = winInfo(c);
  if (w.nolimit) return `<span class="kchip">chat abierto</span>`;
  if (w.never) return `<span class="kchip">sin chat</span>`;
  if (!w.open) return `<span class="kchip">ventana cerrada</span>`;
  const left = w.closesAt - Date.now(), h = Math.floor(left / H);
  return `<span class="kchip ${left < H ? "red" : left < 4 * H ? "amber" : ""}">${h >= 1 ? h + "h" : Math.max(1, Math.round(left / 6e4)) + "m"}</span>`;
}
const needsHuman = c => (c.unread || 0) > 0 || !!c.aiHandoff;
let _ordSum = null, _ordSumRef = null;
const orderTotals = () => { if (_ordSumRef !== S.orders) { _ordSumRef = S.orders; _ordSum = {}; S.orders.forEach(o => { if (o.status !== "Cancelado") _ordSum[o.contactId] = (_ordSum[o.contactId] || 0) + (o.total || 0); }); } return _ordSum; };

function viewEmbudo(el) {
  const f = S.embF || {}, q = norm(f.q || ""), more = S.embMore || (S.embMore = {}), sel = S.embSel || (S.embSel = new Set()), adm = isAdmin();
  const base = S.contacts.filter(c => !c.archived);
  const pipe = pipes().find(p => p.id === f.pipe) || pipes()[0];
  const qv = {}; S.quotes.forEach(x => { if (["Enviada", "Aceptada", "Borrador"].includes(x.status)) qv[x.contactId] = (qv[x.contactId] || 0) + (x.total || 0); });
  const ot = orderTotals(), val = c => ot[c.id] || qv[c.id] || 0;
  let inPipe = base.filter(c => pipeOf(c).id === pipe.id && (!f.seg || c.segment === f.seg) && (!f.owner || c.owner === f.owner));
  if (q) inPipe = inPipe.filter(c => norm([c.name, c.company, c.phone, c.city, c.lastMessage, c.chosenProduct && c.chosenProduct.name].join(" ")).includes(q));
  const CHIPS = [["", "Todas", () => true], ["aten", "Requieren atención", needsHuman], ["escribir", "Puedo escribir", c => canSend(c) && winInfo(c).open], ["pedido", "Con pedido", c => !!ot[c.id]], ["sinresp", "Sin responsable", c => !c.owner], ["ia", "✨ Más probables", c => !!c.ai && c.ai.probabilidad >= 60]];
  const chip = CHIPS.find(x => x[0] === (f.chip || "")) || CHIPS[0];
  const list = inPipe.filter(chip[2]);
  const stages = f.showLost ? pipe.stages : pipe.stages.filter(st => st !== "Perdido");
  const first = pipe.stages[0], stageOfC = c => (c.stage && pipe.stages.includes(c.stage) ? c.stage : first);
  const shown = list.filter(c => stages.includes(stageOfC(c)));
  [...sel].forEach(id => { if (!shown.some(c => c.id === id)) sel.delete(id); });
  const owners = [...new Set([...S.team.filter(u => u.active !== false).map(u => u.name), ...S.contacts.map(c => c.owner)].filter(Boolean))];
  // Conserva el desplazamiento del tablero cuando se redibuja por cambios en vivo
  const ob = $(".board"), keep = ob ? { x: ob.scrollLeft, y: Object.fromEntries($$(".col").map(cl => [cl.dataset.stage, $(".col-body", cl).scrollTop])) } : null;
  const card = (c, st) => {
    const v = val(c), last = Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0) || c.updatedAt || c.createdAt;
    const prev = c.lastMessage || c.nextAction || c.looking || (c.company && c.name ? c.company : "");
    return `<div class="deal kcard${c.aiHandoff ? " hot" : ""}${sel.has(c.id) ? " picked" : ""}" data-id="${c.id}" tabindex="0" role="button" aria-label="${esc(contactName(c))}, ${esc(st)}">
      <div class="kc-top"><input type="checkbox" class="kc-pick" data-pick="${c.id}" ${sel.has(c.id) ? "checked" : ""} aria-label="Seleccionar ${esc(contactName(c))}">
        <span class="kav avatar c" style="${avColor(contactName(c))}">${esc((contactName(c) || "?")[0].toUpperCase())}</span>
        <span class="kc-id"><b class="nm">${esc(contactName(c))}</b><small>${chIcon(chOf(c), "xs")}${esc((c.phone || "").replace(/^\+/, "") || (CHN[chOf(c)] || CHN.web).label)}</small></span>
        ${(c.unread || 0) > 0 ? `<span class="kun">${c.unread}</span>` : ""}</div>
      ${c.ai && c.ai.siguiente ? `<p class="kc-ai"><span class="aiprob ${probCls(c.ai.probabilidad)}" title="Probabilidad de compra según la IA">${c.ai.probabilidad}%</span>${esc(c.ai.siguiente)}</p>` : prev ? `<p class="kc-msg">${esc(prev)}</p>` : ""}
      ${c.aiHandoff ? `<p class="kc-note">${esc(aiName())} pasó el chat a una persona${c.aiHandoff.reason ? " — " + esc(c.aiHandoff.reason) : ""}</p>` : ""}
      <div class="kc-meta">${winChip(c)}${v ? `<b class="tabnum kc-val">${money(v)}</b>` : ""}<span class="spacer"></span><span class="kc-time">${shortWhen(last)}</span></div>
      <select class="in kc-stage" data-stage-of="${c.id}" aria-label="Etapa de ${esc(contactName(c))}">${pipe.stages.map(s => `<option ${s === st ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;
  };
  el.innerHTML = `<div class="page emb" style="max-width:none">
    <div class="page-head emb-head"><h1>Embudo</h1><span class="spacer"></span>
      ${adm ? `<button class="btn" data-goto="automatizaciones">${icon("automatizaciones")}Automatizar</button><button class="btn" data-goto="importar">${icon("exportar")}Importar</button>
      <button class="btn" id="pipesBtn">${icon("ajustes")}Ajustes</button>` : ""}</div>
    <div class="emb-tabs"><div class="segctl">${pipes().map(p => `<button class="${p.id === pipe.id ? "on" : ""}" data-pipe="${p.id}">${esc(p.name)}</button>`).join("")}</div>
      ${adm ? `<button class="btn icon-only" id="pipeAdd" title="Nuevo embudo" aria-label="Nuevo embudo">+</button>` : ""}</div>
    <div class="emb-filters"><label class="emb-search">${icon("buscar")}<input id="eq" placeholder="Buscar nombre, teléfono, mensaje" value="${esc(f.q || "")}" autocomplete="off"></label>
      <div class="kchips">${CHIPS.map(([k, t, fn]) => `<button class="${chip[0] === k ? "on" : ""}" data-chip="${k}">${t}${k ? ` <span class="tabnum">${inPipe.filter(fn).length}</span>` : ""}</button>`).join("")}
        <button class="${f.showLost ? "on" : ""}" id="ef3">Perdidos</button></div>
      <select class="in emb-owner" id="ef2" aria-label="Responsable"><option value="">Todos los responsables</option>${owners.map(o => `<option ${f.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
      <span class="emb-sum"><b class="tabnum">${shown.length}</b> personas · <b class="tabnum">${money(shown.reduce((a, c) => a + val(c), 0))}</b></span></div>
    <div class="board kboard">${stages.map(st => {
      const cards = list.filter(c => stageOfC(c) === st).sort((a, b) => (needsHuman(b) - needsHuman(a)) || ((Math.max(b.lastInboundAt || 0, b.lastOutboundAt || 0) || b.stageAt || 0) - (Math.max(a.lastInboundAt || 0, a.lastOutboundAt || 0) || a.stageAt || 0)));
      const total = cards.reduce((a, c) => a + val(c), 0), lim = more[st] || 40, allOn = cards.length && cards.every(c => sel.has(c.id));
      return `<div class="col" data-stage="${esc(st)}" style="--st:${stColor(st, pipe.stages.indexOf(st))}">
        <div class="col-head"><div class="kh-1"><input type="checkbox" data-pickall="${esc(st)}" ${allOn ? "checked" : ""} aria-label="Seleccionar todos en ${esc(st)}"><b>${esc(st)}</b></div>
          <div class="kh-2"><span class="tabnum">${cards.length} ${cards.length === 1 ? "persona" : "personas"}</span>${total ? `<b class="tabnum">${money(total)}</b>` : ""}<span class="spacer"></span>
          ${adm && cards.length ? `<button class="link" data-difundir="${esc(st)}">Difundir</button>` : ""}</div></div>
        <div class="col-body">${cards.slice(0, lim).map(c => card(c, st)).join("")}
          ${cards.length > lim ? `<button class="btn sm" data-more="${esc(st)}">Ver ${Math.min(50, cards.length - lim)} más (quedan ${cards.length - lim})</button>` : ""}
          ${!cards.length ? '<p class="kempty">Sin personas aquí</p>' : ""}</div></div>`;
    }).join("")}</div>
    ${sel.size ? `<div class="bulkbar"><b>${sel.size} ${sel.size === 1 ? "seleccionada" : "seleccionadas"}</b>
      <select class="in" id="bkStage"><option value="">Mover a…</option>${pipe.stages.map(s => `<option>${esc(s)}</option>`).join("")}</select>
      <select class="in" id="bkOwner"><option value="">Asignar a…</option>${owners.map(o => `<option>${esc(o)}</option>`).join("")}</select>
      <button class="btn sm" id="bkClear">Quitar selección</button></div>` : ""}</div>`;
  const board = $(".board", el);
  if (keep) { board.scrollLeft = keep.x; $$(".col", el).forEach(cl => { const y = keep.y[cl.dataset.stage]; if (y) $(".col-body", cl).scrollTop = y; }); }
  const setF = p => { S.embF = { ...f, ...p }; S.embMore = {}; renderShell(); };
  $$("[data-pipe]", el).forEach(b => b.onclick = () => { S.embSel.clear(); setF({ pipe: b.dataset.pipe, seg: "" }); });
  $$("[data-chip]", el).forEach(b => b.onclick = () => setF({ chip: b.dataset.chip }));
  $$("[data-goto]", el).forEach(b => b.onclick = () => go(b.dataset.goto));
  if ($("#pipesBtn")) $("#pipesBtn").onclick = openPipes;
  if ($("#pipeAdd")) $("#pipeAdd").onclick = openPipes;
  $("#eq").oninput = e => { S.embF = { ...f, q: e.target.value }; renderShell(); };
  $("#ef2").onchange = e => setF({ owner: e.target.value });
  $("#ef3").onclick = () => setF({ showLost: !f.showLost });
  $$("[data-more]", el).forEach(b => b.onclick = () => { more[b.dataset.more] = (more[b.dataset.more] || 40) + 50; renderShell(); });
  $$("[data-difundir]", el).forEach(b => b.onclick = () => openCampaign(null, { stage: b.dataset.difundir }));
  $$("[data-pick]", el).forEach(x => x.onchange = () => { x.checked ? sel.add(x.dataset.pick) : sel.delete(x.dataset.pick); renderShell(); });
  $$("[data-pickall]", el).forEach(x => x.onchange = () => { list.filter(c => stageOfC(c) === x.dataset.pickall).forEach(c => x.checked ? sel.add(c.id) : sel.delete(c.id)); renderShell(); });
  $$("[data-stage-of]", el).forEach(s => s.onchange = () => moveStage(byId(S.contacts, s.dataset.stageOf), s.value));
  const bulk = async patchOf => {
    const ids = [...sel];
    try { await Promise.all(ids.map(id => fb.update("contacts/" + id, { ...patchOf(byId(S.contacts, id)), ...stamp() }))); toast(`${ids.length} actualizados`); sel.clear(); renderShell(); }
    catch (e) { toast("No se pudo: " + errMsg(e)); }
  };
  if ($("#bkStage")) $("#bkStage").onchange = e => { const st = e.target.value; if (st) bulk(() => ({ stage: st, stageAt: Date.now(), ...(st === "Ganado" ? { type: "Cliente" } : {}), ...(pipe.id !== "ventas" ? { pipeline: pipe.id } : {}) })); };
  if ($("#bkOwner")) $("#bkOwner").onchange = e => { const o = e.target.value; if (o) bulk(() => ({ owner: o })); };
  if ($("#bkClear")) $("#bkClear").onclick = () => { sel.clear(); renderShell(); };
  $$(".deal", el).forEach(d => {
    const c = byId(S.contacts, d.dataset.id);
    d.onkeydown = e => { if (e.target !== d) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go("conv", c.id); } };
    d.onpointerdown = e => {
      if (e.button !== 0 || e.target.closest("input,select,button,label")) return;
      const x0 = e.clientX, y0 = e.clientY, mouse = e.pointerType === "mouse";
      let ghost = null, over = null, timer = null;
      const finish = () => { S.dragging = false; if (S.pendingRender) { S.pendingRender = false; scheduleRender(); } };
      const move = ev => {
        if (!mouse) return; // en pantallas táctiles se mueve con el menú, así no se bloquea el desplazamiento
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
          S.dragging = true; ghost = d.cloneNode(true); ghost.classList.add("ghost"); ghost.style.width = d.offsetWidth + "px"; document.body.append(ghost); d.classList.add("dragging");
        }
        if (!ghost) return;
        ghost.style.left = ev.clientX - 20 + "px"; ghost.style.top = ev.clientY - 16 + "px";
        const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".col");
        if (col !== over) { over && over.classList.remove("over"); over = col; over && over.classList.add("over"); }
        const r = board.getBoundingClientRect();
        clearInterval(timer);
        if (ev.clientX > r.right - 60) timer = setInterval(() => board.scrollLeft += 18, 30);
        else if (ev.clientX < r.left + 60) timer = setInterval(() => board.scrollLeft -= 18, 30);
      };
      const up = ev => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); clearInterval(timer);
        if (ghost) { ghost.remove(); d.classList.remove("dragging"); over && over.classList.remove("over"); finish(); if (over) moveStage(c, over.dataset.stage); }
        else if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) go("conv", c.id);
      };
      const cancel = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); clearInterval(timer); ghost && ghost.remove(); d.classList.remove("dragging"); over && over.classList.remove("over"); finish(); };
      addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
    };
  });
}

// ======================= Vista: Contactos =======================
function viewContactos(el) {
  const f = S.conF || {}, q = norm(S.search);
  let list = S.contacts.filter(c => (!f.seg || c.segment === f.seg) && (!f.stage || c.stage === f.stage) && (!f.owner || c.owner === f.owner) && (!f.type || c.type === f.type) && (!f.form || c.formId === f.form));
  if (q) {
    const terms = q.split(/\s+/);
    list = list.filter(c => { const h = norm([c.name, c.company, c.phone, c.city, c.email, c.cargo, c.looking, c.obs].join(" ")), d = h.replace(/\D/g, "");
      return terms.every(t => h.includes(t) || (/^\d{3,}$/.test(t) && d.includes(t))); });
  }
  list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const shown = list.slice(0, S.conShow || 300);
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Contactos</h1><span class="sub tabnum">${list.length} de ${S.contacts.length}</span>${f.form ? `<button class="pill" id="clrForm">Formulario: ${esc((byId(S.forms, f.form) || {}).name || "")} ✕</button>` : ""}<span class="spacer"></span>
      <button class="btn primary" id="newC">+ Nuevo contacto</button></div>
    <div class="toolbar"><input class="in" id="cq" placeholder="Buscar nombre, hotel, teléfono, ciudad…" value="${esc(S.search)}">
      <select class="in" id="f1"><option value="">Segmento</option>${SEGMENTS.map(s => `<option ${f.seg === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select class="in" id="f2"><option value="">Etapa</option>${allStages().map(s => `<option ${f.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select class="in" id="f3"><option value="">Tipo</option>${["Prospecto", "Cliente"].map(s => `<option ${f.type === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select class="in" id="f4"><option value="">Responsable</option>${[...new Set(S.contacts.map(c => c.owner).filter(Boolean))].map(o => `<option ${f.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>
    ${S.contacts.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Nombre</th><th>Hotel / empresa</th><th>Segmento</th><th>Etapa</th><th>Temperatura</th><th>WhatsApp</th><th>Responsable</th><th>Próx. seguimiento</th></tr></thead>
      <tbody>${shown.map(c => `<tr data-id="${c.id}"><td><b>${esc(c.name || "—")}</b></td><td>${esc(c.company || "")}</td><td>${esc(c.segment || "")}</td><td>${esc(c.stage || "")}</td><td>${esc(c.temperature || "")}</td>
        <td class="tabnum">${esc(c.phone || "")}</td><td>${esc(c.owner || "")}</td><td class="tabnum" style="${c.nextDate && c.nextDate < todayIso() ? "color:var(--red);font-weight:600" : ""}">${fmtDate(c.nextDate)}</td></tr>`).join("")}</tbody></table></div>
      ${list.length > shown.length ? `<div style="text-align:center;margin:12px"><button class="btn" id="conMore">Ver ${Math.min(500, list.length - shown.length)} más</button> <span class="muted">· mostrando ${shown.length} de ${list.length}</span></div>` : ""}`
      : `<div class="empty"><p><b>Todavía no hay contactos.</b></p><p>Impórtalos desde tu Excel CasaDorada_CRM o créalos uno por uno.</p><button class="btn primary" onclick="location.hash='importar'">Importar Excel</button></div>`}</div>`;
  $("#cq").oninput = e => { S.search = e.target.value; S.conShow = 300; renderShell(); };
  if ($("#conMore")) $("#conMore").onclick = () => { S.conShow = (S.conShow || 300) + 500; renderShell(); };
  if ($("#clrForm")) $("#clrForm").onclick = () => { S.conF = { ...f, form: "" }; renderShell(); };
  [["f1", "seg"], ["f2", "stage"], ["f3", "type"], ["f4", "owner"]].forEach(([id, k]) => $("#" + id).onchange = e => { S.conF = { ...f, [k]: e.target.value }; renderShell(); });
  $("#newC").onclick = () => openContact(null);
  $$("tbody tr", el).forEach(tr => tr.onclick = () => openContact(tr.dataset.id));
}

const C_FIELDS = [
  ["Contacto", [["name", "Nombre"], ["phone", "WhatsApp", "tel"], ["email", "Correo", "email"], ["cargo", "Cargo"]]],
  ["Empresa", [["company", "Hotel / empresa"], ["city", "Ciudad"], ["segment", "Segmento", SEGMENTS], ["type", "Tipo", ["Prospecto", "Cliente"]],
    ["docType", "Tipo de documento", ["CC", "NIT", "CE"]], ["docId", "Cédula / NIT"], ["address", "Dirección", "wide"]]],
  ["Venta", [["pipeline", "Embudo", "pipes"], ["stage", "Etapa", "stages"], ["temperature", "Temperatura", TEMPS], ["potential", "Potencial", ["Alto", "Medio", "Bajo"]], ["level", "Nivel", ["3", "2", "1", "0", "-1"]],
    ["owner", "Responsable", "team"], ["reorderDays", "Recompra cada (días)", "num"], ["tags", "Etiquetas (separadas por coma)", "tags"], ["looking", "Qué busca", "wide"]]],
  ["Seguimiento", [["nextDate", "Próx. seguimiento", "date"], ["nextAction", "Qué hacer"], ["obs", "Observaciones", "textarea"]]],
];
function openContact(id) {
  const c = id ? byId(S.contacts, id) : { stage: "Nuevo", type: "Prospecto", segment: "Hoteles", owner: S.me.name };
  if (id && !c) return toast("Ese contacto ya no existe.");
  const m = $("#modal");
  const field = ([k, label, t]) => {
    const v = t === "tags" ? (c[k] || []).join(", ") : c[k] ?? "";
    if (t === "pipes") {
      if (pipes().length < 2) return "";
      return `<div><label class="lb" for="cf_${k}">${label}</label><select class="in" id="cf_${k}" data-k="${k}">${pipes().map(p => `<option value="${p.id}" ${pipeOf(c).id === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>`;
    }
    if (Array.isArray(t) || t === "team" || t === "stages") {
      const opts = t === "team" ? ownerOptions() : t === "stages" ? stagesOf(c) : t;
      return `<div><label class="lb" for="cf_${k}">${label}</label><select class="in" id="cf_${k}" data-k="${k}"><option value="">—</option>${[...new Set([...opts, ...(v && !opts.includes(String(v)) ? [String(v)] : [])])].map(o => `<option ${String(v) === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
    }
    if (t === "textarea") return `<div class="full"><label class="lb" for="cf_${k}">${label}</label><textarea class="in" id="cf_${k}" data-k="${k}" rows="3">${esc(v)}</textarea></div>`;
    return `<div class="${t === "wide" ? "full" : ""}"><label class="lb" for="cf_${k}">${label}</label><input class="in" id="cf_${k}" data-k="${k}" type="${["tel", "email", "date"].includes(t) ? t : t === "num" ? "number" : "text"}" value="${esc(v)}"></div>`;
  };
  const extra = c.extra && Object.keys(c.extra).length ? `<fieldset class="fs"><legend>Datos del Excel (${esc(c.sourceSheet || "")})</legend><div class="grid2">${Object.entries(c.extra).map(([k, v]) => `<div><label class="lb">${esc(k)}</label><div>${esc(v)}</div></div>`).join("")}</div></fieldset>` : "";
  const qs = id ? S.quotes.filter(q => q.contactId === id) : [];
  m.innerHTML = `<form id="cform"><div class="mh"><h2>${id ? esc(contactName(c)) : "Nuevo contacto"}</h2>
      ${id && waLink(c.phone) ? `<a class="btn sm" href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      ${id ? `<button class="btn sm" type="button" id="cconv">Conversación</button><button class="btn sm" type="button" id="cquote">Nueva cotización</button>` : ""}
      <button class="iconbtn" type="button" id="cx" aria-label="Cerrar">✕</button></div>
    <div class="mb">${id && c.updatedAt ? `<small class="muted">Última modificación: ${fmtDT(c.updatedAt)}${c.updatedBy ? " · por " + esc(c.updatedBy) : ""}</small>` : ""}
      ${C_FIELDS.map(([g, fs]) => `<fieldset class="fs"><legend>${g}</legend><div class="grid2">${fs.map(field).join("")}</div></fieldset>`).join("")}
      ${(() => { const ri = id && reorderInfo(c); return ri ? `<fieldset class="fs"><legend>Reposición</legend><div>Última compra: <b>${fmtDate(new Date(ri.last).toISOString().slice(0, 10))}</b>${ri.items ? " · " + esc(ri.items) : ""}${ri.total ? " · " + money(ri.total) : ""}</div>
        <div>Próxima compra estimada: <b>${fmtDate(ri.dueIso)}</b> <span class="muted">(cada ${ri.days} días, ${esc(ri.how)})</span></div></fieldset>` : ""; })()}
      ${qs.length ? `<fieldset class="fs"><legend>Cotizaciones</legend>${qs.map(q => `<div><a href="#" data-q="${q.id}">${esc(q.number)}</a> · ${money(q.total)} · ${esc(q.status)} · <span class="muted">${fmtDT(q.createdAt)}</span></div>`).join("")}</fieldset>` : ""}
      ${extra}
      ${id ? `<fieldset class="fs"><legend>Historial</legend><div style="display:flex;gap:8px"><input class="in" id="cnoteIn" placeholder="Agregar nota: ej. llamé, pidió muestras"><button class="btn" type="button" id="cnoteAdd">Agregar</button></div><div class="lastmsgs" id="chist"><span class="muted">Cargando…</span></div></fieldset>` : ""}
    </div>
    <div class="mf">${id && isAdmin() ? '<button class="btn danger" type="button" id="cdel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="cc">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
  let unsub = null;
  if (id) unsub = fb.watch(`contacts/${id}/messages`, list => { const h = $("#chist"); if (h) { h.innerHTML = list.map(m => bubble(m)).join("") || '<span class="muted">Sin mensajes ni notas.</span>'; hydrateMedia(h); } }, { orderBy: ["ts", "desc"], limit: 50 });
  const close = () => { unsub && unsub(); m.close(); };
  m.onclose = () => { unsub && unsub(); };
  $("#cx").onclick = $("#cc").onclick = close;
  if ($("#cconv")) $("#cconv").onclick = () => { close(); go("conv", id); };
  if ($("#cquote")) $("#cquote").onclick = () => { close(); openQuote(null, id); };
  $$("[data-q]", m).forEach(a => a.onclick = e => { e.preventDefault(); close(); openQuote(a.dataset.q); });
  if ($("#cnoteAdd")) $("#cnoteAdd").onclick = async () => { const t = $("#cnoteIn").value.trim(); if (!t) return; await addNote(c, t); $("#cnoteIn").value = ""; };
  if ($("#cdel")) $("#cdel").onclick = async () => { if (!await ask("¿Eliminar a " + contactName(c) + "? No se puede deshacer.", "Eliminar")) return; await fb.remove("contacts/" + id); close(); toast("Contacto eliminado"); };
  $("#cform").onsubmit = async e => {
    e.preventDefault();
    const data = {};
    $$("[data-k]", m).forEach(i => data[i.dataset.k] = i.value.trim());
    data.tags = [...new Set((data.tags || "").split(",").map(t => t.trim()).filter(Boolean))];
    if (!data.name && !data.company) return toast("Escribe al menos el nombre o la empresa.");
    const pid = phoneId(data.phone);
    const dup = pid && S.contacts.find(x => x.id !== id && phoneId(x.phone) === pid);
    if (dup && !await ask(`Ese WhatsApp ya es de ${contactName(dup)}. ¿Guardar de todas formas?`, "Guardar igual")) return;
    try {
      if (id) { if (data.stage !== c.stage) data.stageAt = Date.now(); await fb.update("contacts/" + id, { ...data, ...stamp() }); }
      else {
        // Con teléfono, el id es el número: así los mensajes de WhatsApp llegan a la misma ficha
        const newId = pid && !S.contacts.some(x => x.id === "wa_" + pid) ? "wa_" + pid : fb.newId("contacts");
        await fb.set("contacts/" + newId, { ...data, createdAt: Date.now(), stageAt: Date.now(), unread: 0, ...stamp() }, false);
      }
      close(); toast(id ? "Cambios guardados" : "Contacto creado");
    } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
}

// ======================= Cotizaciones =======================
function viewCotizaciones(el) {
  const f = S.qF || "";
  const list = S.quotes.filter(q => !f || q.status === f);
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Cotizaciones</h1><span class="spacer"></span>${isAdmin() ? '<button class="btn" id="qbrand">Diseño del PDF</button>' : ""}<button class="btn primary" id="nq">+ Nueva cotización</button></div>
    <div class="toolbar"><select class="in" id="qf"><option value="">Todos los estados</option>${Q_STATUS.map(s => `<option ${f === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Número</th><th>Cliente</th><th class="num">Total</th><th>Estado</th><th>Creada</th><th>Por</th></tr></thead><tbody>
      ${list.map(q => `<tr data-id="${q.id}"><td class="mono">${esc(q.number)}</td><td>${esc(q.contactName)}</td><td class="num">${money(q.total)}</td><td>${statusPill(q.status)}</td><td>${fmtDT(q.createdAt)}</td><td>${esc(q.createdByName || "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><p>No hay cotizaciones${f ? " en ese estado" : ""}.</p></div>`}</div>`;
  $("#qf").onchange = e => { S.qF = e.target.value; renderShell(); };
  $("#nq").onclick = () => openQuote(null);
  if ($("#qbrand")) $("#qbrand").onclick = openQuoteBrand;
  $$("tbody tr", el).forEach(tr => tr.onclick = () => openQuote(tr.dataset.id));
}
// Datos de la empresa que salen en la cotización en PDF (settings/cotizacion)
async function openQuoteBrand() {
  const m = $("#modal");
  let d = {};
  try { d = (await fb.get("settings/cotizacion")) || {}; } catch { }
  const f = (k, l, ph = "", full) => `<div class="${full ? "full" : ""}"><label class="lb" for="qb_${k}">${l}</label><input class="in" id="qb_${k}" value="${esc(d[k] || "")}" placeholder="${esc(ph)}"></div>`;
  m.innerHTML = `<div class="mh"><h2>Diseño de la cotización en PDF</h2><button class="iconbtn" id="qbx" aria-label="Cerrar">✕</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 10px">La cotización sale en carta, con el logo de la casa, la marca de agua de ${esc(EMPRESA)} en el fondo y estos datos en el encabezado y el pie.</p>
      <div class="grid2">${f("nombre", "Nombre de la empresa", EMPRESA)}${f("lema", "Lema", "Textiles para el hogar y la hotelería")}${f("nit", "NIT", "901.234.567-8")}${f("telefono", "Teléfono", "+57 300 000 0000")}
        ${f("correo", "Correo", "ventas@casadorada.co")}${f("web", "Sitio web", "casadorada.co")}${f("direccion", "Dirección", "Medellín, Colombia", true)}
        <div class="full"><label class="lb" for="qb_condiciones">Condiciones (opcional)</label><textarea class="in" id="qb_condiciones" rows="4" placeholder="Si lo dejas vacío: validez, disponibilidad de inventario y que la entrega y el envío se confirman con la asesora.">${esc(d.condiciones || "")}</textarea></div></div></div>
    <div class="mf"><span class="spacer"></span><button class="btn" id="qbc">Cancelar</button><button class="btn primary" id="qbs">Guardar</button></div>`;
  $("#qbx").onclick = $("#qbc").onclick = () => m.close();
  $("#qbs").onclick = async () => {
    const data = Object.fromEntries(["nombre", "lema", "nit", "telefono", "correo", "web", "direccion", "condiciones"].map(k => [k, $("#qb_" + k).value.trim().slice(0, k === "condiciones" ? 1500 : 160)]));
    try { await fb.set("settings/cotizacion", { ...data, ...stamp() }); toast("Guardado: las próximas cotizaciones salen con estos datos"); m.close(); }
    catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
}
function statusPill(s) {
  const cls = { Borrador: "", Enviada: "blue", Aceptada: "amber", Rechazada: "red", Convertida: "green", Nuevo: "blue", "En preparación": "amber", Enviado: "gold", Entregado: "green", Cancelado: "red", Pendiente: "red", Abono: "amber", Pagado: "green" }[s] || "";
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}
function priceFor(p, qty) { return p && p.priceWholesale && p.minWholesale && qty >= p.minWholesale ? p.priceWholesale : (p ? p.priceRetail || 0 : 0); }
function quoteText(q) {
  return [`Cotización ${q.number || ""} · ${EMPRESA}`, `Cliente: ${q.contactName}`, "",
    ...q.items.map(i => `• ${i.qty} × ${i.name} — ${money(i.price)} c/u = ${money(i.qty * i.price)}`),
    q.discount ? `Descuento ${q.discount}%: -${money(q.subtotal * q.discount / 100)}` : "", `Total: ${money(q.total)}`,
    q.validUntil ? `Válida hasta el ${fmtDate(q.validUntil)}` : "", q.notes || ""].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();
}
function openQuote(id, contactId) {
  const q0 = id ? byId(S.quotes, id) : null;
  if (id && !q0) return toast("Esa cotización ya no existe.");
  const q = q0 ? JSON.parse(JSON.stringify(q0)) : { contactId: contactId || "", items: [{ productId: "", name: "", qty: 1, price: 0 }], discount: 0, status: "Borrador", validUntil: addDays(todayIso(), 15), notes: "" };
  const m = $("#modal"), prods = S.products.filter(p => p.active !== false);
  const locked = q.status === "Convertida";
  const calc = () => { q.subtotal = q.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.price) || 0), 0); q.total = Math.round(q.subtotal * (1 - (Number(q.discount) || 0) / 100)); };
  const draw = () => {
    calc();
    const c = byId(S.contacts, q.contactId);
    m.innerHTML = `<div class="mh"><h2>${q.number ? esc(q.number) : "Nueva cotización"} ${statusPill(q.status)}</h2><button class="iconbtn" id="qx" aria-label="Cerrar">✕</button></div>
      <div class="mb">
        <div class="grid2"><div class="full"><label class="lb" for="qc">Cliente</label><input class="in" id="qc" list="qcl" placeholder="Escribe el nombre" value="${esc(c ? contactName(c) + (c.company && c.name ? " · " + c.company : "") : "")}" ${locked ? "disabled" : ""}>
          <datalist id="qcl">${S.contacts.slice(0, 2000).map(x => `<option value="${esc(contactName(x) + (x.company && x.name ? " · " + x.company : ""))}">`).join("")}</datalist></div></div>
        <fieldset class="fs"><legend>Productos</legend>${listFor(c) ? `<p class="muted" style="margin:0 0 8px;font-size:13px">Este cliente tiene la lista <b>${esc(listFor(c).name)}</b>: los precios salen de ella.${listFor(c).minOrder ? " Pedido mínimo " + money(listFor(c).minOrder) + "." : ""}</p>` : ""}<div class="lines">
          ${q.items.map((it, i) => `<div class="line"><select class="in" data-i="${i}" data-f="productId" ${locked ? "disabled" : ""}><option value="">${it.name && !it.productId ? esc(it.name) : "Elige producto"}</option>${prods.map(p => `<option value="${p.id}" ${it.productId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
            <input class="in tabnum" type="number" min="1" data-i="${i}" data-f="qty" value="${it.qty}" aria-label="Cantidad" ${locked ? "disabled" : ""}>
            <input class="in tabnum" inputmode="numeric" data-i="${i}" data-f="price" value="${it.price}" aria-label="Precio unitario" ${locked ? "disabled" : ""}>
            <span class="tabnum" style="text-align:right">${money(it.qty * it.price)}</span>
            <button class="iconbtn x" data-del="${i}" aria-label="Quitar" ${locked ? "disabled" : ""}>✕</button></div>`).join("")}
          ${locked ? "" : '<button class="btn sm" id="qadd" style="justify-self:start">+ Agregar producto</button>'}
          ${prods.length ? "" : '<small class="muted">No tienes productos en el catálogo: agrégalos en Productos para elegirlos aquí.</small>'}</div></fieldset>
        <div class="grid2"><div><label class="lb" for="qd">Descuento %</label><input class="in" id="qd" type="number" min="0" max="100" value="${q.discount || 0}" ${locked ? "disabled" : ""}></div>
          <div><label class="lb" for="qv">Válida hasta</label><input class="in" id="qv" type="date" value="${esc(q.validUntil || "")}" ${locked ? "disabled" : ""}></div>
          <div class="full"><label class="lb" for="qn">Notas (entrega, forma de pago…)</label><textarea class="in" id="qn" rows="2" ${locked ? "disabled" : ""}>${esc(q.notes || "")}</textarea></div></div>
        <div class="totals"><span class="muted tabnum">Subtotal ${money(q.subtotal)}</span><b class="tabnum">Total ${money(q.total)}</b></div>
      </div>
      <div class="mf">${q0 && isAdmin() && !locked ? '<button class="btn danger" id="qdel">Eliminar</button>' : ""}<span class="spacer"></span>
        <button class="btn" id="qcopy">Copiar texto</button>
        ${q.id ? '<button class="btn" id="qpdf">Ver PDF</button>' : ""}
        ${q.id && c && canSend(c) && winInfo(c).open && q.status !== "Convertida" ? '<button class="btn primary" id="qpdfsend">📄 Enviar PDF por chat</button>' : ""}
        ${locked ? "" : `<button class="btn" id="qsave">Guardar</button>`}
        ${["Borrador"].includes(q.status) ? `<button class="btn ${q.id && c && canSend(c) && winInfo(c).open ? "" : "primary"}" id="qsent">Marcar enviada</button>` : ""}
        ${q.status === "Enviada" ? '<button class="btn" id="qrej">Rechazada</button><button class="btn primary" id="qacc">Aceptada</button>' : ""}
        ${q.status === "Aceptada" ? '<button class="btn primary" id="qorder">Convertir en pedido</button>' : ""}</div>`;
    const read = () => {
      const val = $("#qc").value.trim();
      const found = S.contacts.find(x => contactName(x) + (x.company && x.name ? " · " + x.company : "") === val) || S.contacts.find(x => norm(contactName(x)) === norm(val));
      if (found) q.contactId = found.id;
      q.discount = Number($("#qd").value) || 0; q.validUntil = $("#qv").value; q.notes = $("#qn").value.trim();
    };
    $("#qx").onclick = () => m.close();
    $$("[data-f]", m).forEach(inp => inp.onchange = () => {
      read(); const it = q.items[inp.dataset.i], f = inp.dataset.f;
      const lst = listFor(byId(S.contacts, q.contactId)), pr = (p, n) => { const lp = listPrice(p, n, lst); return lp !== null && lp < (p.priceRetail || Infinity) ? lp : priceFor(p, n); };
      if (f === "productId") { const p = byId(S.products, inp.value); it.productId = inp.value; it.name = p ? p.name : ""; it.price = p ? pr(p, it.qty) : 0; }
      else if (f === "qty") { it.qty = Math.max(1, Number(inp.value) || 1); const p = byId(S.products, it.productId); if (p) it.price = pr(p, it.qty); }
      else it.price = num(inp.value);
      draw();
    });
    $$("[data-del]", m).forEach(b => b.onclick = () => { read(); q.items.splice(b.dataset.del, 1); if (!q.items.length) q.items.push({ productId: "", name: "", qty: 1, price: 0 }); draw(); });
    if ($("#qadd")) $("#qadd").onclick = () => { read(); q.items.push({ productId: "", name: "", qty: 1, price: 0 }); draw(); };
    $("#qd").oninput = () => { read(); calc(); $(".totals", m).innerHTML = `<span class="muted tabnum">Subtotal ${money(q.subtotal)}</span><b class="tabnum">Total ${money(q.total)}</b>`; };
    const save = async (patch = {}) => {
      if (!locked) read();
      const c = byId(S.contacts, q.contactId);
      if (!c) { toast("Elige un cliente de la lista."); return false; }
      q.items = q.items.filter(i => i.name && i.qty > 0);
      if (!q.items.length) { toast("Agrega al menos un producto."); q.items.push({ productId: "", name: "", qty: 1, price: 0 }); draw(); return false; }
      calc();
      Object.assign(q, patch, { contactName: contactName(c) });
      const data = { contactId: q.contactId, contactName: q.contactName, items: q.items, subtotal: q.subtotal, discount: q.discount, total: q.total, status: q.status,
        validUntil: q.validUntil, notes: q.notes, ...stamp() };
      if (q.sentAt) data.sentAt = q.sentAt;
      try {
        if (!q.id) {
          const n = await fb.nextNumber("quotes");
          q.number = "COT-" + String(n).padStart(4, "0"); q.id = fb.newId("quotes");
          await fb.set("quotes/" + q.id, { ...data, number: q.number, createdAt: Date.now(), createdBy: S.user.uid, createdByName: S.me.name }, false);
        } else await fb.update("quotes/" + q.id, data);
        const first = q.items[0];
        const cpatch = { chosenProduct: { id: first.productId || "", name: first.name, price: first.price, desc: (byId(S.products, first.productId) || {}).desc || "" }, ...stamp() };
        if (patch.status === "Enviada" && ["Nuevo", "Contactado", "Catálogo enviado"].includes(c.stage || "Nuevo")) Object.assign(cpatch, { stage: "Cotización enviada", stageAt: Date.now() });
        if (patch.status === "Aceptada") Object.assign(cpatch, { stage: "Negociación", stageAt: Date.now() });
        await fb.update("contacts/" + c.id, cpatch);
        return true;
      } catch (er) { toast("No se pudo guardar: " + errMsg(er)); return false; }
    };
    $("#qcopy").onclick = async () => { if (!locked) read(); calc(); const c = byId(S.contacts, q.contactId); copy(quoteText({ ...q, contactName: contactName(c) })); };
    if ($("#qsave")) $("#qsave").onclick = async () => { if (await save()) { toast("Cotización " + q.number + " guardada"); draw(); } };
    if ($("#qpdf")) $("#qpdf").onclick = async () => {
      const w = window.open("", "_blank"); // se abre antes de esperar: Safari bloquea ventanas abiertas después de un await
      try { if (!locked && !await save()) { if (w) w.close(); return; } const r = await fb.call("enviarCotizacion", { quoteId: q.id, action: "link" }); if (w) w.location = r.url; else location.href = r.url; }
      catch (er) { if (w) w.close(); toast("No se pudo abrir el PDF: " + errMsg(er)); }
    };
    if ($("#qpdfsend")) $("#qpdfsend").onclick = async () => {
      const c = byId(S.contacts, q.contactId);
      if (!locked && !await save()) return;
      $("#qpdfsend").disabled = true;
      try { await fb.call("enviarCotizacion", { quoteId: q.id, action: "send" }); toast(`Cotización ${q.number} enviada en PDF a ${contactName(c)}`); q.status = q.status === "Borrador" ? "Enviada" : q.status; m.close(); }
      catch (er) { $("#qpdfsend").disabled = false; toast(errMsg(er) === "VENTANA_CERRADA" ? "Pasaron más de 24 h: WhatsApp no deja enviar el PDF hasta que el cliente vuelva a escribir." : "No se pudo enviar: " + errMsg(er)); }
    };
    if ($("#qsent")) $("#qsent").onclick = async () => {
      if (!await save({ status: "Enviada", sentAt: Date.now() })) return;
      const c = byId(S.contacts, q.contactId), text = quoteText(q);
      draw();
      if (canSend(c) && winInfo(c).open && await ask(`¿Enviar la cotización por ${CHN[chOf(c)].label} ahora?`, "Enviar", "No, ya la envié")) await sendText(c, text);
      else if (!canSend(c) && waLink(c.phone) && await ask("Cotización marcada como enviada. ¿Abrir WhatsApp con el texto listo?", "Abrir WhatsApp", "No")) { window.open(waLink(c.phone, text), "_blank"); await logOutbound(c, text, "Cotización"); }
      else toast("Cotización " + q.number + " marcada como enviada");
    };
    if ($("#qacc")) $("#qacc").onclick = async () => { if (await save({ status: "Aceptada", acceptedAt: Date.now() })) { toast("Aceptada: ahora conviértela en pedido"); draw(); } };
    if ($("#qrej")) $("#qrej").onclick = async () => { if (await save({ status: "Rechazada" })) { toast("Cotización rechazada"); draw(); } };
    if ($("#qorder")) $("#qorder").onclick = async () => { if (await save()) { m.close(); quoteToOrder(q); } };
    if ($("#qdel")) $("#qdel").onclick = async () => { if (!await ask("¿Eliminar la cotización " + q.number + "?", "Eliminar")) return; await fb.remove("quotes/" + q.id); m.close(); };
  };
  draw();
  m.showModal();
}
async function quoteToOrder(q) {
  if (!q) return;
  if (!await ask(`¿Crear el pedido de la cotización ${q.number} por ${money(q.total)}?`, "Crear pedido")) return;
  try {
    const n = await fb.nextNumber("orders"), number = "PED-" + String(n).padStart(4, "0");
    await fb.add("orders", { number, quoteId: q.id, quoteNumber: q.number, contactId: q.contactId, contactName: q.contactName, items: q.items, total: q.total,
      status: "Nuevo", payment: "Pendiente", notes: q.notes || "", createdAt: Date.now(), createdBy: S.user.uid, createdByName: S.me.name, ...stamp() });
    await fb.update("quotes/" + q.id, { status: "Convertida", orderNumber: number, ...stamp() });
    const c = byId(S.contacts, q.contactId);
    if (c) await fb.update("contacts/" + c.id, { stage: "Ganado", stageAt: Date.now(), type: "Cliente", lastPurchaseAt: Date.now(), totalPurchased: fb.inc(q.total || 0), ...stamp() });
    toast("Pedido " + number + " creado");
  } catch (er) { toast("No se pudo crear el pedido: " + errMsg(er)); }
}

// ======================= Agenda =======================
function viewAgenda(el) {
  const t = todayIso(), mineOnly = S.agMine;
  const list = S.contacts.filter(c => c.nextDate && isoRe.test(c.nextDate) && !c.archived && (!mineOnly || c.owner === S.me.name))
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const groups = [["Vencidos", c => c.nextDate < t], ["Hoy", c => c.nextDate === t], ["Mañana", c => c.nextDate === addDays(t, 1)],
    ["Esta semana", c => c.nextDate > addDays(t, 1) && c.nextDate <= addDays(t, 7)], ["Más adelante", c => c.nextDate > addDays(t, 7)]];
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Agenda</h1><span class="sub">Seguimientos programados</span><span class="spacer"></span>
      <label class="pill"><input type="checkbox" id="agm" ${mineOnly ? "checked" : ""}> Solo los míos</label></div>
    ${list.length ? groups.map(([g, f]) => { const xs = list.filter(f); return xs.length ? `<h3 class="${g === "Vencidos" ? "late" : ""}" style="margin:22px 0 8px">${g} <span class="muted tabnum">${xs.length}</span></h3>
      <div class="table-wrap"><table class="t"><tbody>${xs.slice(0, 200).map(c => `<tr data-id="${c.id}"><td class="tabnum" style="width:120px;${g === "Vencidos" ? "color:var(--red);font-weight:600" : ""}">${fmtDate(c.nextDate)}</td>
        <td><b>${esc(contactName(c))}</b>${c.company && c.name ? ` <span class="muted">· ${esc(c.company)}</span>` : ""}</td><td>${esc(c.nextAction || "Seguimiento")}</td><td class="muted">${esc(c.owner || "")}</td></tr>`).join("")}</tbody></table></div>` : ""; }).join("")
      : `<div class="empty"><p>No hay seguimientos programados.</p><p>Usa "Recordar en…" en Hoy o la fecha de próximo seguimiento en la ficha del contacto.</p></div>`}${icsBlock()}</div>`;
  $("#agm").onchange = e => { S.agMine = e.target.checked; renderShell(); };
  bindIcs();
  $$("tbody tr", el).forEach(tr => tr.onclick = () => openContact(tr.dataset.id));
}

// ======================= Avisos de reposición =======================
function viewReposicion(el) {
  const all = S.contacts.map(c => ({ c, ri: reorderInfo(c) })).filter(x => x.ri && (!S.rpMine || x.c.owner === S.me.name)).sort((a, b) => a.ri.due - b.ri.due);
  const showAll = S.rpAll, list = showAll ? all : all.filter(x => x.ri.inDays <= 7);
  const tpl = tplFor("reponer");
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Avisos de reposición</h1><span class="sub tabnum">${all.filter(x => x.ri.inDays < 0).length} vencidos · ${all.filter(x => x.ri.inDays >= 0 && x.ri.inDays <= 7).length} esta semana</span></div>
    <div class="toolbar"><div class="seg"><button class="${showAll ? "" : "on"}" data-all="0">Vencidos y próximos 7 días</button><button class="${showAll ? "on" : ""}" data-all="1">Todos los clientes (${all.length})</button></div>
      <label class="pill"><input type="checkbox" id="rpm" ${S.rpMine ? "checked" : ""}> Solo los míos</label></div>
    <p class="muted" style="max-width:80ch;margin:0 0 12px">La próxima compra se calcula con la fecha de su última compra (pedidos del CRM o "Fecha última compra" del Excel) más cada cuánto compra: lo que pongas en la ficha en "Recompra cada (días)", la frecuencia del Excel, el promedio entre sus pedidos o ${DEFAULT_REORDER} días por defecto. Los avisos de los próximos 7 días también salen en Hoy.</p>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Última compra</th><th>Compró</th><th class="num">Valor</th><th>Próxima compra</th><th>Responsable</th><th></th></tr></thead><tbody>
      ${list.map(({ c, ri }) => { const msg = fillTpl(tpl.text, c, { ultimo: ri.items || "tu último pedido", dias: String(Math.round((Date.now() - ri.last) / DAY)) }); return `<tr data-id="${c.id}">
        <td><b>${esc(contactName(c))}</b>${c.company && c.name ? `<div class="muted" style="font-size:13px">${esc(c.company)}</div>` : ""}</td>
        <td class="tabnum">${fmtDate(new Date(ri.last).toISOString().slice(0, 10))}</td><td title="${esc(ri.items)}" style="max-width:200px">${esc(ri.items || "—")}</td><td class="num">${ri.total ? money(ri.total) : ""}</td>
        <td title="${esc(fmtDate(ri.dueIso) + " · " + ri.how)}"><span class="pill ${ri.inDays < 0 ? "red" : ri.inDays <= 7 ? "amber" : ""}">${ri.inDays < 0 ? "vencido hace " + -ri.inDays + " d" : ri.inDays === 0 ? "hoy" : "en " + ri.inDays + " d"}</span><div class="muted" style="font-size:12px">compra cada ${ri.days} días</div></td>
        <td>${esc(c.owner || "")}</td>
        <td style="white-space:nowrap">${waLink(c.phone) ? `<a class="btn sm" href="${waLink(c.phone, msg)}" target="_blank" rel="noopener" data-wa="${c.id}">WhatsApp</a>` : ""} <button class="btn sm" data-done="${c.id}" data-due="${ri.dueIso}">Ya lo contacté</button></td></tr>`; }).join("")}
      </tbody></table></div>`
      : `<div class="empty"><p><b>${showAll ? "Todavía no hay clientes con compras registradas." : "Nadie necesita reponer esta semana."}</b></p><p>Aparecen aquí los clientes con una última compra conocida: los pedidos del CRM y los hoteles activos importados del Excel.</p></div>`}</div>`;
  $$("[data-all]", el).forEach(b => b.onclick = () => { S.rpAll = b.dataset.all === "1"; renderShell(); });
  $("#rpm").onchange = e => { S.rpMine = e.target.checked; renderShell(); };
  $$("tbody tr", el).forEach(tr => tr.onclick = e => { if (e.target.closest("a,button")) return; openContact(tr.dataset.id); });
  $$("[data-wa]", el).forEach(a => a.onclick = () => { const c = byId(S.contacts, a.dataset.wa); logOutbound(c, decodeURIComponent((a.href.split("text=")[1] || "")), "Reposición"); });
  $$("[data-done]", el).forEach(b => b.onclick = async () => {
    const c = byId(S.contacts, b.dataset.done);
    const d = await promptText("¿Cuándo vuelves a contactar a " + contactName(c) + " si no compra?", addDays(todayIso(), 7), "", "date");
    if (d === null) return;
    await fb.update("contacts/" + c.id, { [`done.${safeKey("reponer:" + b.dataset.due)}`]: Date.now(), ...(d ? { nextDate: d, nextAction: "Seguimiento de reposición" } : {}), ...stamp() });
    toast("Listo");
  });
}

// ======================= Métricas =======================
const RANGES = { mes: "Este mes", pasado: "Mes pasado", d90: "Últimos 90 días", anio: "Este año", todo: "Todo" };
function rangeOf(k) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  if (k === "mes") return [new Date(y, m, 1).getTime(), Infinity];
  if (k === "pasado") return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()];
  if (k === "d90") return [Date.now() - 90 * DAY, Infinity];
  if (k === "anio") return [new Date(y, 0, 1).getTime(), Infinity];
  return [0, Infinity];
}
const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
// Barras horizontales: etiqueta, barra y valor escrito (se lee sin depender del color)
function hbars(rows, fmt = money, sub) {
  const max = Math.max(1, ...rows.map(r => r.v));
  return rows.length ? `<div class="hbars">${rows.map(r => `<div class="hbar" data-tip="${esc(r.k)}: ${esc(fmt(r.v))}${sub ? " · " + esc(sub(r)) : ""}">
      <span class="hk" title="${esc(r.k)}">${esc(r.k)}</span><span class="ht"><span class="hf" style="width:${r.v ? Math.max(1.5, r.v / max * 100) : 0}%"></span></span>
      <span class="hv tabnum">${esc(fmt(r.v))}${sub ? `<small>${esc(sub(r))}</small>` : ""}</span></div>`).join("")}</div>`
    : '<p class="muted">Sin datos en este periodo.</p>';
}
// ======================= Anuncios =======================
// Qué anuncio trae más ventas: cada conversación que llegó desde un anuncio (Click to WhatsApp, Instagram, Messenger)
// guarda en el contacto `ad` (el anuncio que lo trajo). Se cruza con cotizaciones, pedidos y lo que hizo la asesora.
function adStats(rk) {
  const [a, b] = rangeOf(rk), inR = t => (t || 0) >= a && (t || 0) < b;
  const ordersBy = {}, quotesBy = new Set();
  S.orders.forEach(o => { if (o.status !== "Cancelado" && o.contactId) (ordersBy[o.contactId] = ordersBy[o.contactId] || []).push(o); });
  S.quotes.forEach(q => q.contactId && q.status !== "Borrador" && quotesBy.add(q.contactId));
  const rows = {};
  const key = c => (c.ad ? (c.ad.id || c.ad.headline || "?") : "_organico");
  for (const c of S.contacts) {
    const t = c.ad ? c.ad.at : c.createdAt;
    if (!inR(t)) continue;
    const k = key(c), r = rows[k] || (rows[k] = { k, ad: c.ad || null, conv: 0, ia: 0, cot: 0, cierreIA: 0, ventas: 0, ingresos: 0, list: [] });
    const os = ordersBy[c.id] || [], won = os.length > 0 || c.stage === "Ganado";
    r.conv++; r.list.push(c);
    if (c.aiHandledTs) r.ia++;
    if (quotesBy.has(c.id)) r.cot++;
    if (c.aiClosedAt) r.cierreIA++;
    if (won) { r.ventas++; r.ingresos += os.reduce((s, o) => s + (o.total || 0), 0); }
  }
  return Object.values(rows).sort((p, q) => (p.k === "_organico") - (q.k === "_organico") || q.ventas - p.ventas || q.ingresos - p.ingresos || q.conv - p.conv);
}
function viewAnuncios(el) {
  const rk = S.adRange || "d90", rows = adStats(rk), ads = rows.filter(r => r.k !== "_organico"), org = rows.find(r => r.k === "_organico");
  const sum = f => ads.reduce((s, r) => s + r[f], 0);
  const best = ads.filter(r => r.ventas || r.conv).sort((p, q) => q.ventas - p.ventas || q.ingresos - p.ingresos || q.conv - p.conv)[0];
  const chName = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };
  const sp = (S.adSpend || {})[AD_PRESET[rk] || "last_90d"] || { ads: {} };
  const spendCols = r => { if (!(S.ads && S.ads.on)) return ""; const x = r.ad && sp.ads[r.ad.id]; return x ? `<td class="num tabnum">${money(x.spend)}</td><td class="num tabnum"><b>${x.spend ? (r.ingresos / x.spend).toFixed(1) + "×" : "—"}</b></td>` : '<td class="num muted">—</td><td class="num muted">—</td>'; };
  const row = r => `<tr data-ad="${esc(r.k)}"><td><div class="ad-cell">${r.ad && r.ad.thumb ? `<img src="${esc(r.ad.thumb)}" alt="" loading="lazy">` : `<span class="ad-ph">${icon("anuncios")}</span>`}
      <div><b>${esc(r.ad ? r.ad.headline || "Anuncio " + (r.ad.id || "") : "Sin anuncio (orgánico)")}</b>${r === best ? ' <span class="pill green">🏆 El que más vende</span>' : ""}
      <small class="muted">${r.ad ? esc(chName[r.ad.channel] || r.ad.channel || "") + (r.ad.id ? " · " + esc(r.ad.id) : "") : "Clientes que escribieron sin pasar por un anuncio"}</small></div></div></td>
    <td class="num">${r.conv}</td><td class="num">${r.ia}</td><td class="num">${r.cot}</td><td class="num">${r.cierreIA}</td><td class="num"><b>${r.ventas}</b></td>
    <td class="num">${pct(r.ventas, r.conv)}</td><td class="num tabnum"><b>${money(r.ingresos)}</b></td>${spendCols(r)}</tr>`;
  el.innerHTML = `<div class="page" style="max-width:1200px"><div class="page-head"><div><h1>Anuncios</h1><span class="sub">Qué anuncios traen conversaciones y ventas, y cuáles llevó ${esc(aiName())} hasta el cierre.</span></div><span class="spacer"></span>
      <div class="seg" role="group" aria-label="Periodo">${Object.entries(RANGES).map(([k, t]) => `<button class="${k === rk ? "on" : ""}" data-r="${k}">${t}</button>`).join("")}</div></div>
    ${isAdmin() ? pautaBlock(rk, rows) : ""}
    <div class="tiles">
      <div class="tile"><small>Conversaciones por anuncios</small><b>${sum("conv")}</b><span>${ads.length} ${ads.length === 1 ? "anuncio" : "anuncios"}</span></div>
      <div class="tile"><small>Atendidas por ${esc(aiName())}</small><b>${sum("ia")}</b><span>${pct(sum("ia"), sum("conv"))} de las conversaciones</span></div>
      <div class="tile"><small>Llevadas al cierre por ${esc(aiName())}</small><b>${sum("cierreIA")}</b><span>listas para pagar y enviar</span></div>
      <div class="tile"><small>Ventas por anuncios</small><b>${sum("ventas")}</b><span>${pct(sum("ventas"), sum("conv"))} de conversión</span></div>
      <div class="tile money"><small>Ingresos por anuncios</small><b class="mono">${money(sum("ingresos"))}</b><span>${org ? "orgánico: " + money(org.ingresos) : ""}</span></div>
    </div>
    ${ads.length ? `<div class="table-wrap"><table class="t ad-t"><thead><tr><th>Anuncio</th><th class="num">Conversaciones</th><th class="num">Atendidas por IA</th><th class="num">Cotizaciones</th><th class="num">IA llevó al cierre</th><th class="num">Ventas</th><th class="num">Conversión</th><th class="num">Ingresos</th>${S.ads && S.ads.on ? '<th class="num">Inversión</th><th class="num">Retorno</th>' : ""}</tr></thead>
      <tbody>${rows.map(row).join("")}</tbody></table></div>`
      : `<div class="empty"><p><b>Todavía no hay conversaciones que vengan de anuncios en este periodo.</b></p><p>Cuando alguien te escriba desde un anuncio de Facebook o Instagram (con el botón de WhatsApp, Messenger o Instagram), aparecerá aquí con el anuncio que lo trajo. Los anuncios anteriores a hoy no traen este dato.</p></div>`}
    <p class="muted" style="font-size:12.5px">Una venta es un pedido (no cancelado) o un contacto en Ganado. "IA llevó al cierre": ${esc(aiName())} dejó el cliente listo para pagar y lo pasó al equipo.</p></div>`;
  $$("[data-r]", el).forEach(b => b.onclick = () => { S.adRange = b.dataset.r; renderShell(); });
  bindPauta(el);
  $$("[data-ad]", el).forEach(tr => tr.onclick = () => {
    const r = rows.find(x => x.k === tr.dataset.ad), m = $("#modal");
    m.innerHTML = `<div class="mh"><h2>${esc(r.ad ? r.ad.headline || "Anuncio" : "Sin anuncio")}</h2><button class="iconbtn" id="adx" aria-label="Cerrar">✕</button></div>
      <div class="mb">${r.ad && r.ad.body ? `<p class="muted" style="margin:0 0 10px">${esc(r.ad.body)}</p>` : ""}${r.ad && r.ad.url ? `<p style="margin:0 0 10px"><a href="${esc(r.ad.url)}" target="_blank" rel="noopener">Ver el anuncio</a></p>` : ""}
        <div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Etapa</th><th>IA</th><th class="num">Compró</th></tr></thead><tbody>
        ${r.list.sort((p, q) => (q.lastInboundAt || 0) - (p.lastInboundAt || 0)).map(c => `<tr data-go-c="${c.id}"><td><b>${esc(contactName(c))}</b></td><td>${esc(c.stage || "Nuevo")}</td><td>${c.aiClosedAt ? "Llevó al cierre" : c.aiHandledTs ? "Atendió" : "—"}</td><td class="num">${S.orders.some(o => o.contactId === c.id && o.status !== "Cancelado") || c.stage === "Ganado" ? "✓" : ""}</td></tr>`).join("")}</tbody></table></div></div>`;
    $("#adx").onclick = () => m.close();
    $$("[data-go-c]", m).forEach(x => x.onclick = () => { m.close(); go("conv", x.dataset.goC); });
    m.showModal();
  });
}
// ======================= Comentarios y web: captación automática =======================
// Comentarios de Instagram y Facebook → respuesta pública + DM (reglas por palabra clave, settings/comentarios),
// y mensajes automáticos del chat web según la página que visita la persona (settings/channels.webFunnels).
const COM_ST = { respondido: ["green", "Respondido"], repetido: ["", "Ya se le había escrito"], "sin regla": ["", "Sin regla"], error: ["red", "Error"], "sin conexión": ["red", "Sin conexión"], recibido: ["", "Recibido"] };
const comName = c => c.channel === "instagram" ? "@" + (c.fromName || "usuario") : c.fromName || "Persona";
const soldC = c => S.orders.some(o => o.contactId === c.id && o.status !== "Cancelado") || c.stage === "Ganado";
function viewCaptacion(el) {
  const st = S.com || {}, rules = st.rules || [], log = S.comLog || [], ch = S.ch || {}, funnels = ch.webFunnels || [];
  const metaOn = !!(ch.messenger && ch.messenger.on), web = ch.web || {};
  const fromCom = S.contacts.filter(c => c.comment), fromWeb = S.contacts.filter(c => c.webFunnel);
  const dms = log.filter(l => l.dm).length;
  el.innerHTML = `<div class="page" style="max-width:1100px"><div class="page-head"><div><h1>Comentarios y web</h1><span class="sub">Responde solo los comentarios con un mensaje privado y saluda a quien visita tu página. Cuando la persona contesta, ${esc(aiName())} sigue la conversación.</span></div></div>
    <div class="tiles">
      <div class="tile"><small>Comentarios atendidos</small><b>${log.filter(l => l.status === "respondido").length}</b><span>de los últimos ${log.length} recibidos</span></div>
      <div class="tile"><small>Mensajes privados enviados</small><b>${dms}</b><span>${fromCom.length} respondieron y ya son chats</span></div>
      <div class="tile"><small>Chats desde la página web</small><b>${fromWeb.length}</b><span>${fromWeb.filter(soldC).length} compraron</span></div>
    </div>
    <h2 class="sec-t">Comentarios de Instagram y Facebook → mensaje privado</h2>
    ${metaOn ? (ch.messenger.comments === false ? `<div class="banner warn">Facebook no dio permiso para leer los comentarios. Revisa los pasos de abajo y vuelve a conectar la página en <a href="#canales">Canales</a>.</div>` : "")
      : `<div class="banner warn">Primero conecta Messenger e Instagram en <a href="#canales">Canales</a>.</div>`}
    <label class="switch" style="margin:6px 0 12px"><input type="checkbox" id="comOn" ${st.on !== false ? "checked" : ""}> <span>Responder comentarios automáticamente</span></label>
    <div style="display:grid;gap:10px">${rules.map((r, i) => { const s = (st.stats || {})[r.id] || {}; return `<div class="card rule-c" data-rule="${i}" style="padding:14px 16px;cursor:pointer">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(r.name || "Regla")}</b>${r.on === false ? '<span class="pill">Apagada</span>' : '<span class="pill green">Activa</span>'}
        <span class="pill">${r.keywords ? "Si dicen: " + esc(r.keywords) : "Cualquier comentario"}</span>${r.posts && r.posts.length ? `<span class="pill">${r.posts.length === 1 ? "1 publicación" : r.posts.length + " publicaciones"}</span>` : ""}
        <span class="spacer"></span><small class="muted">${s.n || 0} comentarios · ${s.dm || 0} DM</small></div>
      ${r.reply ? `<p class="muted" style="margin:6px 0 0"><b>Responde:</b> ${esc(r.reply.split("\n")[0])}${r.reply.includes("\n") ? " (y otras variantes)" : ""}</p>` : ""}
      ${r.dm ? `<p style="margin:4px 0 0;white-space:pre-wrap"><b>DM:</b> ${esc(r.dm)}</p>` : ""}</div>`; }).join("")
      || `<div class="empty"><p><b>Aún no tienes reglas.</b> Ejemplo: si comentan "precio", "info" o "cuánto", se responde "¡Te escribimos por DM! 💌" y se envía un mensaje privado.</p></div>`}</div>
    <div class="chrow" style="margin-top:10px"><button class="btn primary" id="newRule">+ Nueva regla</button>${!rules.length ? '<button class="btn" id="seedRule">Crear la regla de ejemplo</button>' : ""}</div>
    <details class="wa-api" style="margin-top:12px"><summary>Qué necesita Meta para los comentarios</summary><ol class="steps">
      <li>En tu app de Meta, el token de la página debe tener los permisos <code>pages_manage_engagement</code>, <code>pages_read_user_content</code>, <code>pages_manage_metadata</code> e <code>instagram_manage_comments</code>.</li>
      <li>En el webhook de la app suscribe el campo <b>feed</b> (Página) y el campo <b>comments</b> (Instagram), con la misma URL de los mensajes.</li>
      <li>Vuelve a conectar la página en <a href="#canales">Canales</a> con el token nuevo.</li>
      <li>Meta permite un solo mensaje privado por comentario y durante los 7 días siguientes. House Chat le escribe una sola vez a cada persona por publicación.</li></ol></details>
    <h3 style="margin:18px 0 8px">Últimos comentarios</h3>
    ${log.length ? `<div class="table-wrap"><table class="t com-t"><thead><tr><th>Cuándo</th><th>Persona</th><th>Comentario</th><th>Publicación</th><th>Resultado</th></tr></thead><tbody>
      ${log.slice(0, 60).map(l => { const [cl, tx] = COM_ST[l.status] || ["", l.status || ""]; const c = S.contacts.find(x => x.comment && x.id === (l.channel === "instagram" ? "ig_" : "fb_") + l.fromId);
        return `<tr><td class="muted" style="white-space:nowrap">${chIcon(l.channel)} ${ago(l.at)}</td><td>${c ? `<a href="#conv/${esc(c.id)}">${esc(comName(l))}</a>` : esc(comName(l))}</td><td>${esc(l.text)}</td>
        <td>${l.post && l.post.url ? `<a class="post-l" href="${esc(l.post.url)}" target="_blank" rel="noopener">${l.post.thumb ? `<img src="${esc(l.post.thumb)}" alt="" loading="lazy">` : ""}<span>${esc((l.post.caption || "Ver publicación").slice(0, 50))}</span></a>` : '<span class="muted">—</span>'}</td>
        <td><span class="pill ${cl}" title="${esc(l.replyError || l.dmError || l.dmSkipped || "")}">${tx}</span>${l.ruleName ? `<small class="muted" style="display:block">${esc(l.ruleName)}${l.dm ? " · DM enviado" : ""}</small>` : ""}${l.replyError || l.dmError ? `<small class="err" style="display:block">${esc(l.replyError || l.dmError)}</small>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<p class="muted">Cuando alguien comente tus publicaciones aparecerá aquí, con lo que se le respondió.</p>`}

    <h2 class="sec-t" style="margin-top:28px">Mensajes automáticos en tu página web</h2>
    ${web.on ? "" : `<div class="banner warn">El chat web está apagado. Actívalo y pega el código en tu página desde <a href="#canales">Canales</a>.</div>`}
    <p class="muted" style="max-width:75ch">Después de unos segundos en una página, la burbuja del chat saluda con un mensaje. Se muestra una sola vez a cada visitante, solo si aún no ha chateado. Si la persona responde, el chat entra a Conversaciones y ${esc(aiName())} continúa.</p>
    <div style="display:grid;gap:10px">${funnels.map((f, i) => { const cs = fromWeb.filter(c => c.webFunnel.id === f.id); return `<div class="card" data-fun="${i}" style="padding:14px 16px;cursor:pointer">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(f.name || "Mensaje")}</b>${f.on === false ? '<span class="pill">Apagado</span>' : '<span class="pill green">Activo</span>'}
        <span class="pill">${f.match ? "Páginas con: " + esc(f.match) : "Todas las páginas"}</span><span class="pill">a los ${Number(f.delay) || 0} s</span>
        <span class="spacer"></span><small class="muted">${cs.length} chats · ${cs.filter(soldC).length} ventas</small></div>
      <p style="margin:6px 0 0;white-space:pre-wrap">${esc(f.text)}</p></div>`; }).join("")
      || `<div class="empty"><p><b>Aún no hay mensajes automáticos.</b> Ejemplo: en las páginas de sábanas, a los 8 segundos: "¿Buscas sábanas? Dime la medida de tu cama y te muestro las opciones 😊".</p></div>`}</div>
    <div class="chrow" style="margin-top:10px"><button class="btn primary" id="newFun">+ Nuevo mensaje automático</button></div></div>`;
  $("#comOn").onchange = async e => { try { await fb.set("settings/comentarios", { on: e.target.checked }); toast(e.target.checked ? "Respuestas a comentarios activadas" : "Respuestas a comentarios apagadas"); } catch (er) { toast("No se pudo guardar: " + errMsg(er)); } };
  $("#newRule").onclick = () => openComRule(-1);
  if ($("#seedRule")) $("#seedRule").onclick = () => fb.set("settings/comentarios", { on: true, rules: [{ id: "r" + Date.now().toString(36), name: "Piden precio o información", on: true, channels: [], posts: [], keywords: "precio, info, cuanto, valor, costo, disponible, medidas",
    reply: "¡Hola {nombre}! Te escribimos por mensaje privado 💌\n¡Ya te enviamos la información por DM! 😊\n¡Revisa tus mensajes {nombre}! 💌", dm: "¡Hola {nombre}! 😊 Gracias por comentar. Te cuento con gusto: ¿para qué medida de cama lo buscas?" }] }).then(() => toast("Regla creada"));
  $$("[data-rule]", el).forEach(d => d.onclick = () => openComRule(+d.dataset.rule));
  $("#newFun").onclick = () => openFunnel(-1);
  $$("[data-fun]", el).forEach(d => d.onclick = () => openFunnel(+d.dataset.fun));
}
function openComRule(i) {
  const rules = [...((S.com || {}).rules || [])], r = i >= 0 ? rules[i] : { on: true, channels: [], posts: [] }, m = $("#modal");
  // Publicaciones recientes vistas en los comentarios, para limitar la regla a algunas
  const posts = new Map();
  (S.comLog || []).forEach(l => { if (l.postId && !posts.has(l.postId)) posts.set(l.postId, l); });
  (r.posts || []).forEach(p => { if (!posts.has(p)) posts.set(p, { postId: p }); });
  m.innerHTML = `<form id="rf"><div class="mh"><h2>${i >= 0 ? "Regla de comentarios" : "Nueva regla"}</h2><button class="iconbtn" type="button" id="rx" aria-label="Cerrar">✕</button></div>
    <div class="mb"><div class="grid2">
      <div><label class="lb" for="rn">Nombre</label><input class="in" id="rn" required value="${esc(r.name || "")}" placeholder="Piden precio"></div>
      <div><label class="lb">Dónde</label><div class="chrow"><label class="switch sm"><input type="checkbox" id="rig" ${!r.channels.length || r.channels.includes("instagram") ? "checked" : ""}> <span>Instagram</span></label>
        <label class="switch sm"><input type="checkbox" id="rfb" ${!r.channels.length || r.channels.includes("messenger") ? "checked" : ""}> <span>Facebook</span></label></div></div>
      <div class="full"><label class="lb" for="rk">Palabras que activan la regla (separadas por coma)</label><input class="in" id="rk" value="${esc(r.keywords || "")}" placeholder="precio, info, cuánto, valor"><small class="muted">Déjalo vacío para responder cualquier comentario. No importan las mayúsculas ni las tildes.</small></div>
      <div class="full"><label class="lb">Publicaciones</label>${posts.size ? `<div class="post-pick"><label class="switch sm"><input type="radio" name="rp" value="all" ${!r.posts.length ? "checked" : ""}> <span>Todas</span></label>
        ${[...posts.values()].slice(0, 12).map(p => `<label class="post-o"><input type="checkbox" value="${esc(p.postId)}" ${r.posts.includes(p.postId) ? "checked" : ""}>${p.post && p.post.thumb ? `<img src="${esc(p.post.thumb)}" alt="">` : ""}<span>${esc((p.post && p.post.caption || "Publicación " + p.postId).slice(0, 60))}</span></label>`).join("")}</div>`
        : `<p class="muted" style="margin:4px 0">Todas. Cuando lleguen comentarios podrás elegir publicaciones específicas.</p>`}</div>
      <div class="full"><label class="lb" for="rr">Respuesta pública al comentario (una por línea: se elige una al azar)</label><textarea class="in" id="rr" rows="3" placeholder="¡Hola {nombre}! Te escribimos por DM 💌">${esc(r.reply || "")}</textarea></div>
      <div class="full"><label class="lb" for="rd">Mensaje privado (DM)</label><textarea class="in" id="rd" rows="4" placeholder="¡Hola {nombre}! Gracias por comentar 😊 ¿Para qué medida de cama lo buscas?">${esc(r.dm || "")}</textarea>
        <small class="muted">{nombre} se cambia por el primer nombre en Facebook (en Instagram se omite). Termina con una pregunta: así la persona responde y ${esc(aiName())} sigue la conversación.</small></div>
      <label class="switch sm full"><input type="checkbox" id="ron" ${r.on !== false ? "checked" : ""}> <span>Regla activa</span></label></div></div>
    <div class="mf">${i >= 0 ? '<button class="btn danger" type="button" id="rdel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="rc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`;
  $("#rx").onclick = $("#rc").onclick = () => m.close();
  $$(".post-o input", m).forEach(x => x.onchange = () => { const all = $("[name=rp]", m); if (all) all.checked = !$$(".post-o input:checked", m).length; });
  if ($("[name=rp]", m)) $("[name=rp]", m).onchange = e => { if (e.target.checked) $$(".post-o input", m).forEach(x => { x.checked = false; }); };
  if ($("#rdel")) $("#rdel").onclick = async () => { if (!await ask("¿Eliminar esta regla?", "Eliminar")) return; rules.splice(i, 1); await fb.set("settings/comentarios", { rules }); m.close(); };
  $("#rf").onsubmit = async e => {
    e.preventDefault();
    const chans = [$("#rig").checked && "instagram", $("#rfb").checked && "messenger"].filter(Boolean);
    if (!chans.length) return toast("Elige Instagram, Facebook o ambos.");
    const data = { id: r.id || "r" + Date.now().toString(36), name: $("#rn").value.trim(), on: $("#ron").checked, channels: chans.length === 2 ? [] : chans,
      keywords: $("#rk").value.trim(), posts: $$(".post-o input:checked", m).map(x => x.value), reply: $("#rr").value.trim(), dm: $("#rd").value.trim() };
    if (!data.reply && !data.dm) return toast("Escribe la respuesta pública, el mensaje privado o ambos.");
    if (i >= 0) rules[i] = data; else rules.push(data);
    try { await fb.set("settings/comentarios", { rules, ...(S.com && "on" in S.com ? {} : { on: true }) }); m.close(); toast("Regla guardada"); } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
}
function openFunnel(i) {
  const list = [...((S.ch || {}).webFunnels || [])], f = i >= 0 ? list[i] : { on: true, delay: 8 }, m = $("#modal");
  m.innerHTML = `<form id="ff"><div class="mh"><h2>${i >= 0 ? "Mensaje automático" : "Nuevo mensaje automático"}</h2><button class="iconbtn" type="button" id="fx" aria-label="Cerrar">✕</button></div>
    <div class="mb"><div class="grid2">
      <div><label class="lb" for="fn">Nombre</label><input class="in" id="fn" required value="${esc(f.name || "")}" placeholder="Visitantes de sábanas"></div>
      <div><label class="lb" for="fd">Mostrar a los (segundos)</label><input class="in" id="fd" type="number" min="2" max="600" value="${Number(f.delay) || 8}"></div>
      <div class="full"><label class="lb" for="fm">En las páginas cuya dirección contiene</label><input class="in" id="fm" value="${esc(f.match || "")}" placeholder="/collections/sabanas"><small class="muted">Vacío = todas las páginas. Si varias aplican, se usa la primera de la lista.</small></div>
      <div class="full"><label class="lb" for="ft">Mensaje</label><textarea class="in" id="ft" rows="3" maxlength="500" required placeholder="¿Buscas sábanas? Dime la medida de tu cama y te muestro las opciones 😊">${esc(f.text || "")}</textarea></div>
      <label class="switch sm full"><input type="checkbox" id="fon" ${f.on !== false ? "checked" : ""}> <span>Activo</span></label></div></div>
    <div class="mf">${i >= 0 ? '<button class="btn danger" type="button" id="fdel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="fc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`;
  $("#fx").onclick = $("#fc").onclick = () => m.close();
  if ($("#fdel")) $("#fdel").onclick = async () => { if (!await ask("¿Eliminar este mensaje automático?", "Eliminar")) return; list.splice(i, 1); await fb.set("settings/channels", { webFunnels: list }); m.close(); };
  $("#ff").onsubmit = async e => {
    e.preventDefault();
    const data = { id: f.id || "f" + Date.now().toString(36), name: $("#fn").value.trim(), delay: Math.max(2, Math.min(600, +$("#fd").value || 8)), match: $("#fm").value.trim(), text: $("#ft").value.trim(), on: $("#fon").checked };
    if (i >= 0) list[i] = data; else list.push(data);
    try { await fb.set("settings/channels", { webFunnels: list }); m.close(); toast("Mensaje automático guardado"); } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
}

// ======================= Carritos, Oportunidades y Cartera =======================
const D = DAY;
const winOpen = c => !!c && Date.now() - (c.lastInboundAt || 0) < D; // ventana de 24 h de WhatsApp: se escribe gratis y sin plantilla
// ---- Carritos abandonados ----
const CART_ST = { abierto: ["", "Sin recordar"], recordado: ["amber", "Recordado"], recuperado: ["green", "Recuperado"] };
function viewCarritos(el) {
  const cfg = S.cartCfg || {}, carts = [...(S.carts || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const f = S.cartF || "pend", sh = (S.apps || {}).shopify || {};
  const byC = id => S.contacts.find(c => c.id === id);
  const open = carts.filter(c => c.status !== "recuperado"), rec = carts.filter(c => c.status === "recuperado" && (c.recoveredAt || 0) > Date.now() - 30 * D);
  const list = f === "pend" ? open : f === "rec" ? carts.filter(c => c.status === "recuperado") : carts;
  const tpls = S.templates.filter(t => t.waName);
  el.innerHTML = `<div class="page" style="max-width:1100px"><div class="page-head"><div><h1>Carritos abandonados</h1><span class="sub">Compras que quedaron sin pagar en tu tienda de Shopify.</span></div><span class="spacer"></span>
      <button class="btn" id="cartSync">Traer carritos de Shopify</button></div>
    <div class="tiles">
      <div class="tile"><small>Sin recuperar</small><b>${open.length}</b><span class="tabnum">${money(open.reduce((s, c) => s + (c.total || 0), 0))} en juego</span></div>
      <div class="tile"><small>Puedes escribirles gratis hoy</small><b>${open.filter(c => winOpen(byC(c.contactId))).length}</b><span>con la ventana de 24 h abierta</span></div>
      <div class="tile money"><small>Recuperados (30 días)</small><b>${rec.length}</b><span class="tabnum">${money(rec.reduce((s, c) => s + (c.orderTotal || c.total || 0), 0))} · ${rec.filter(c => c.afterReminder).length} después del recordatorio</span></div>
    </div>
    ${sh.cartsError ? `<div class="banner warn">${esc(sh.cartsError)}</div>` : ""}
    <section class="card" style="padding:16px 18px;margin-bottom:16px"><div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px">
      <b>Recordatorio automático por WhatsApp</b><p class="muted" style="margin:4px 0 0">Una hora después de que alguien deja el carrito, ${esc(aiName())} le escribe con lo que dejó y el enlace para terminar la compra, de 8 a. m. a 8 p. m. y una sola vez. Si contesta, la conversación sigue en Conversaciones.</p></div>
      <label class="switch"><input type="checkbox" id="cartAuto" ${cfg.auto ? "checked" : ""}> <span>${cfg.auto ? "Encendido" : "Apagado"}</span></label></div>
      <div class="grid2" style="margin-top:12px">
        <div class="full"><label class="lb" for="cartTxt">Mensaje (cuando la ventana de 24 h está abierta)</label><textarea class="in" id="cartTxt" rows="3">${esc(cfg.text || "Hola {nombre} 😊 Vimos que dejaste {producto} en tu carrito. Si te quedó alguna duda te ayudo con gusto. Puedes terminar tu compra aquí: {enlace}")}</textarea>
          <small class="muted">Campos: {nombre}, {producto}, {total}, {enlace}.</small></div>
        <div><label class="lb" for="cartTpl">Plantilla de WhatsApp (cuando la ventana está cerrada)</label><select class="in" id="cartTpl"><option value="">Sin plantilla: solo a quien tenga la ventana abierta</option>
          ${tpls.map(t => `<option value="${t.id}" ${cfg.templateId === t.id ? "selected" : ""}>${esc(t.name)}${t.waStatus && t.waStatus !== "APPROVED" ? " (" + esc(WA_ST[t.waStatus] || t.waStatus) + ")" : ""}</option>`).join("")}</select>
          <small class="muted">¿No tienes? <a href="#plantillas">Créala en Plantillas</a> con los campos {nombre}, {producto} y {enlace}. Meta cobra cada envío de plantilla.</small></div>
        <div><label class="switch sm" style="margin-top:22px"><input type="checkbox" id="cartAll" ${cfg.toAll ? "checked" : ""}> <span>Enviarlo también a quien no ha dado permiso</span></label>
          <small class="muted" style="display:block">Solo a quien dejó su celular en la tienda. Nunca a quien pidió no recibir mensajes. Ojo: Meta puede marcarlo como spam y bajar la calidad de tu número.</small></div>
        <div class="full chrow"><button class="btn primary" id="cartSave">Guardar</button></div></div></section>
    <div class="seg" role="group" aria-label="Filtro" style="margin-bottom:12px">${[["pend", "Por recuperar"], ["rec", "Recuperados"], ["all", "Todos"]].map(([k, t]) => `<button class="${f === k ? "on" : ""}" data-cf="${k}">${t}</button>`).join("")}</div>
    ${list.length ? `<div style="display:grid;gap:10px">${list.slice(0, 150).map(c => { const ct = byC(c.contactId), [cl, tx] = CART_ST[c.status] || ["", c.status]; return `<div class="card cart-c" style="padding:14px 16px">
      <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:220px"><b>${esc(c.name || (ct && contactName(ct)) || c.email || c.phone || "Cliente")}</b>
        <div class="muted" style="font-size:13.5px">${esc(c.items.map(i => i.name + (i.qty > 1 ? " ×" + i.qty : "")).join(", ").slice(0, 160))}</div>
        <small class="muted">Abandonado ${ago(c.createdAt)}${c.phone ? " · " + esc(c.phone) : ""}${c.email ? " · " + esc(c.email) : ""}${c.reminderError ? ` · <span class="err">${esc(c.reminderError)}</span>` : ""}</small></div>
        <div style="text-align:right"><b class="tabnum">${money(c.total)}</b><div style="margin-top:4px"><span class="pill ${cl}">${tx}</span>${!c.phone ? ' <span class="pill">Solo correo</span>' : ct && winOpen(ct) ? ' <span class="pill green">Ventana abierta</span>' : ""}</div></div></div>
      <div class="chrow" style="margin-top:8px">${ct ? `<button class="btn sm" data-chat="${esc(ct.id)}">Abrir chat</button>` : ""}${c.url ? `<button class="btn sm" data-copy="${esc(c.url)}">Copiar enlace</button>` : ""}
        ${c.status !== "recuperado" && c.phone ? `<button class="btn sm primary" data-remind="${esc(c.id)}">${c.remindedAt ? "Recordar otra vez" : "Enviar recordatorio"}</button>` : ""}</div></div>`; }).join("")}</div>`
      : `<div class="empty"><p><b>${f === "rec" ? "Aún no hay carritos recuperados." : "No hay carritos por recuperar."}</b></p><p>Llegan con el webhook de Shopify <i>Creación de pago (checkout)</i>. Con el permiso <code>read_orders</code> en tu app de Shopify también se traen los de los últimos 30 días.</p></div>`}</div>`;
  $$("[data-cf]", el).forEach(b => b.onclick = () => { S.cartF = b.dataset.cf; renderShell(); });
  $$("[data-chat]", el).forEach(b => b.onclick = () => go("conv", b.dataset.chat));
  $$("[data-copy]", el).forEach(b => b.onclick = () => copy(b.dataset.copy));
  $("#cartAuto").onchange = e => fb.set("settings/carritos", { auto: e.target.checked }).then(() => toast(e.target.checked ? "Recordatorio automático encendido" : "Recordatorio automático apagado")).catch(er => toast(errMsg(er)));
  $("#cartSave").onclick = () => fb.set("settings/carritos", { text: $("#cartTxt").value.trim(), templateId: $("#cartTpl").value, toAll: $("#cartAll").checked }).then(() => toast("Guardado")).catch(er => toast(errMsg(er)));
  $("#cartSync").onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = "Trayendo…";
    try { const r = await fb.call("carritos", { action: "sincronizar" }); toast(typeof r.out === "string" ? r.out : `${r.out.carritos} carritos nuevos`); } catch (er) { toast(errMsg(er)); } finally { b.disabled = false; b.textContent = "Traer carritos de Shopify"; } };
  $$("[data-remind]", el).forEach(b => b.onclick = async () => { b.disabled = true;
    try { const r = await fb.call("carritos", { action: "recordar", id: b.dataset.remind }); toast(r.out === "recordado" ? "Recordatorio enviado" : r.out); } catch (er) { toast(errMsg(er)); b.disabled = false; } });
}

// ---- Cartera: lo que falta por cobrar de cada pedido y sus abonos ----
const TERMS = ["Todo antes", "Anticipo y saldo", "Contra entrega", "Crédito"];
const PAY_METHODS = ["Transferencia", "Nequi", "Daviplata", "Efectivo", "Tarjeta", "Contra entrega", "Otro"];
const paidOf = o => (o.payments || []).length ? o.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) : o.payment === "Pagado" ? o.total || 0 : 0;
const balanceOf = o => Math.max(0, (o.total || 0) - paidOf(o));
const owes = o => o.status !== "Cancelado" && o.payment !== "Pagado" && balanceOf(o) > 0;
function viewCartera(el) {
  const f = S.carF || "cobrar", today = new Date().toLocaleDateString("en-CA");
  const all = S.orders.filter(o => o.status !== "Cancelado"), due = all.filter(owes);
  const waiting = due.filter(o => ["Todo antes", "Anticipo y saldo"].includes(o.terms) && !paidOf(o) && ["Nuevo", "En preparación"].includes(o.status));
  const shipped = due.filter(o => ["Enviado", "Entregado"].includes(o.status));
  const list = f === "cobrar" ? due : f === "pagadas" ? all.filter(o => !owes(o)) : all;
  el.innerHTML = `<div class="page" style="max-width:1100px"><div class="page-head"><div><h1>Cartera</h1><span class="sub">Lo que te deben: cuánto ya pagaron, cuánto falta y en qué va cada pedido.</span></div></div>
    <div class="tiles"><div class="tile money"><small>Por cobrar</small><b class="tabnum">${money(due.reduce((s, o) => s + balanceOf(o), 0))}</b><span>en ${due.length} pedido${due.length === 1 ? "" : "s"}</span></div>
      <div class="tile"><small>Esperando anticipo o pago para empezar</small><b>${waiting.length}</b><span class="tabnum">${money(waiting.reduce((s, o) => s + balanceOf(o), 0))}</span></div>
      <div class="tile"><small>Ya despachado o entregado: hay que cobrarlo</small><b class="tabnum">${money(shipped.reduce((s, o) => s + balanceOf(o), 0))}</b><span>${shipped.length} pedido${shipped.length === 1 ? "" : "s"}</span></div></div>
    <div class="seg" role="group" aria-label="Filtro" style="margin-bottom:12px">${[["cobrar", "Por cobrar"], ["pagadas", "Pagadas"], ["todas", "Todas"]].map(([k, t]) => `<button class="${f === k ? "on" : ""}" data-kf="${k}">${t}</button>`).join("")}</div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Pedido</th><th>Cliente</th><th>Forma de pago</th><th>Estado</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Falta</th><th></th></tr></thead><tbody>
      ${list.slice(0, 200).map(o => { const late = o.dueDate && o.dueDate < today && owes(o); return `<tr data-oid="${o.id}"><td class="mono">${esc(o.number)}</td><td>${esc(o.contactName)}</td><td>${esc(o.terms || (o.source === "Shopify" ? "Tienda" : "—"))}${o.dueDate ? `<small class="${late ? "err" : "muted"}" style="display:block">${late ? "Vencido" : "Vence"} ${esc(o.dueDate)}</small>` : ""}</td>
        <td>${statusPill(o.status)}</td><td class="num tabnum">${money(o.total)}</td><td class="num tabnum">${money(paidOf(o))}</td><td class="num tabnum"><b>${money(balanceOf(o))}</b></td>
        <td class="num">${owes(o) ? `<button class="btn sm" data-pay="${o.id}">Registrar pago</button>` : '<span class="pill green">Pagado</span>'}</td></tr>`; }).join("")}</tbody></table></div>`
      : `<div class="empty"><p><b>${f === "cobrar" ? "No hay nada por cobrar." : "No hay pedidos aquí."}</b></p><p>Cada pedido aparece aquí mientras le falte pago. En el pedido eliges la forma de pago (todo antes, anticipo y saldo, contra entrega o crédito) y registras los abonos.</p></div>`}</div>`;
  $$("[data-kf]", el).forEach(b => b.onclick = () => { S.carF = b.dataset.kf; renderShell(); });
  $$("[data-pay]", el).forEach(b => b.onclick = e => { e.stopPropagation(); openPayment(b.dataset.pay); });
  $$("[data-oid]", el).forEach(tr => tr.onclick = () => openOrder(tr.dataset.oid));
}
function openPayment(id) {
  const o = byId(S.orders, id), m = $("#modal"), bal = balanceOf(o);
  m.innerHTML = `<form id="payf"><div class="mh"><h2>Pago de ${esc(o.number)}</h2><button class="iconbtn" type="button" id="payx" aria-label="Cerrar">✕</button></div>
    <div class="mb"><p class="muted" style="margin:0 0 10px">${esc(o.contactName)} · total ${money(o.total)} · pagado ${money(paidOf(o))} · <b>falta ${money(bal)}</b></p>
      ${(o.payments || []).length ? `<div class="table-wrap" style="margin-bottom:10px"><table class="t"><thead><tr><th>Fecha</th><th>Medio</th><th class="num">Valor</th></tr></thead><tbody>${o.payments.map(p => `<tr><td>${esc(p.date || "")}</td><td>${esc(p.method || "")}${p.note ? ` <small class="muted">${esc(p.note)}</small>` : ""}</td><td class="num tabnum">${money(p.amount)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="grid2"><div><label class="lb" for="pya">Valor recibido</label><input class="in" id="pya" type="number" min="1" step="1" required value="${bal}"></div>
        <div><label class="lb" for="pym">Medio</label><select class="in" id="pym">${PAY_METHODS.map(x => `<option>${x}</option>`).join("")}</select></div>
        <div><label class="lb" for="pyd">Fecha</label><input class="in" id="pyd" type="date" value="${new Date().toLocaleDateString("en-CA")}"></div>
        <div><label class="lb" for="pyn">Nota (opcional)</label><input class="in" id="pyn" placeholder="Comprobante, referencia…"></div></div></div>
    <div class="mf"><span class="spacer"></span><button class="btn" type="button" id="payc">Cancelar</button><button class="btn primary">Registrar pago</button></div></form>`;
  $("#payx").onclick = $("#payc").onclick = () => m.close();
  $("#payf").onsubmit = async e => {
    e.preventDefault();
    const p = { amount: Math.round(+$("#pya").value || 0), method: $("#pym").value, date: $("#pyd").value, note: $("#pyn").value.trim(), by: S.me.name || "", at: Date.now() };
    if (p.amount <= 0) return toast("Escribe el valor recibido.");
    // Si antes estaba como Pagado/Abono sin abonos registrados, lo ya pagado no se conoce: se parte de cero
    const payments = [...(o.payments || []), p], paid = payments.reduce((s, x) => s + x.amount, 0);
    try { await fb.update("orders/" + id, { payments, payment: paid >= (o.total || 0) ? "Pagado" : "Abono", ...stamp() }); m.close(); toast(paid >= (o.total || 0) ? "Pedido pagado ✓" : `Abono registrado · falta ${money((o.total || 0) - paid)}`); }
    catch (er) { toast(errMsg(er)); }
  };
  m.showModal();
}

// ---- Oportunidades: ventas que todavía se pueden cerrar, recuperar o reactivar ----
function opportunities() {
  const now = Date.now(), out = [], byC = id => S.contacts.find(c => c.id === id);
  const boughtSince = (cid, t) => S.orders.some(o => o.contactId === cid && o.status !== "Cancelado" && (o.createdAt || 0) > t);
  // 1) Pedido sin pago
  S.orders.filter(o => o.status === "Nuevo" && (o.payment || "Pendiente") === "Pendiente" && !(o.payments || []).length && now - (o.createdAt || now) > D && now - (o.createdAt || 0) < 30 * D)
    .forEach(o => out.push({ k: "pedido", c: byC(o.contactId), name: o.contactName, value: o.total, at: o.createdAt, why: `Pedido ${o.number} sin pago desde ${ago(o.createdAt)}`, open: () => openOrder(o.id) }));
  // 2) Carritos abandonados (solo la administradora los ve)
  (S.carts || []).filter(c => c.status !== "recuperado" && now - (c.createdAt || 0) < 7 * D)
    .forEach(c => out.push({ k: "carrito", c: byC(c.contactId), name: c.name, value: c.total, at: c.createdAt, why: `Dejó el carrito ${ago(c.createdAt)}${c.remindedAt ? " · ya se le recordó" : ""}` }));
  // 3) Cotización enviada sin respuesta
  S.quotes.filter(q => q.status === "Enviada" && now - (q.createdAt || now) > 2 * D && now - (q.createdAt || 0) < 45 * D && !boughtSince(q.contactId, q.createdAt || 0))
    .forEach(q => out.push({ k: "cotizacion", c: byC(q.contactId), name: q.contactName, value: q.total, at: q.createdAt, why: `Cotización ${q.number} enviada ${ago(q.createdAt)} sin respuesta` }));
  S.contacts.forEach(c => {
    if (c.archived || c.optOut) return;
    // 4) Escribió y nadie le respondió
    if (c.lastMessageDir === "in" && now - (c.lastInboundAt || now) > 2 * H && now - (c.lastInboundAt || 0) < 3 * D)
      out.push({ k: "sinrespuesta", c, name: contactName(c), value: (c.chosenProduct && c.chosenProduct.price) || 0, at: c.lastInboundAt, why: `Escribió ${ago(c.lastInboundAt)} y nadie le respondió` });
    // 5) Mostró interés y se enfrió
    else if (!["Ganado", "Perdido"].includes(c.stage || "Nuevo") && c.lastInboundAt && now - c.lastInboundAt > D && now - c.lastInboundAt < 10 * D && !boughtSince(c.id, c.lastInboundAt - 30 * D) && (c.chosenProduct || c.looking || c.temperature === "Caliente"))
      out.push({ k: "frio", c, name: contactName(c), value: (c.chosenProduct && c.chosenProduct.price) || 0, at: c.lastInboundAt, why: `Preguntó por ${(c.chosenProduct && c.chosenProduct.name) || c.looking || "un producto"} y no ha vuelto a escribir desde ${ago(c.lastInboundAt)}` });
    // 6) Clientes para volver a comprar
    if (c.lastPurchaseAt && now - c.lastPurchaseAt > 60 * D && now - c.lastPurchaseAt < 365 * D && now - Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0) > 30 * D)
      out.push({ k: "recompra", c, name: contactName(c), value: 0, at: c.lastPurchaseAt, why: `Compró hace ${Math.round((now - c.lastPurchaseAt) / D)} días y no le hemos escrito` });
  });
  return out.filter(o => o.c || o.k === "carrito");
}
const OPP = { pedido: ["Pedidos sin cerrar", "Hubo pedido y no hubo pago: la venta más fácil de recuperar."], carrito: ["Carritos abandonados", "Llegaron hasta el pago en la tienda."],
  cotizacion: ["Cotizaciones sin respuesta", "Se envió la cotización y el cliente no ha dicho nada."], sinrespuesta: ["Escribieron y nadie les respondió", "Cada hora sin respuesta baja la probabilidad de venta."],
  frio: ["Interesados que se enfriaron", "Preguntaron por un producto y no volvieron."], recompra: ["Para volver a comprar", "Clientes que ya compraron hace más de 2 meses."] };
function viewOportunidades(el) {
  const ops = opportunities(), now = Date.now();
  const rec = (S.carts || []).filter(c => c.status === "recuperado" && now - (c.recoveredAt || 0) < 30 * D);
  const won = S.quotes.filter(q => q.status === "Convertida" && now - (q.updatedAt || q.createdAt || 0) < 30 * D);
  const reach = ops.filter(o => o.c && winOpen(o.c)).length;
  el.innerHTML = `<div class="page" style="max-width:1100px"><div class="page-head"><div><h1>Oportunidades</h1><span class="sub">Lo que todavía puedes cerrar, recuperar o volver a activar, ordenado por lo más urgente.</span></div></div>
    ${proofsBlock()}
    <div class="tiles"><div class="tile"><small>Oportunidades abiertas</small><b>${ops.length}</b><span class="tabnum">${money(ops.reduce((s, o) => s + (o.value || 0), 0))} en juego</span></div>
      <div class="tile"><small>Puedes escribirles gratis ahora</small><b>${reach}</b><span>ventana de 24 h abierta</span></div>
      <div class="tile money"><small>Recuperado en 30 días</small><b class="tabnum">${money(rec.reduce((s, c) => s + (c.orderTotal || c.total || 0), 0) + won.reduce((s, q) => s + (q.total || 0), 0))}</b><span>${rec.length} carritos · ${won.length} cotizaciones convertidas</span></div></div>
    ${Object.entries(OPP).map(([k, [t, d]]) => { const l = ops.filter(o => o.k === k).sort((a, b) => (b.value || 0) - (a.value || 0) || (b.at || 0) - (a.at || 0)); return l.length ? `<h2 class="sec-t">${t} <span class="pill">${l.length}</span></h2><p class="sec-s">${d}</p>
      <div style="display:grid;gap:8px;margin-bottom:18px">${l.slice(0, 30).map((o, i) => `<div class="card opp" style="padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:220px"><b>${esc(o.name || "Cliente")}</b><div class="muted" style="font-size:13.5px">${esc(o.why)}</div></div>
        ${o.value ? `<b class="tabnum">${money(o.value)}</b>` : ""}${o.c ? `<span class="pill ${winOpen(o.c) ? "green" : ""}">${winOpen(o.c) ? "Puedes escribir" : "Necesita plantilla"}</span>` : ""}
        ${o.c ? `<button class="btn sm primary" data-oc="${esc(o.c.id)}">Abrir chat</button>` : k === "carrito" ? '<a class="btn sm" href="#carritos">Ver carrito</a>' : ""}</div>`).join("")}</div>` : ""; }).join("")
      || `<div class="empty"><p><b>No hay oportunidades pendientes. ¡Todo al día!</b></p></div>`}</div>`;
  $$("[data-oc]", el).forEach(b => b.onclick = () => go("conv", b.dataset.oc));
  bindProofs(el);
}

// ======================= Precios mayoristas (listas de precios) y Venta cruzada =======================
// Igual que functions/listas.js: la lista del contacto (ficha o embudo) y el precio por unidad con escalones
const baseKey = name => norm(String(name || "").split(" · ")[0].split("|")[0]).trim();
const listFor = c => c ? ((S.priceLists || []).find(l => l.id === c.priceList) || (S.priceLists || []).find(l => (l.pipelines || []).includes(c.pipeline || "ventas")) || null) : null;
function listPrice(p, qty, list) {
  if (!p || !list) return null;
  const rules = list.rules || [];
  const rule = rules.find(r => r.scope === "producto" && (r.match === p.id || String(p.id).startsWith(r.match + "_") || baseKey(r.match) === baseKey(p.name)))
    || rules.find(r => r.scope === "categoria" && norm(r.match) && (norm(r.match) === norm(p.category) || baseKey(p.name).includes(norm(r.match))));
  const tier = rule && (rule.tiers || []).filter(t => qty >= (Number(t.min) || 1) && Number(t.price) > 0).sort((a, b) => b.min - a.min)[0];
  if (tier) return Math.round(Number(tier.price));
  if (Number(list.pct) > 0 && p.priceRetail) return Math.round(p.priceRetail * (1 - Math.min(90, Number(list.pct)) / 100));
  return null;
}
// Productos agrupados por nombre base (sin color ni medida)
const productGroups = () => { const m = new Map(); S.products.forEach(p => { const k = baseKey(p.name); if (k && !m.has(k)) m.set(k, { key: k, name: String(p.name).split(" · ")[0].split("|")[0].trim(), id: p.shopifyProductId ? "shp_" + p.shopifyProductId : p.id, category: p.category || "" }); }); return [...m.values()].sort((a, b) => a.name.localeCompare(b.name)); };
function viewListas(el) {
  const lists = S.priceLists || [];
  el.innerHTML = `<div class="page" style="max-width:1000px"><div class="page-head"><div><h1>Precios mayoristas</h1><span class="sub">Precios especiales para quien compra por volumen, como hoteles y distribuidores.</span></div><span class="spacer"></span><button class="btn primary" id="nList">+ Nueva lista</button></div>
    <div class="card" style="padding:14px 18px;margin-bottom:14px"><b>Cómo funciona</b><p class="muted" style="margin:4px 0 0">Creas una lista por tipo de cliente. Por ejemplo, en «Hoteles» pones 10% menos en todo y, en sábanas, $70.000 desde 20 unidades y $65.000 desde 50.
      Después la conectas a un embudo (por ejemplo, Hoteles) o a un cliente desde su ficha, y cuando le haces una cotización, tú o ${esc(aiName())}, esos precios salen solos. La tienda y los precios del chat siguen siendo los normales.</p></div>
    ${lists.length ? `<div class="promo-list">${lists.map(l => `<button class="promo-card" data-list="${l.id}"><div class="pc-h"><b>${esc(l.name)}</b></div>
      <div class="pc-c">${[l.pct ? l.pct + "% sobre la tienda" : "", (l.rules || []).length ? (l.rules.length === 1 ? "1 regla" : l.rules.length + " reglas") : "", l.minOrder ? "mínimo " + money(l.minOrder) : "", l.validDays ? "vale " + l.validDays + " días" : ""].filter(Boolean).join(" · ") || "Sin precios aún"}</div>
      <small class="muted">${(l.pipelines || []).length ? "Embudo: " + l.pipelines.map(id => esc((pipes().find(p => p.id === id) || {}).name || id)).join(", ") : "Sin embudo conectado"} · ${S.contacts.filter(c => listFor(c) && listFor(c).id === l.id).length} clientes</small></button>`).join("")}</div>`
      : `<div class="empty"><p><b>Aún no hay listas.</b> Si solo vendes al detal, no tienes que hacer nada aquí.</p></div>`}</div>`;
  $("#nList").onclick = () => openList(null);
  $$("[data-list]", el).forEach(b => b.onclick = () => openList(b.dataset.list));
}
function openList(id) {
  const l = id ? JSON.parse(JSON.stringify(byId(S.priceLists, id))) : { name: "", pct: 10, minOrder: 0, validDays: 15, pipelines: [], rules: [] }, m = $("#modal");
  const cats = [...new Set(S.products.map(p => p.category).filter(c => c && !/^(f[ií]sico|otros?)$/i.test(c)))].sort(), groups = productGroups();
  const read = () => {
    l.name = $("#ln").value.trim(); l.pct = Number(String($("#lp").value).replace(",", ".")) || 0; l.minOrder = num($("#lmin").value); l.validDays = Number($("#lv").value) || 15;
    l.pipelines = $$("[data-lpipe]:checked", m).map(x => x.dataset.lpipe);
    l.rules = $$(".lrule", m).map(r => ({ scope: $(".lr-s", r).value, match: $(".lr-m", r).value, tiers: $$(".lr-t", r).map(t => ({ min: Number($(".lt-min", t).value) || 1, price: num($(".lt-p", t).value) })).filter(t => t.price > 0) })).filter(r => r.match);
  };
  const ruleHtml = (r, i) => `<div class="lrule card" data-i="${i}"><div class="grid2"><div><label class="lb">Aplica a</label><select class="in lr-s"><option value="categoria" ${r.scope !== "producto" ? "selected" : ""}>Una categoría</option><option value="producto" ${r.scope === "producto" ? "selected" : ""}>Un producto</option></select></div>
      <div><label class="lb">Cuál</label><select class="in lr-m"><option value="">Elige…</option>${(r.scope === "producto" ? groups.map(g => [g.name, g.name]) : [...cats, "Sábanas", "Plumones", "Cobijas", "Almohadas", "Toallas", "Cortinas"].filter((x, j, a) => a.indexOf(x) === j).map(c => [c, c])).map(([v, t]) => `<option value="${esc(v)}" ${r.match === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div></div>
      <label class="lb" style="margin-top:8px">Precio por unidad según cantidad</label>${(r.tiers && r.tiers.length ? r.tiers : [{ min: 1, price: 0 }]).map(t => `<div class="lr-t chrow"><span class="muted">Desde</span><input class="in lt-min" type="number" min="1" value="${t.min || 1}" style="width:90px"><span class="muted">unidades:</span><input class="in lt-p tabnum" inputmode="numeric" value="${t.price || ""}" placeholder="$ por unidad" style="width:150px"></div>`).join("")}
      <div class="chrow"><button class="link" type="button" data-addtier="${i}">+ Otro escalón</button><span class="spacer"></span><button class="link danger" type="button" data-rmrule="${i}">Quitar regla</button></div></div>`;
  const draw = () => {
    m.innerHTML = `<form id="lf2"><div class="mh"><h2>${id ? "Lista de precios" : "Nueva lista de precios"}</h2><button class="iconbtn" type="button" id="lx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><div class="grid2"><div><label class="lb" for="ln">Nombre</label><input class="in" id="ln" required value="${esc(l.name)}" placeholder="Hoteles"></div>
        <div><label class="lb" for="lp">Descuento general sobre la tienda (%)</label><input class="in" id="lp" inputmode="decimal" value="${l.pct || ""}" placeholder="10"></div>
        <div><label class="lb" for="lmin">Pedido mínimo ($, opcional)</label><input class="in tabnum" id="lmin" inputmode="numeric" value="${l.minOrder || ""}"></div>
        <div><label class="lb" for="lv">La cotización vale (días)</label><input class="in" id="lv" type="number" min="1" value="${l.validDays || 15}"></div>
        <div class="full"><label class="lb">Se usa automáticamente en el embudo</label><div class="chrow">${pipes().map(p => `<label class="switch sm"><input type="checkbox" data-lpipe="${esc(p.id)}" ${(l.pipelines || []).includes(p.id) ? "checked" : ""}> <span>${esc(p.name)}</span></label>`).join("")}</div>
          <small class="muted">Todos los clientes de ese embudo tendrán estos precios al cotizar (ojo con conectar Ventas si ahí está el detal). También puedes asignarla a un cliente desde su ficha, en «Lista de precios».</small></div></div>
        <h3 style="margin:16px 0 6px">Precios especiales</h3><p class="muted" style="margin:0 0 8px">Lo que no tenga una regla usa el descuento general.</p>
        <div style="display:grid;gap:8px">${l.rules.map(ruleHtml).join("")}</div><button class="btn sm" type="button" id="laddr" style="margin-top:8px">+ Agregar regla</button></div>
      <div class="mf">${id ? '<button class="btn danger" type="button" id="ldel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="lc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`;
    $("#lx").onclick = $("#lc").onclick = () => m.close();
    $("#laddr").onclick = () => { read(); l.rules.push({ scope: "categoria", match: "", tiers: [{ min: 1, price: 0 }] }); draw(); };
    $$(".lr-s", m).forEach((s, i) => s.onchange = () => { read(); l.rules[i] = { ...(l.rules[i] || {}), scope: s.value, match: "" }; draw(); });
    $$("[data-addtier]", m).forEach(b => b.onclick = () => { read(); const r = l.rules[+b.dataset.addtier]; if (r) { r.tiers = [...(r.tiers || []), { min: ((r.tiers || []).slice(-1)[0] || {}).min * 2 || 20, price: 0 }]; } draw(); });
    $$("[data-rmrule]", m).forEach(b => b.onclick = () => { read(); l.rules.splice(+b.dataset.rmrule, 1); draw(); });
    if ($("#ldel")) $("#ldel").onclick = async () => { if (!await ask("¿Eliminar esta lista de precios?", "Eliminar")) return; await fb.remove("priceLists/" + id); m.close(); };
    $("#lf2").onsubmit = async e => { e.preventDefault(); read(); const data = { ...l, ...stamp() }; delete data.id;
      try { id ? await fb.set("priceLists/" + id, data, false) : await fb.add("priceLists", data); m.close(); toast("Lista guardada"); } catch (er) { toast(errMsg(er)); } };
  };
  draw(); m.showModal();
}

// ---- Venta cruzada: qué ofrece la asesora junto a cada producto ----
const COMPLEMENTS = [[/sabana|juego de cama/, /almohada|protector/], [/plumon|edredon|cubrelecho|tendido/, /sabana|cojin|pie de cama/], [/almohada/, /protector de almohada|funda/], [/colchon/, /protector|sabana/], [/cobija|manta/, /cojin|almohada/], [/cortina/, /cortina|tapete/], [/toalla/, /tapete|toalla/]];
function crossSuggestions() {
  const cfg = S.cross || {}, have = new Set([...(cfg.pairs || []).map(p => p.from + ">" + p.to), ...(cfg.dismissed || [])]);
  const groups = productGroups(), byKey = new Map(groups.map(g => [g.key, g])), score = new Map();
  // 1) Comprados juntos en pedidos reales
  S.orders.filter(o => o.status !== "Cancelado").forEach(o => {
    const ks = [...new Set((o.items || []).map(i => baseKey(i.name)).filter(k => byKey.has(k)))];
    ks.forEach(a => ks.forEach(b => { if (a !== b) { const k = a + ">" + b; score.set(k, { n: ((score.get(k) || {}).n || 0) + 1, why: "orders" }); } }));
  });
  // 2) Complementos lógicos del catálogo (sábanas → almohadas, plumón → sábanas…)
  groups.forEach(a => COMPLEMENTS.forEach(([fa, fb2]) => { if (!fa.test(a.key)) return; groups.filter(b => b.key !== a.key && fb2.test(b.key)).slice(0, 2).forEach(b => { const k = a.key + ">" + b.key; if (!score.has(k)) score.set(k, { n: 0, why: "catalog" }); }); }));
  return [...score.entries()].filter(([k]) => !have.has(k)).map(([k, v]) => { const [a, b] = k.split(">"); return { from: a, to: b, fromName: byKey.get(a).name, toName: byKey.get(b).name, ...v }; })
    .sort((x, y) => y.n - x.n || x.fromName.localeCompare(y.fromName)).slice(0, 40);
}
function viewVentaCruzada(el) {
  const cfg = S.cross || {}, pairs = cfg.pairs || [], sug = crossSuggestions();
  el.innerHTML = `<div class="page" style="max-width:1000px"><div class="page-head"><div><h1>Venta cruzada</h1><span class="sub">Qué ofrece ${esc(aiName())} junto a cada producto cuando el cliente ya va a comprar. Solo lo que aceptes llega a ${esc(aiName())}.</span></div><span class="spacer"></span><button class="btn" id="xAdd">+ Agregar pareja</button></div>
    <h2 class="sec-t">Activas <span class="pill">${pairs.length}</span></h2>
    ${pairs.length ? `<div style="display:grid;gap:8px;margin-bottom:18px">${pairs.map((p, i) => `<div class="card" style="padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:240px"><b>${esc(p.fromName)}</b> → <b>${esc(p.toName)}</b>${p.note ? `<small class="muted" style="display:block">${esc(p.note)}</small>` : ""}</div><button class="btn sm" data-xrm="${i}">Quitar</button></div>`).join("")}</div>`
      : `<p class="muted">Todavía no hay parejas activas: acepta las sugerencias de abajo o agrega una.</p>`}
    <h2 class="sec-t">Sugerencias por revisar <span class="pill">${sug.length}</span></h2><p class="sec-s">Salen de lo que tus clientes compran juntos y de los complementos naturales de tu catálogo.</p>
    ${sug.length ? `<div style="display:grid;gap:8px">${sug.map((s, i) => `<div class="card" style="padding:12px 16px"><div><b>${esc(s.fromName)}</b> → <b>${esc(s.toName)}</b> <span class="pill">Complemento (se ofrece al cerrar)</span></div>
      <small class="muted">${s.n ? `Comprados juntos ${s.n} ${s.n === 1 ? "vez" : "veces"} en pedidos reales` : "Complemento sugerido por el tipo de producto"}</small>
      <div class="chrow" style="margin-top:8px"><button class="btn sm primary" data-xok="${i}">Aceptar</button><button class="btn sm" data-xno="${i}">Descartar</button></div></div>`).join("")}</div>`
      : `<p class="muted">No hay sugerencias nuevas.</p>`}</div>`;
  const save = patch => fb.set("settings/ventaCruzada", patch).catch(er => toast(errMsg(er)));
  $$("[data-xok]", el).forEach(b => b.onclick = () => { const s = sug[+b.dataset.xok]; save({ pairs: [...pairs, { from: s.from, to: s.to, fromName: s.fromName, toName: s.toName }] }); });
  $$("[data-xno]", el).forEach(b => b.onclick = () => { const s = sug[+b.dataset.xno]; save({ dismissed: [...(cfg.dismissed || []), s.from + ">" + s.to].slice(-300) }); });
  $$("[data-xrm]", el).forEach(b => b.onclick = () => save({ pairs: pairs.filter((_, i) => i !== +b.dataset.xrm) }));
  $("#xAdd").onclick = () => {
    const g = productGroups(), m = $("#modal"), opts = g.map(x => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join("");
    m.innerHTML = `<form id="xf"><div class="mh"><h2>Nueva pareja</h2><button class="iconbtn" type="button" id="xx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><div class="grid2"><div><label class="lb" for="xa">Cuando compra</label><select class="in" id="xa" required>${opts}</select></div><div><label class="lb" for="xb">Ofrecer</label><select class="in" id="xb" required>${opts}</select></div>
        <div class="full"><label class="lb" for="xn">Nota para ${esc(aiName())} (opcional)</label><input class="in" id="xn" placeholder="Ej: con 10% si lo lleva en el mismo pedido"></div></div></div>
      <div class="mf"><span class="spacer"></span><button class="btn" type="button" id="xc">Cancelar</button><button class="btn primary">Agregar</button></div></form>`;
    $("#xx").onclick = $("#xc").onclick = () => m.close();
    $("#xf").onsubmit = e => { e.preventDefault(); const a = g.find(x => x.key === $("#xa").value), b2 = g.find(x => x.key === $("#xb").value);
      if (!a || !b2 || a.key === b2.key) return toast("Elige dos productos distintos.");
      save({ pairs: [...pairs, { from: a.key, to: b2.key, fromName: a.name, toName: b2.name, note: $("#xn").value.trim() }] }); m.close(); };
    m.showModal();
  };
}

// ======================= Inversión en pauta (dentro de Anuncios) =======================
const AD_PRESET = { mes: "this_month", pasado: "last_month", d90: "last_90d", anio: "this_year", todo: "maximum" };
const OBJ = { OUTCOME_SALES: "ventas", OUTCOME_ENGAGEMENT: "interacción", OUTCOME_AWARENESS: "reconocimiento", OUTCOME_TRAFFIC: "tráfico", OUTCOME_LEADS: "clientes potenciales", OUTCOME_APP_PROMOTION: "app", MESSAGES: "mensajes", CONVERSIONS: "conversiones", LINK_CLICKS: "clics", POST_ENGAGEMENT: "interacción", REACH: "alcance", VIDEO_VIEWS: "reproducciones" };
function pautaBlock(rk, rows) {
  const cfg = S.ads || {};
  if (!cfg.on) return `<section class="card" style="padding:16px 18px;margin-bottom:16px"><b>Conecta tu cuenta publicitaria para ver si la pauta da plata</b>
    <p class="muted" style="margin:4px 0 10px">Con lo que gastas en cada anuncio de Facebook e Instagram, House Chat te dice cuánto vuelve en ventas por cada peso y qué anuncios pausar o subir.</p>
    <form id="adsF" class="grid2"><div><label class="lb" for="adsAcc">Número de la cuenta publicitaria</label><input class="in" id="adsAcc" placeholder="act_1234567890 o 1234567890" autocomplete="off"></div>
      <div><label class="lb" for="adsTok">Token de acceso (permiso ads_read)</label><input class="in" id="adsTok" placeholder="EAAG…" autocomplete="off"></div>
      <div class="full chrow"><button class="btn primary">Conectar</button></div></form>
    <details class="wa-api"><summary>Dónde saco esos datos</summary><ol class="steps"><li>El número de la cuenta está en el <b>Administrador de anuncios</b>, arriba a la izquierda, junto al nombre de la cuenta.</li>
      <li>El token: en <b>business.facebook.com › Configuración › Usuarios del sistema</b>, elige tu usuario del sistema (el mismo de WhatsApp), toca <b>Generar token</b>, elige tu app y marca el permiso <code>ads_read</code>. Asigna la cuenta publicitaria a ese usuario.</li>
      <li>Pégalos aquí. El token queda guardado en el servidor y nadie del equipo lo puede ver.</li></ol></details></section>`;
  const sp = (S.adSpend || {})[AD_PRESET[rk] || "last_90d"] || { total: 0, ads: {} };
  const ads = rows.filter(r => r.k !== "_organico"), ventas = ads.reduce((s, r) => s + r.ingresos, 0);
  const [a, b] = rangeOf(rk), store = S.orders.filter(o => o.adSource && o.status !== "Cancelado" && (o.createdAt || 0) >= a && (o.createdAt || 0) < b);
  const storeRev = store.reduce((s, o) => s + (o.total || 0), 0), margin = Number(cfg.margin) || 25, be = 100 / margin;
  const roas = sp.total ? (ventas + storeRev) / sp.total : 0;
  const verdict = !sp.total ? null : roas >= be ? ["green", `Gana plata: vas en ${roas.toFixed(1)}× y necesitas ${be.toFixed(1)}×.`] : roas >= be * 0.7 ? ["amber", `Casi: vas en ${roas.toFixed(1)}× y necesitas ${be.toFixed(1)}×.`] : ["red", `Pierde plata: vas en ${roas.toFixed(1)}× y necesitas ${be.toFixed(1)}×.`];
  // Campañas que gastaron: si buscan ventas y si traen conversaciones
  const camps = {};
  Object.entries(sp.ads || {}).forEach(([id, x]) => { if (!x.spend) return; const c = camps[x.campaignId || x.campaign] || (camps[x.campaignId || x.campaign] = { name: x.campaign, spend: 0, sales: x.sales, objective: x.objective, conv: 0, ventas: 0 });
    c.spend += x.spend; const r = ads.find(r2 => r2.ad && String(r2.ad.id) === String(id)); if (r) { c.conv += r.conv; c.ventas += r.ingresos; } });
  const cl = Object.values(camps), noSales = cl.filter(c => !c.sales), dead = cl.filter(c => c.sales && !c.conv);
  // Qué hacer esta semana
  const todo = [];
  const unanswered = ads.flatMap(r => r.list).filter(c => c.lastMessageDir === "in" && Date.now() - (c.lastInboundAt || 0) > 2 * 3600e3 && Date.now() - (c.lastInboundAt || 0) < 7 * 864e5);
  if (unanswered.length) todo.push(["Tú", `Responde ${unanswered.length} ${unanswered.length === 1 ? "conversación" : "conversaciones"} de anuncios que llevan más de 2 horas sin respuesta.`, "Cada conversación de pauta ya costó plata: si nadie contesta, se pierde."]);
  Object.entries(sp.ads || {}).filter(([id, x]) => x.spend > 0 && x.sales && !ads.some(r => r.ad && String(r.ad.id) === String(id))).sort((p, q) => q[1].spend - p[1].spend).slice(0, 3)
    .forEach(([, x]) => todo.push(["Quien maneja tu pauta", `Revisa o pausa «${x.name}» (${x.campaign}): gastó ${money(x.spend)} y no trajo conversaciones.`, "Un anuncio de ventas que no genera chats está mal segmentado o el mensaje no engancha."]));
  noSales.forEach(c => todo.push(["Quien maneja tu pauta", `La campaña «${c.name}» tiene objetivo de ${OBJ[c.objective] || c.objective || "otro tipo"}, no de ventas: gastó ${money(c.spend)}.`, "Para vender por WhatsApp usa el objetivo Ventas o Mensajes, así Meta busca gente que compra."]));
  const top = ads.filter(r => r.ad && sp.ads[r.ad.id] && sp.ads[r.ad.id].spend > 0 && r.ingresos / sp.ads[r.ad.id].spend >= be).sort((p, q) => q.ingresos / sp.ads[q.ad.id].spend - p.ingresos / sp.ads[p.ad.id].spend)[0];
  if (top) todo.push(["Quien maneja tu pauta", `Sube el presupuesto de «${top.ad.headline || sp.ads[top.ad.id].name}»: devuelve ${(top.ingresos / sp.ads[top.ad.id].spend).toFixed(1)}× lo invertido.`, "Es el anuncio que mejor convierte; más presupuesto ahí rinde más que en los demás."]);
  return `<section class="card pauta" style="padding:16px 18px;margin-bottom:16px"><p class="eyebrow">Tu pauta · ${esc(RANGES[rk])}${cfg.name ? " · " + esc(cfg.name) : ""}</p>
    <h3 style="margin:2px 0 12px">Pusiste ${money(sp.total)} en pauta y por anuncios se vendieron ${money(ventas)}${storeRev ? ` (más ${money(storeRev)} en la tienda)` : ""}.</h3>
    <div class="tiles" style="margin-bottom:12px"><div class="tile"><small>Por cada $1 de pauta</small><b class="tabnum">${sp.total ? "$" + roas.toFixed(2).replace(".", ",") : "—"}</b><span>vuelven en ventas</span></div>
      <div class="tile"><small>Tu tienda registró</small><b class="tabnum">${money(storeRev)}</b><span>${store.length} ${store.length === 1 ? "pedido que llegó" : "pedidos que llegaron"} desde Facebook o Instagram</span></div>
      <div class="tile"><small>Ventas por WhatsApp y chats</small><b class="tabnum">${ads.reduce((s, r) => s + r.ventas, 0)}</b><span>de ${ads.reduce((s, r) => s + r.conv, 0)} conversaciones de anuncios</span></div></div>
    ${verdict ? `<div class="verdict ${verdict[0]}"><b>${verdict[1]}</b><div class="chrow" style="margin-top:6px"><label class="muted" for="adsM">Con el margen de tus ventas (%)</label><input class="in" id="adsM" type="number" min="1" max="95" value="${margin}" style="width:90px"></div></div>` : `<p class="muted">Aún no hay gasto registrado en este periodo${cfg.syncedAt ? ` (leído ${ago(cfg.syncedAt)})` : ""}.</p>`}
    ${cl.length ? `<p class="muted" style="margin:10px 0 0">De tus ${cl.length} ${cl.length === 1 ? "campaña que gastó" : "campañas que gastaron"} en este periodo: ${[dead.length ? `${dead.length} no trae${dead.length === 1 ? "" : "n"} conversaciones` : "", noSales.length ? `${noSales.length} no busca${noSales.length === 1 ? "" : "n"} ventas` : ""].filter(Boolean).join(" y ") || "todas traen conversaciones"}.</p>` : ""}
    ${cfg.error ? `<p class="err" style="margin:8px 0 0">⚠ ${esc(cfg.error)}</p>` : ""}
    <div class="chrow" style="margin-top:10px"><button class="btn sm" id="adsSync">Actualizar gasto</button><small class="muted">${cfg.syncedAt ? "Leído " + ago(cfg.syncedAt) + " · se actualiza solo cada 6 horas" : ""}</small><span class="spacer"></span><button class="link" id="adsOff">Desconectar</button></div></section>
    ${todo.length ? `<h2 class="sec-t">Qué hacer esta semana</h2><div style="display:grid;gap:8px;margin-bottom:16px">${todo.slice(0, 6).map((t, i) => `<div class="card todo-c"><span class="todo-n">${i + 1}</span><div><span class="pill">${esc(t[0])}</span><p style="margin:6px 0 2px">${esc(t[1])}</p><details><summary class="muted">Por qué</summary><p class="muted" style="margin:4px 0 0">${esc(t[2])}</p></details></div></div>`).join("")}</div>` : ""}`;
}
function bindPauta(el) {
  if ($("#adsF")) $("#adsF").onsubmit = async e => { e.preventDefault(); const b = $("#adsF button"); b.disabled = true; b.textContent = "Conectando…";
    try { const r = await fb.call("pauta", { action: "conectar", account: $("#adsAcc").value.trim(), token: $("#adsTok").value.trim() }); toast("Cuenta conectada: " + (r.name || "")); }
    catch (er) { toast(errMsg(er)); b.disabled = false; b.textContent = "Conectar"; } };
  if ($("#adsSync")) $("#adsSync").onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = "Leyendo…";
    try { await fb.call("pauta", { action: "sincronizar" }); toast("Gasto actualizado"); } catch (er) { toast(errMsg(er)); } finally { b.disabled = false; b.textContent = "Actualizar gasto"; } };
  if ($("#adsOff")) $("#adsOff").onclick = async () => { if (!await ask("¿Desconectar la cuenta publicitaria? Dejará de verse el gasto.", "Desconectar")) return; await fb.call("pauta", { action: "desconectar" }); };
  if ($("#adsM")) $("#adsM").onchange = e => fb.set("settings/ads", { margin: Math.max(1, Math.min(95, Number(e.target.value) || 25)) });
}

// ======================= Segmentos =======================
const SEG_ORIGIN = { anuncio: "Llegó por un anuncio", comentario: "Llegó por un comentario", web: "Llegó por la página web", organico: "Escribió por su cuenta" };
const originOf = c => c.ad ? "anuncio" : c.comment ? "comentario" : c.webFunnel || /^web_/.test(c.id || "") ? "web" : "organico";
function orderStatsC() { const st = {}; S.orders.forEach(o => { if (!o.contactId || o.status === "Cancelado") return; const s = st[o.contactId] || (st[o.contactId] = { n: 0, spent: 0, last: 0 }); s.n++; s.spent += o.total || 0; s.last = Math.max(s.last, o.createdAt || 0); }); return st; }
function inSegment(c, seg, stats) { // igual que functions/segmentos.js
  if (!c || !seg || c.archived) return false;
  if (seg.type === "manual") return (c.tags || []).includes(seg.name);
  const r = seg.rules || {}, s = stats[c.id] || { n: 0, spent: 0, last: 0 }, now = Date.now();
  const last = Math.max(s.last, c.lastPurchaseAt || 0), n = Math.max(s.n, c.lastPurchaseAt && !s.n ? 1 : 0);
  if (r.minOrders && n < Number(r.minOrders)) return false;
  if (r.minSpent && s.spent < Number(r.minSpent)) return false;
  if (r.neverBought && n > 0) return false;
  if (r.boughtWithinDays && !(last && now - last <= r.boughtWithinDays * DAY)) return false;
  if (r.notBoughtDays && !(last && now - last > r.notBoughtDays * DAY)) return false;
  if (r.pipeline && (c.pipeline || "ventas") !== r.pipeline) return false;
  if (r.stage && (c.stage || "Nuevo") !== r.stage) return false;
  if (r.tag && !(c.tags || []).includes(r.tag)) return false;
  if (r.origin && originOf(c) !== r.origin) return false;
  if (r.channel && chOf(c) !== r.channel) return false;
  if (r.quietDays && now - Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0) < r.quietDays * DAY) return false;
  return true;
}
function segDesc(s) {
  if (s.type === "manual") return `los contactos con la etiqueta «${s.name}»`;
  const r = s.rules || {}, p = [];
  if (r.minOrders) p.push(`al menos ${r.minOrders} compra${r.minOrders > 1 ? "s" : ""}`); if (r.minSpent) p.push(`gasto total ≥ ${money(r.minSpent)}`);
  if (r.neverBought) p.push("nunca ha comprado"); if (r.boughtWithinDays) p.push(`compró en los últimos ${r.boughtWithinDays} días`); if (r.notBoughtDays) p.push(`no compra hace más de ${r.notBoughtDays} días`);
  if (r.pipeline) p.push(`en el embudo ${(pipes().find(x => x.id === r.pipeline) || {}).name || r.pipeline}`); if (r.stage) p.push(`etapa ${r.stage}`); if (r.tag) p.push(`etiqueta ${r.tag}`);
  if (r.origin) p.push(SEG_ORIGIN[r.origin].toLowerCase()); if (r.channel) p.push(`por ${(CHN[r.channel] || {}).label || r.channel}`); if (r.quietDays) p.push(`sin hablar hace ${r.quietDays}+ días`);
  return p.join(" · ") || "todos los contactos";
}
function viewSegmentos(el) {
  const segs = S.segments || [], stats = orderStatsC();
  el.innerHTML = `<div class="page" style="max-width:1000px"><div class="page-head"><div><h1>Segmentos</h1><span class="sub">Grupos de contactos para trabajar la base: clientes, fríos, VIP o los de una etapa del embudo. Los <b>manuales</b> se llenan desde cada chat con una etiqueta; los <b>dinámicos</b> se llenan solos con reglas y siempre están al día.</span></div><span class="spacer"></span><button class="btn primary" id="nSeg">+ Nuevo segmento</button></div>
    ${segs.length ? `<div style="display:grid;gap:10px">${segs.map(s => { const n = S.contacts.filter(c => inSegment(c, s, stats)).length; return `<div class="card seg-c" data-seg="${s.id}"><div style="flex:1;min-width:220px"><b>${esc(s.name)}</b> <span class="pill ${s.type === "manual" ? "" : "green"}">${s.type === "manual" ? "manual" : "dinámico"}</span><small class="muted" style="display:block">${esc(segDesc(s))}</small></div>
      <div class="seg-n"><b class="tabnum">${n}</b><small class="muted">contactos</small></div><button class="btn sm" data-segsend="${s.id}" ${n ? "" : "disabled"}>Difundir</button></div>`; }).join("")}</div>`
      : `<div class="empty"><p><b>Aún no hay segmentos.</b> Ideas: «Clientes que compraron más de $300.000», «Llegaron por anuncio y no compraron», «No compran hace 90 días».</p></div>`}</div>`;
  $("#nSeg").onclick = () => openSegment(null);
  $$("[data-seg]", el).forEach(d => d.onclick = e => { if (!e.target.closest("[data-segsend]")) openSegment(d.dataset.seg); });
  $$("[data-segsend]", el).forEach(b => b.onclick = () => { const s = byId(S.segments, b.dataset.segsend); openCampaign(null, { segmentId: s.id }); });
}
function openSegment(id) {
  const s = id ? JSON.parse(JSON.stringify(byId(S.segments, id))) : { name: "", type: "dinamico", rules: {} }, m = $("#modal"), stats = orderStatsC();
  const tags = [...new Set(S.contacts.flatMap(c => c.tags || []))].sort();
  const read = () => {
    s.name = $("#sgn").value.trim(); s.type = $("#sgt").value;
    const r = {}, nv = k => { const v = Number($("#sg_" + k).value); if (v > 0) r[k] = v; }, tv = k => { const v = $("#sg_" + k).value; if (v) r[k] = v; };
    if (s.type !== "manual") { ["minOrders", "minSpent", "boughtWithinDays", "notBoughtDays", "quietDays"].forEach(nv); ["pipeline", "stage", "tag", "origin", "channel"].forEach(tv); if ($("#sg_neverBought").checked) r.neverBought = true; }
    s.rules = r;
  };
  const draw = () => {
    const r = s.rules || {}, n = S.contacts.filter(c => inSegment(c, s, stats)).length, sel = (k, opts, ph) => `<select class="in" id="sg_${k}"><option value="">${ph}</option>${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(r[k] || "") === String(v) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    m.innerHTML = `<form id="sgf"><div class="mh"><h2>${id ? "Segmento" : "Nuevo segmento"}</h2><button class="iconbtn" type="button" id="sgx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><div class="grid2"><div><label class="lb" for="sgn">Nombre</label><input class="in" id="sgn" required value="${esc(s.name)}" placeholder="Clientes VIP"></div>
        <div><label class="lb" for="sgt">Tipo</label><select class="in" id="sgt"><option value="dinamico" ${s.type !== "manual" ? "selected" : ""}>Dinámico (con reglas)</option><option value="manual" ${s.type === "manual" ? "selected" : ""}>Manual (con una etiqueta)</option></select></div></div>
        ${s.type === "manual" ? `<p class="muted">Quedan en el segmento los contactos con la etiqueta <b>${esc(s.name || "del mismo nombre")}</b>. Pónsela desde la ficha de cada cliente.</p>` : `<div class="grid2" style="margin-top:10px">
          <div><label class="lb" for="sg_minOrders">Compras (mínimo)</label><input class="in" id="sg_minOrders" type="number" min="0" value="${r.minOrders || ""}"></div>
          <div><label class="lb" for="sg_minSpent">Gasto total (mínimo $)</label><input class="in" id="sg_minSpent" type="number" min="0" value="${r.minSpent || ""}"></div>
          <div><label class="lb" for="sg_boughtWithinDays">Compró en los últimos (días)</label><input class="in" id="sg_boughtWithinDays" type="number" min="0" value="${r.boughtWithinDays || ""}"></div>
          <div><label class="lb" for="sg_notBoughtDays">No compra hace más de (días)</label><input class="in" id="sg_notBoughtDays" type="number" min="0" value="${r.notBoughtDays || ""}"></div>
          <div><label class="lb" for="sg_pipeline">Embudo</label>${sel("pipeline", pipes().map(p => [p.id, p.name]), "Cualquiera")}</div>
          <div><label class="lb" for="sg_stage">Etapa</label>${sel("stage", [...new Set(pipes().flatMap(p => p.stages))].map(x => [x, x]), "Cualquiera")}</div>
          <div><label class="lb" for="sg_origin">Cómo llegó</label>${sel("origin", Object.entries(SEG_ORIGIN), "Cualquiera")}</div>
          <div><label class="lb" for="sg_channel">Canal</label>${sel("channel", Object.entries(CHN).map(([k, v]) => [k, v.label]), "Cualquiera")}</div>
          <div><label class="lb" for="sg_tag">Etiqueta</label>${sel("tag", tags.map(t => [t, t]), "Cualquiera")}</div>
          <div><label class="lb" for="sg_quietDays">Sin hablar hace (días)</label><input class="in" id="sg_quietDays" type="number" min="0" value="${r.quietDays || ""}"></div>
          <label class="switch sm full"><input type="checkbox" id="sg_neverBought" ${r.neverBought ? "checked" : ""}> <span>Nunca ha comprado</span></label></div>`}
        <p class="seg-count"><b class="tabnum">${n}</b> contactos cumplen hoy</p></div>
      <div class="mf">${id ? '<button class="btn danger" type="button" id="sgdel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="sgc">Cancelar</button><button class="btn primary">Guardar</button></div></form>`;
    $("#sgx").onclick = $("#sgc").onclick = () => m.close();
    // Solo el cambio de tipo redibuja el formulario; lo demás actualiza el conteo (redibujar mientras se escribe pierde el foco)
    $$("input,select", m).forEach(x => x.onchange = () => { read(); if (x.id === "sgt") return draw(); $(".seg-count b", m).textContent = S.contacts.filter(c => inSegment(c, s, stats)).length; });
    if ($("#sgdel")) $("#sgdel").onclick = async () => { if (!await ask("¿Eliminar este segmento? Los contactos no se borran.", "Eliminar")) return; await fb.remove("segments/" + id); m.close(); };
    $("#sgf").onsubmit = async e => { e.preventDefault(); read(); if (!s.name) return toast("Ponle un nombre."); const data = { name: s.name, type: s.type, rules: s.rules, ...stamp() };
      try { id ? await fb.set("segments/" + id, data, false) : await fb.add("segments", data); m.close(); toast("Segmento guardado"); } catch (er) { toast(errMsg(er)); } };
  };
  draw(); m.showModal();
}

// ======================= Agenda en el calendario del teléfono =======================
function icsBlock() {
  const ics = (S.me || {}).ics, adm = isAdmin();
  return `<section class="card" style="padding:16px 18px;margin-top:22px"><p class="eyebrow">Tu agenda en el calendario del teléfono</p>
    <p class="muted" style="margin:4px 0 10px">Suscríbete una vez y cada próximo contacto aparece solo en Google Calendar o en el calendario del iPhone, con lo que toca hacer y el enlace para abrir la conversación. <b>Nunca lleva teléfonos.</b> El calendario se actualiza cada pocas horas.</p>
    ${S.icsUrl ? `<div class="codebox"><code class="sel" id="icsUrl">${esc(S.icsUrl)}</code><button class="btn sm" type="button" id="icsCopy">Copiar</button></div>
      <ol class="steps" style="margin-top:8px"><li><b>iPhone:</b> Configuración › Calendario › Cuentas › Agregar cuenta › Otra › Agregar calendario suscrito, y pega el enlace.</li><li><b>Google Calendar</b> (en computador): Otros calendarios › + › Desde URL, y pega el enlace.</li></ol>`
      : ics ? `<p>Tienes un enlace activo (termina en «${esc(ics.tail)}»), con ${ics.scope === "equipo" ? "todo el equipo" : "lo tuyo"}. Cambiarlo corta el anterior en todos los teléfonos donde esté.</p>` : ""}
    ${adm ? `<div class="chrow" style="margin:8px 0"><span class="muted">Qué entra al calendario:</span><label class="switch sm"><input type="radio" name="icsS" value="mio" ${!ics || ics.scope !== "equipo" ? "checked" : ""}> <span>Lo mío</span></label><label class="switch sm"><input type="radio" name="icsS" value="equipo" ${ics && ics.scope === "equipo" ? "checked" : ""}> <span>Todo el equipo</span></label></div>` : ""}
    <div class="chrow"><button class="btn ${ics ? "" : "primary"}" id="icsMake">${ics ? "Cambiar el enlace" : "Crear mi enlace"}</button>${ics ? '<button class="link" id="icsOff">Quitar el enlace</button>' : ""}</div></section>`;
}
function bindIcs() {
  if ($("#icsMake")) $("#icsMake").onclick = async e => { const b = e.currentTarget; b.disabled = true;
    try { const sc = ($("[name=icsS]:checked") || {}).value || "mio"; const r = await fb.call("agendaEnlace", { action: "crear", scope: sc }); S.icsUrl = r.url; renderShell(); toast("Enlace listo: cópialo en tu calendario"); }
    catch (er) { toast(errMsg(er)); b.disabled = false; } };
  if ($("#icsOff")) $("#icsOff").onclick = async () => { if (!await ask("¿Quitar el enlace? La agenda deja de llegar al calendario de los teléfonos donde esté.", "Quitar")) return; await fb.call("agendaEnlace", { action: "quitar" }); S.icsUrl = ""; toast("Enlace quitado"); };
  if ($("#icsCopy")) $("#icsCopy").onclick = () => copy(S.icsUrl);
}

// ======================= Calificaciones de la asesora =======================
const RATE_REASONS = { entendio: "No entendió", invento: "Inventó algo", venta: "No avanzó la venta", persona: "No suena a persona", otro: "Otro" };
// Semana que empieza el lunes (igual que en el servidor): "2026-10-26"
const weekOf = ms => { const d = new Date(new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
async function rateMessage(cid, mid, v) {
  const m = (S.msgs || []).find(x => x.id === mid) || {};
  let reason = "", note = "";
  if (v === -1) {
    const r = await rateAsk(); if (!r) return; reason = r.reason; note = r.note;
  }
  const at = Date.now(), rating = { v, reason, by: S.user.uid, byName: S.me.name || "", at };
  try {
    await fb.update(`contacts/${cid}/messages/${mid}`, { rating });
    await fb.set("ratings/" + cid + "_" + mid, { cid, mid, v, reason, note, text: String(m.text || "").slice(0, 600), by: S.user.uid, byName: S.me.name || "", at, week: weekOf(m.ts || at) }, false);
    toast(v === 1 ? "Gracias: respuesta marcada como buena" : `Anotado. ${aiName()} lo tendrá en cuenta en las próximas respuestas`);
  } catch (er) { toast(errMsg(er)); }
}
function rateAsk() {
  return new Promise(res => {
    const m = $("#modal");
    m.innerHTML = `<form id="rtf"><div class="mh"><h2>¿Qué salió mal?</h2><button class="iconbtn" type="button" id="rtx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><div class="chips-r">${Object.entries(RATE_REASONS).map(([k, t], i) => `<label class="rchip"><input type="radio" name="rr" value="${k}" ${i ? "" : "checked"}> <span>${t}</span></label>`).join("")}</div>
        <label class="lb" for="rtn" style="margin-top:10px">¿Qué debió responder? (opcional, ${esc(aiName())} lo aprende)</label><textarea class="in" id="rtn" rows="3" placeholder="Ej: El envío gratis es solo desde $200.000"></textarea></div>
      <div class="mf"><span class="spacer"></span><button class="btn" type="button" id="rtc">Cancelar</button><button class="btn primary">Guardar 👎</button></div></form>`;
    const done = v => { m.close(); res(v); };
    $("#rtx").onclick = $("#rtc").onclick = () => done(null);
    $("#rtf").onsubmit = e => { e.preventDefault(); done({ reason: ($("[name=rr]:checked", m) || {}).value || "otro", note: $("#rtn").value.trim().slice(0, 300) }); };
    m.showModal();
  });
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-rv]");
  if (!b || !S.msgsFor) return;
  e.preventDefault(); rateMessage(S.msgsFor, b.dataset.mid, Number(b.dataset.rv));
});
function viewCalificaciones(el) {
  const rs = S.ratings || [], weeks = [];
  for (let i = 0; i < 6; i++) weeks.push(weekOf(Date.now() - i * 7 * DAY));
  const stats = Object.fromEntries((S.aiStats || []).map(x => [x.id, x.replies || 0]));
  const row = w => { const l = rs.filter(r => r.week === w), bad = l.filter(r => r.v === -1).length, good = l.filter(r => r.v === 1).length;
    return `<tr><td>Semana del ${new Date(w + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</td><td class="num tabnum">${stats[w] ?? "—"}</td><td class="num tabnum">${l.length}</td>
      <td class="num tabnum"><b>${l.length ? Math.round(bad / l.length * 100) + "%" : "—"}</b> <small class="muted">(${bad} 👎 · ${good} 👍)</small></td></tr>`; };
  const last30 = rs.filter(r => r.v === -1 && r.at > Date.now() - 30 * DAY);
  const why = Object.entries(RATE_REASONS).map(([k, t]) => ({ k: t, v: last30.filter(r => (r.reason || "otro") === k).length })).filter(x => x.v).sort((a, b) => b.v - a.v);
  el.innerHTML = `<div class="page" style="max-width:1000px"><div class="page-head"><div><h1>Calificaciones de ${esc(aiName())}</h1><span class="sub">Lo que el equipo marcó con 👍 o 👎 en los chats. Califica cada respuesta de ${esc(aiName())} debajo del mensaje: con los 👎 y lo que debió responder, ${esc(aiName())} aprende y no repite el error.</span></div></div>
    <section class="mcard"><h3>Por semana</h3><div class="table-wrap"><table class="t"><thead><tr><th>Semana</th><th class="num">Respuestas</th><th class="num">Calificadas</th><th class="num">👎 de las calificadas</th></tr></thead><tbody>${weeks.map(row).join("")}</tbody></table></div>
      <p class="muted" style="font-size:12.5px">Una respuesta cuenta como mala si alguien del equipo le puso 👎. El número que tiene que bajar es el de la última columna.</p></section>
    <div class="mgrid"><section class="mcard"><h3>Qué sale mal <small class="muted">30 días</small></h3>${why.length ? hbars(why, v => String(v)) : '<p class="muted">Aún no hay respuestas marcadas con 👎.</p>'}</section>
      <section class="mcard"><h3>Últimas marcadas con 👎</h3>${last30.length ? last30.slice(0, 12).map(r => `<div class="rate-i" data-goc="${esc(r.cid)}"><small class="muted">${esc(RATE_REASONS[r.reason] || "Otro")} · ${ago(r.at)} · ${esc(r.byName || "")}</small><p>"${esc(String(r.text).slice(0, 200))}"</p>${r.note ? `<p class="ok">→ ${esc(r.note)}</p>` : ""}</div>`).join("") : '<p class="muted">Nada por ahora.</p>'}</section></div></div>`;
  $$("[data-goc]", el).forEach(d => d.onclick = () => go("conv", d.dataset.goc));
}

// ======================= Línea base =======================
// Cómo iba la operación antes de la asesora (se declara y se congela) contra cómo va ahora (últimos 30 días)
const BASE_FIELDS = [["conv", "Conversaciones al mes", "Clientes distintos que escribieron en un mes típico.", v => Math.round(v).toLocaleString("es-CO")],
  ["ventas", "Ventas cerradas por chat al mes", "Pedidos que salieron de esas conversaciones.", v => Math.round(v).toLocaleString("es-CO")],
  ["ticket", "Ticket promedio", "Valor promedio de esos pedidos, en pesos.", v => money(v)],
  ["resp", "Tiempo de primera respuesta (minutos)", "Cuánto tardaba el equipo en contestar el primer mensaje.", v => (Math.round(v * 10) / 10).toLocaleString("es-CO") + " min"],
  ["conversion", "Conversión (%)", "Ventas ÷ conversaciones × 100.", v => (Math.round(v * 10) / 10).toLocaleString("es-CO") + "%"]];
function currentMetrics(days = 30) {
  const a = Date.now() - days * DAY, conv = S.contacts.filter(c => (c.lastInboundAt || 0) >= a).length;
  const orders = S.orders.filter(o => o.status !== "Cancelado" && (o.createdAt || 0) >= a && o.contactId), ventas = orders.length;
  const rs = S.contacts.filter(c => c.firstReplySecs != null && (c.firstReplyAt || 0) >= a).map(c => c.firstReplySecs).sort((x, y) => x - y);
  return { conv, ventas, ticket: ventas ? orders.reduce((s, o) => s + (o.total || 0), 0) / ventas : 0, resp: rs.length ? rs[Math.floor(rs.length / 2)] / 60 : null, conversion: conv ? ventas / conv * 100 : 0 };
}
function viewLineaBase(el) {
  const b = S.base || {}, v = b.values || {}, frozen = !!b.frozenAt, now = currentMetrics();
  el.innerHTML = `<div class="page" style="max-width:1000px"><div class="page-head"><div><h1>Línea base</h1><span class="sub">Cómo iba tu operación <b>antes</b> de ${esc(aiName())}, para medir cuánto mejoró. Declárala con tus números de un mes típico y congélala: después solo se compara.</span></div></div>
    <div class="banner ${frozen ? "" : "warn"}" style="${frozen ? "background:var(--green-soft)" : ""}">${frozen ? `Línea base congelada el ${fmtDT(b.frozenAt)}${b.period ? " · periodo " + esc(b.period) : ""}` : "Sin línea base congelada: no hay contra qué comparar. Escribe tus números y congélala."}</div>
    <div class="grid2" style="margin:10px 0 14px"><div><label class="lb" for="lbp">Periodo que describe</label><input class="in" id="lbp" value="${esc(b.period || "")}" placeholder="Ej: agosto de 2026" ${frozen ? "disabled" : ""}></div></div>
    <div style="display:grid;gap:10px">${BASE_FIELDS.map(([k, t, d, f]) => { const have = v[k] != null && v[k] !== "", cur = now[k]; const better = have && cur != null ? (k === "resp" ? cur <= v[k] : cur >= v[k]) : null;
      return `<div class="card base-c"><div style="flex:1;min-width:220px"><b>${t}</b> ${have ? "" : '<span class="pill amber">falta</span>'}<small class="muted" style="display:block">${d}</small></div>
        <div class="base-v"><label class="lb">Antes</label><input class="in tabnum" data-bv="${k}" type="number" step="any" min="0" value="${have ? v[k] : ""}" ${frozen ? "disabled" : ""}></div>
        <div class="base-v"><label class="lb">Ahora (30 días)</label><b class="tabnum">${cur == null ? "—" : f(cur)}</b>${better === null ? "" : `<small class="${better ? "ok" : "err"}">${better ? "▲ mejor" : "▼ peor"}</small>`}</div></div>`; }).join("")}</div>
    <div class="chrow" style="margin-top:14px">${frozen ? '<button class="btn" id="lbUn">Descongelar para corregir</button>' : '<button class="btn" id="lbSave">Guardar borrador</button><button class="btn primary" id="lbFreeze">Congelar línea base</button>'}</div>
    <p class="muted" style="font-size:12.5px;margin-top:10px">"Ahora" sale de House Chat: clientes que escribieron, pedidos de esos clientes, ticket promedio, mediana del tiempo hasta la primera respuesta y conversión.</p></div>`;
  const read = () => { const vals = {}; $$("[data-bv]", el).forEach(i => { if (i.value !== "") vals[i.dataset.bv] = Number(i.value); }); return { values: vals, period: $("#lbp").value.trim() }; };
  if ($("#lbSave")) $("#lbSave").onclick = () => fb.set("settings/lineaBase", { ...read(), ...stamp() }).then(() => toast("Borrador guardado"));
  if ($("#lbFreeze")) $("#lbFreeze").onclick = async () => { const r = read(); if (Object.keys(r.values).length < 3) return toast("Escribe al menos 3 números antes de congelar.");
    if (!await ask("¿Congelar la línea base? Desde ahora se usa para comparar.", "Congelar")) return; await fb.set("settings/lineaBase", { ...r, frozenAt: Date.now(), frozenBy: S.me.name || "", ...stamp() }); toast("Línea base congelada"); };
  if ($("#lbUn")) $("#lbUn").onclick = async () => { if (!await ask("¿Descongelar la línea base para corregirla?", "Descongelar")) return; await fb.set("settings/lineaBase", { frozenAt: null }); };
}

// ======================= Comprobantes de pago por revisar =======================
function proofsBlock() {
  const l = S.contacts.filter(c => c.paymentProof && c.paymentProof.status === "por revisar").sort((a, b) => b.paymentProof.at - a.paymentProof.at);
  if (!l.length) return "";
  return `<h2 class="sec-t">💳 Comprobantes de pago por revisar <span class="pill amber">${l.length}</span></h2><p class="sec-s">${esc(aiName())} los recibió en el chat. Verifica en tu banco si entró la plata y confírmalo.</p>
    <div style="display:grid;gap:8px;margin-bottom:18px">${l.map(c => { const p = c.paymentProof; return `<div class="card opp" style="padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><b>${esc(contactName(c))}</b><div class="muted" style="font-size:13.5px">${[p.monto ? money(p.monto) : "", p.banco, p.referencia ? "ref. " + p.referencia : "", p.detalle].filter(Boolean).map(esc).join(" · ")} · ${ago(p.at)}</div></div>
      <button class="btn sm" data-oc="${esc(c.id)}">Ver comprobante</button><button class="btn sm primary" data-proof="${esc(c.id)}" data-ok="1">Sí entró</button><button class="btn sm" data-proof="${esc(c.id)}" data-ok="0">No ha entrado</button></div>`; }).join("")}</div>`;
}
function bindProofs(el) {
  $$("[data-proof]", el).forEach(b => b.onclick = async () => {
    const c = byId(S.contacts, b.dataset.proof), ok = b.dataset.ok === "1", p = c.paymentProof;
    await fb.update("contacts/" + c.id, { "paymentProof.status": ok ? "confirmado" : "no entró", "paymentProof.reviewedBy": S.me.name || "", "paymentProof.reviewedAt": Date.now(), ...stamp() });
    await fb.add(`contacts/${c.id}/messages`, { dir: "note", ts: Date.now(), by: S.user.uid, byName: S.me.name || "", text: ok ? `✅ Pago confirmado${p.monto ? " por " + money(p.monto) : ""}${p.banco ? " (" + p.banco + ")" : ""}.` : "⚠️ El comprobante no aparece en el banco todavía." });
    const o = ok && S.orders.find(x => x.contactId === c.id && owes(x));
    if (o) { toast("Pago confirmado. Regístralo en el pedido " + o.number); openPayment(o.id); setTimeout(() => { if ($("#pya") && p.monto) $("#pya").value = p.monto; if ($("#pym") && /nequi/i.test(p.banco)) $("#pym").value = "Nequi"; if ($("#pyn")) $("#pyn").value = p.referencia ? "Ref. " + p.referencia : ""; }, 50); }
    else toast(ok ? "Pago confirmado" : "Marcado: no ha entrado");
  });
}

// Resumen del periodo: vendido contra el periodo anterior, ventas por día, conversaciones y tiempo de respuesta
function metricsHero(rk) {
  const [a, b0] = rangeOf(rk), b = Math.min(b0, Date.now()), len = b - a, pa = a - len;
  const ok = o => o.status !== "Cancelado", inR = (t, x, y) => (t || 0) >= x && (t || 0) < y;
  const os = S.orders.filter(o => ok(o) && inR(o.createdAt, a, b)), prev = S.orders.filter(o => ok(o) && inR(o.createdAt, pa, a));
  const total = os.reduce((s2, o) => s2 + (o.total || 0), 0), ptotal = prev.reduce((s2, o) => s2 + (o.total || 0), 0);
  const conv = S.contacts.filter(c => inR(c.lastInboundAt, a, b)).length, nuevos = S.contacts.filter(c => !c.sourceSheet && inR(c.createdAt, a, b)).length;
  const rs = S.contacts.filter(c => c.firstReplySecs != null && inR(c.firstReplyAt, a, b)).map(c => c.firstReplySecs).sort((x, y) => x - y), med = rs.length ? rs[Math.floor(rs.length / 2)] : null;
  const fmtS = x => x == null ? "—" : x < 90 ? x + " s" : x < 5400 ? Math.round(x / 60) + " min" : (Math.round(x / 360) / 10) + " h";
  // Ventas por día (máximo 90 días)
  const days = Math.min(90, Math.max(1, Math.ceil(len / DAY))), start = Math.max(a, b - days * DAY), pts = [];
  for (let i = 0; i < days; i++) { const x = start + i * DAY; pts.push({ d: x, v: os.filter(o => inR(o.createdAt, x, x + DAY)).reduce((s2, o) => s2 + (o.total || 0), 0) }); }
  const max = Math.max(1, ...pts.map(p2 => p2.v)), W = 600, Hh = 160, X = i => (days === 1 ? W / 2 : i / (days - 1) * W), Y = v => Hh - v / max * (Hh - 10);
  const line = pts.map((p2, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p2.v).toFixed(1)}`).join(" ");
  const diff = ptotal ? Math.round((total - ptotal) / ptotal * 100) : null;
  // Dónde poner atención: lo que pidieron y no había (lo detecta el copiloto al analizar cada chat)
  const miss = S.contacts.filter(c => c.ai && c.ai.faltante && inR(c.ai.at, a, b));
  const group = t => { const l = miss.filter(c => c.ai.faltante.tipo === t), top = {}; l.forEach(c => { const k = norm(c.ai.faltante.detalle || "").slice(0, 60); if (k) top[k] = { k: c.ai.faltante.detalle, n: ((top[k] || {}).n || 0) + 1 }; });
    return { n: l.length, top: Object.values(top).sort((x, y) => y.n - x.n).slice(0, 5) }; };
  const vnd = group("variante_no_disponible"), nom = group("no_manejamos");
  return `<section class="mcard hero"><div class="hero-l"><p class="eyebrow">Vendido · ${esc(RANGES[rk])}</p><b class="hero-n tabnum">${money(total)}</b>
      <p class="muted">${diff === null ? `Periodo anterior: ${money(ptotal)}` : `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)}% contra el periodo anterior (${money(ptotal)})`}</p>
      <div class="hero-k"><div><small>Ventas</small><b class="tabnum">${os.length}</b></div><div><small>Compra promedio</small><b class="tabnum">${os.length ? money(total / os.length) : "—"}</b></div><div><small>Conversión</small><b class="tabnum">${conv ? (Math.round(os.filter(o => o.contactId).length / conv * 1000) / 10).toLocaleString("es-CO") + "%" : "—"}</b></div></div></div>
    <div class="hero-r"><small class="muted">Lo vendido cada día</small><svg viewBox="0 0 ${W} ${Hh + 4}" class="spark" role="img" aria-label="Ventas por día">${[0.25, 0.5, 0.75].map(f => `<line x1="0" x2="${W}" y1="${Y(max * f)}" y2="${Y(max * f)}" class="gl"/>`).join("")}
      <path d="${line} L${X(days - 1)},${Hh} L${X(0)},${Hh} Z" class="ar"/><path d="${line}" class="ln"/></svg>
      <div class="spark-x muted"><span>${new Date(start).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span><span>${new Date(b - 1).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span></div></div></section>
    <div class="tiles"><div class="tile"><small>Conversaciones</small><b>${conv.toLocaleString("es-CO")}</b><span>clientes que escribieron</span></div>
      <div class="tile"><small>Clientes nuevos</small><b>${nuevos.toLocaleString("es-CO")}</b><span>sin contar los importados</span></div>
      <div class="tile"><small>Primera respuesta · mediana</small><b>${fmtS(med)}</b><span>${rs.length ? rs.length + (rs.length === 1 ? " chat nuevo medido" : " chats nuevos medidos") : "se mide desde hoy"}</span></div></div>
    ${vnd.n || nom.n ? `<h2 class="sec-t">Dónde poner atención</h2><div class="mgrid">${[[vnd, "El producto existe, pero no en esa medida o color", "Revisa qué combinaciones piden antes de la próxima compra."], [nom, "Lo pidieron y la tienda no lo maneja", "Demanda sin surtido: si se repite entre clientes distintos, es una compra que evaluar."]].filter(x => x[0].n).map(([g, t, d]) => `<section class="mcard attn"><b class="attn-n">${g.n} <small>${g.n === 1 ? "conversación" : "conversaciones"}</small></b><h3>${t}</h3><p class="muted">${d}</p>${g.top.length ? `<ul>${g.top.map(x => `<li>${esc(x.k)}${x.n > 1 ? ` <span class="pill">${x.n}</span>` : ""}</li>`).join("")}</ul>` : ""}</section>`).join("")}</div>` : ""}`;
}
function viewMetricas(el) {
  const rk = S.mRange || "mes", [a, b] = rangeOf(rk), inR = t => (t || 0) >= a && (t || 0) < b;
  const orders = S.orders.filter(o => o.status !== "Cancelado" && inR(o.createdAt));
  const sales = orders.reduce((s, o) => s + (o.total || 0), 0);
  const quotes = S.quotes.filter(q => inR(q.createdAt));
  const sent = quotes.filter(q => q.status !== "Borrador"), conv = quotes.filter(q => q.status === "Convertida");
  const pipeline = S.quotes.filter(q => ["Enviada", "Aceptada"].includes(q.status)).reduce((s, q) => s + (q.total || 0), 0);
  const newC = S.contacts.filter(c => !c.sourceSheet && inR(c.createdAt)).length;
  // Ventas por mes: últimos 12 meses, siempre visibles para ver la tendencia
  const now = new Date(), months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ s: d.getTime(), e: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), k: d.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""), y: d.getFullYear() }); }
  months.forEach(m => { const os = S.orders.filter(o => o.status !== "Cancelado" && o.createdAt >= m.s && o.createdAt < m.e); m.v = os.reduce((s, o) => s + (o.total || 0), 0); m.n = os.length; });
  const mMax = Math.max(1, ...months.map(m => m.v)), peak = months.reduce((p, m) => m.v > p.v ? m : p, months[0]);
  const by = (list, keyFn) => { const g = {}; list.forEach(x => { const k = keyFn(x) || "Sin asignar"; (g[k] = g[k] || { k, v: 0, n: 0 }); g[k].v += x.total || 0; g[k].n++; }); return Object.values(g).sort((p, q) => q.v - p.v); };
  const prod = {}; orders.forEach(o => (o.items || []).forEach(i => { const k = i.name || "—"; (prod[k] = prod[k] || { k, v: 0, n: 0 }); prod[k].v += (i.qty || 0) * (i.price || 0); prod[k].n += Number(i.qty) || 0; }));
  const prodRows = Object.values(prod).sort((p, q) => q.v - p.v).slice(0, 10);
  const stageRows = allStages().map(st => ({ k: st, v: S.contacts.filter(c => !c.archived && (c.stage || "Nuevo") === st).length }));
  const qStatus = Q_STATUS.map(st => ({ k: st, v: quotes.filter(q => q.status === st).length })).filter(r => r.v);
  el.innerHTML = `<div class="page" style="max-width:1200px"><div class="page-head"><h1>Métricas</h1><span class="spacer"></span>
      <div class="seg" role="group" aria-label="Periodo">${Object.entries(RANGES).map(([k, t]) => `<button class="${k === rk ? "on" : ""}" data-r="${k}">${t}</button>`).join("")}</div></div>
    ${metricsHero(rk)}
    <h2 class="sec-t">Detalle</h2>
    <div class="tiles">
      <div class="tile"><small>Ventas</small><b class="mono">${money(sales)}</b><span>${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"}</span></div>
      <div class="tile"><small>Ticket promedio</small><b class="mono">${orders.length ? money(sales / orders.length) : "—"}</b><span>por pedido</span></div>
      <div class="tile"><small>Cotizaciones enviadas</small><b>${sent.length}</b><span>${quotes.length} creadas</span></div>
      <div class="tile"><small>Conversión a pedido</small><b>${pct(conv.length, sent.length)}</b><span>${conv.length} de ${sent.length} enviadas</span></div>
      <div class="tile"><small>En negociación hoy</small><b class="mono">${money(pipeline)}</b><span>cotizaciones enviadas y aceptadas</span></div>
      <div class="tile"><small>Contactos nuevos</small><b>${newC}</b><span>sin contar los importados</span></div>
      ${(() => { const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0); const n = S.contacts.filter(c => (c.lastInboundAt || 0) >= m0.getTime()).length;
        return `<div class="tile"><small>Conversaciones este mes</small><b>${n.toLocaleString("es-CO")}</b><span>clientes que escribieron · sin límite</span></div>`; })()}
      ${(() => { const n = S.contacts.filter(c => c.formId && (c.lastFormAt || 0) > Date.now() - 30 * DAY).length; return n ? `<div class="tile"><small>Formularios</small><b>${n}</b><span>contactos en los últimos 30 días</span></div>` : ""; })()}
    </div>
    <section class="mcard"><h3>Ventas por mes <small class="muted">últimos 12 meses</small></h3>
      <div class="vbars" role="img" aria-label="Ventas por mes en los últimos 12 meses">${months.map(m => `<div class="vb" data-tip="${esc(m.k)} ${m.y}: ${esc(money(m.v))} · ${m.n} ${m.n === 1 ? "pedido" : "pedidos"}">
        <span class="vv tabnum">${(m === peak && m.v) || m === months[11] ? esc(money(m.v)) : ""}</span>
        <span class="vf" style="height:${m.v ? Math.max(2, m.v / mMax * 100) : 0}%"></span><span class="vk">${esc(m.k)}</span></div>`).join("")}</div>
      <details class="mtable"><summary>Ver tabla</summary><table class="t"><thead><tr><th>Mes</th><th class="num">Pedidos</th><th class="num">Ventas</th></tr></thead>
        <tbody>${months.map(m => `<tr><td>${esc(m.k)} ${m.y}</td><td class="num">${m.n}</td><td class="num">${money(m.v)}</td></tr>`).join("")}</tbody></table></details></section>
    <div class="mgrid">
      <section class="mcard"><h3>Ventas por asesor <small class="muted">${esc(RANGES[rk].toLowerCase())}</small></h3>${hbars(by(orders, o => o.createdByName), money, r => r.n + (r.n === 1 ? " pedido" : " pedidos"))}</section>
      <section class="mcard"><h3>Productos más vendidos <small class="muted">${esc(RANGES[rk].toLowerCase())}</small></h3>${hbars(prodRows, money, r => r.n + " und")}</section>
      <section class="mcard"><h3>Embudo hoy <small class="muted">contactos por etapa</small></h3>${hbars(stageRows, v => String(v))}</section>
      <section class="mcard"><h3>Cotizaciones por estado <small class="muted">${esc(RANGES[rk].toLowerCase())}</small></h3>${hbars(qStatus, v => String(v))}</section>
    </div></div>`;
  $$("[data-r]", el).forEach(b => b.onclick = () => { S.mRange = b.dataset.r; renderShell(); });
  bindTips(el);
}
function bindTips(el) {
  let tip = $("#tip"); if (!tip) { tip = document.createElement("div"); tip.id = "tip"; tip.className = "tip"; document.body.append(tip); }
  tip.hidden = true;
  $$("[data-tip]", el).forEach(n => {
    n.onmousemove = e => { tip.textContent = n.dataset.tip; tip.hidden = false; const w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 12) + "px"; tip.style.top = (e.clientY + 14) + "px"; };
    n.onmouseleave = () => { tip.hidden = true; };
  });
}

// ======================= Exportar Excel =======================
const dt = ms => ms ? new Date(ms) : "";
const isoDt = iso => isoRe.test(iso || "") ? new Date(iso + "T12:00:00") : (iso || "");
function exportWorkbook() {
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "(vacío)": "" }], { cellDates: true });
    const keys = Object.keys(rows[0] || {}); ws["!cols"] = keys.map(k => ({ wch: Math.min(45, Math.max(10, k.length + 2, ...rows.slice(0, 200).map(r => String(r[k] ?? "").length))) }));
    XLSX.utils.book_append_sheet(wb, ws, name); };
  const extraKeys = [...new Set(S.contacts.flatMap(c => Object.keys(c.extra || {})))];
  add("Contactos", S.contacts.map(c => {
    const r = { Nombre: c.name || "", "Hotel / empresa": c.company || "", WhatsApp: c.phone || "", Correo: c.email || "", Cargo: c.cargo || "", Ciudad: c.city || "",
      Segmento: c.segment || "", Tipo: c.type || "", Etapa: c.stage || "", Temperatura: c.temperature || "", Potencial: c.potential || "", Nivel: c.level || "",
      Responsable: c.owner || "", "Qué busca": c.looking || "", "Producto elegido": c.chosenProduct ? c.chosenProduct.name : "", "Próx. seguimiento": isoDt(c.nextDate),
      "Qué hacer": c.nextAction || "", Observaciones: c.obs || "", "Total comprado": c.totalPurchased || "", "Última compra": dt(c.lastPurchaseAt),
      "Último mensaje": c.lastMessage || "", "Último mensaje del cliente": dt(c.lastInboundAt), "Creado": dt(c.createdAt), "Modificado": dt(c.updatedAt), "Modificado por": c.updatedBy || "", "ID": c.id };
    extraKeys.forEach(k => r["Excel: " + k] = (c.extra || {})[k] ?? "");
    return r; }));
  add("Cotizaciones", S.quotes.map(q => ({ "Número": q.number, Cliente: q.contactName, Estado: q.status, Subtotal: q.subtotal || 0, "Descuento %": q.discount || 0, Total: q.total || 0,
    "Válida hasta": isoDt(q.validUntil), Creada: dt(q.createdAt), Enviada: dt(q.sentAt), "Creada por": q.createdByName || "", Pedido: q.orderNumber || "", Notas: q.notes || "" })));
  add("Productos cotizados", S.quotes.flatMap(q => (q.items || []).map(i => ({ "Cotización": q.number, Cliente: q.contactName, Estado: q.status, Producto: i.name, Cantidad: i.qty, "Precio unitario": i.price, Subtotal: i.qty * i.price }))));
  add("Pedidos", S.orders.map(o => ({ "Número": o.number, Cliente: o.contactName, Estado: o.status, Pago: o.payment || "", Total: o.total || 0, "Cotización": o.quoteNumber || "",
    Creado: dt(o.createdAt), "Creado por": o.createdByName || "", Notas: o.notes || "" })));
  add("Productos", S.products.map(p => ({ Producto: p.name, "Categoría": p.category || "", Referencia: p.sku || "", "Descripción": p.desc || "", "Precio detal": p.priceRetail || 0,
    "Precio por mayor": p.priceWholesale || "", "Por mayor desde": p.minWholesale || "", Estado: p.active === false ? "Inactivo" : "Activo" })));
  XLSX.writeFile(wb, `CasaDorada_CRM_${todayIso()}.xlsx`);
  try { localStorage.setItem("crm-last-export", String(Date.now())); } catch { }
}
function viewExportar(el) {
  let last = null; try { last = Number(localStorage.getItem("crm-last-export")) || null; } catch { }
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Exportar Excel</h1></div>
    <div class="card" style="padding:22px;display:grid;gap:12px;max-width:720px">
      <p style="margin:0">Descarga una copia de todo el CRM en un archivo de Excel con estas hojas: <b>Contactos</b> (${S.contacts.length}), <b>Cotizaciones</b> (${S.quotes.length}), <b>Productos cotizados</b>, <b>Pedidos</b> (${S.orders.length}) y <b>Productos</b> (${S.products.length}).</p>
      <p class="muted" style="margin:0">Guárdala en tu Google Drive como copia de seguridad. Te recomiendo hacerlo cada semana. Las conversaciones de WhatsApp y las notas no se incluyen.</p>
      <p class="muted" style="margin:0">${last ? "Última copia desde este dispositivo: " + fmtDT(last) + (Date.now() - last > 7 * DAY ? " — ya pasó más de una semana." : ".") : "Todavía no has descargado una copia desde este dispositivo."}</p>
      ${isAdmin() ? '<button class="btn primary" id="doExport" style="justify-self:start">Descargar Excel</button>' : '<p class="muted" style="margin:0">Solo la administradora puede exportar.</p>'}</div></div>`;
  if ($("#doExport")) $("#doExport").onclick = () => {
    if (typeof XLSX === "undefined") return info("No se pudo cargar el generador de Excel. Revisa tu conexión y recarga.");
    try { exportWorkbook(); toast("Excel descargado"); renderShell(); } catch (e) { toast("No se pudo exportar: " + errMsg(e)); }
  };
}

// ======================= Pedidos =======================
function viewPedidos(el) {
  const f = S.oF || "";
  const list = S.orders.filter(o => !f || o.status === f || o.payment === f);
  const pend = S.orders.filter(o => !["Entregado", "Cancelado"].includes(o.status));
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Pedidos</h1><span class="sub tabnum">${pend.length} en curso · ${money(pend.reduce((s, o) => s + (o.total || 0), 0))}</span></div>
    <div class="toolbar"><select class="in" id="of"><option value="">Todos</option>${[...O_STATUS, ...PAY_STATUS].map(s => `<option ${f === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Número</th><th>Cliente</th><th class="num">Total</th><th>Estado</th><th>Pago</th><th>Cotización</th><th>Creado</th></tr></thead><tbody>
      ${list.map(o => `<tr data-id="${o.id}"><td class="mono">${esc(o.number)}${o.source === "Shopify" ? ' <span class="tag k-green">Shopify</span>' : o.source === "API" ? ' <span class="tag k-gray">API</span>' : ""}${o.siigoName ? ` <span class="tag k-blue">${esc(o.siigoName)}</span>` : ""}</td><td>${esc(o.contactName)}</td><td class="num">${money(o.total)}</td><td>${statusPill(o.status)}</td><td>${statusPill(o.payment || "Pendiente")}</td><td class="mono">${esc(o.quoteNumber || "")}</td><td>${fmtDT(o.createdAt)}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><p>Todavía no hay pedidos.</p><p>Se crean desde una cotización aceptada: Cotizaciones › Aceptada › Convertir en pedido.</p></div>`}</div>`;
  $("#of").onchange = e => { S.oF = e.target.value; renderShell(); };
  $$("tbody tr", el).forEach(tr => tr.onclick = () => openOrder(tr.dataset.id));
}
function openOrder(id) {
  const o = byId(S.orders, id), m = $("#modal");
  m.innerHTML = `<form id="of2"><div class="mh"><h2>${esc(o.number)} · ${esc(o.contactName)}</h2><button class="iconbtn" type="button" id="ox">✕</button></div>
    <div class="mb"><div class="table-wrap"><table class="t"><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>
      ${o.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${i.qty}</td><td class="num">${money(i.price)}</td><td class="num">${money(i.qty * i.price)}</td></tr>`).join("")}</tbody></table></div>
      <div class="totals"><b class="tabnum">Total ${money(o.total)}</b></div>
      <div class="grid2"><div><label class="lb" for="os">Estado</label><select class="in" id="os">${O_STATUS.map(s => `<option ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div><label class="lb" for="op">Pago</label><select class="in" id="op">${PAY_STATUS.map(s => `<option ${o.payment === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div><label class="lb" for="oterm">Forma de pago</label><select class="in" id="oterm"><option value="">—</option>${TERMS.map(x => `<option ${o.terms === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div><label class="lb" for="odue">Fecha límite de pago (opcional)</label><input class="in" id="odue" type="date" value="${esc(o.dueDate || "")}"></div>
        <div class="full"><label class="lb" for="on">Notas (dirección, guía de envío…)</label><textarea class="in" id="on" rows="3">${esc(o.notes || "")}</textarea></div></div>
      <div class="pay-line"><span>Pagado <b class="tabnum">${money(paidOf(o))}</b> · falta <b class="tabnum">${money(balanceOf(o))}</b></span>${owes(o) ? '<button class="btn sm" type="button" id="oPay">Registrar pago</button>' : ""}</div>
      ${o.shipping ? `<div class="ship"><b>Envío:</b> ${esc({ fulfilled: "Despachado", partial: "Despacho parcial", in_transit: "En camino", out_for_delivery: "En reparto", delivered: "Entregado", attempted_delivery: "Intento de entrega", failure: "Problema en la entrega", ready_for_pickup: "Listo para recoger", confirmed: "Guía generada", label_printed: "Guía impresa" }[o.shipping.status] || o.shipping.status || "En preparación")}${o.shipping.company ? " · " + esc(o.shipping.company) : ""}${o.shipping.number ? " · guía " + esc(o.shipping.number) : ""}${o.shipping.url ? ` · <a href="${esc(o.shipping.url)}" target="_blank" rel="noopener">Rastrear envío ↗</a>` : ""}</div>` : ""}
      <div class="chrow" style="margin:8px 0">${o.contactId ? '<button class="btn sm" type="button" id="oChat">Abrir conversación</button>' : ""}${o.shopifyUrl ? `<a class="btn sm" href="${esc(o.shopifyUrl)}" target="_blank" rel="noopener">Abrir en Shopify ↗</a>` : ""}</div>
      <small class="muted">Creado ${fmtDT(o.createdAt)} por ${esc(o.createdByName || "")}${o.quoteNumber ? " desde " + esc(o.quoteNumber) : ""}${o.shopifyName ? " · pedido Shopify " + esc(o.shopifyName) : ""}</small>
      ${o.siigoName || o.siigoId ? `<div class="app-badge"><span class="itile-ic sm" style="--ic:${APP_COLORS.siigo}">${APP_ICONS.siigo}</span> Facturado en Siigo: <b>${esc(o.siigoName || o.siigoId)}</b> · ${fmtDT(o.siigoAt)}</div>` : ""}</div>
    <div class="mf">${(S.apps || {}).siigo && S.apps.siigo.on && !o.siigoId ? '<button class="btn" type="button" id="oSiigo">Facturar en Siigo</button><span class="spacer"></span>' : ""}<button class="btn" type="button" id="oc">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
  $("#ox").onclick = $("#oc").onclick = () => m.close();
  if ($("#oSiigo")) $("#oSiigo").onclick = async () => {
    if (!await ask(`¿Crear la factura del pedido ${o.number} por ${money(o.total)} en Siigo?`, "Facturar")) return;
    const b = $("#oSiigo"); if (b) { b.disabled = true; b.textContent = "Facturando…"; }
    try { const r = await appCall("siigoInvoice", { orderId: id }); m.close(); toast(`Factura ${r.name || ""} creada en Siigo`); }
    catch (er) { toast(errMsg(er)); if (b) { b.disabled = false; b.textContent = "Facturar en Siigo"; } }
  };
  if ($("#oPay")) $("#oPay").onclick = () => { m.close(); openPayment(id); };
  if ($("#oChat")) $("#oChat").onclick = () => { m.close(); go("conv", o.contactId); };
  $("#of2").onsubmit = async e => { e.preventDefault(); await fb.update("orders/" + id, { status: $("#os").value, payment: $("#op").value, terms: $("#oterm").value, dueDate: $("#odue").value, notes: $("#on").value.trim(), ...stamp() }); m.close(); toast("Pedido actualizado"); };
  m.showModal();
}

// ======================= Productos =======================
function viewProductos(el) {
  const q = norm(S.pQ || "");
  const list = S.products.filter(p => !q || norm(p.name + " " + (p.desc || "") + " " + (p.category || "") + " " + (p.sku || "")).includes(q)).sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Productos</h1><span class="sub tabnum">${S.products.length}</span><span class="spacer"></span><button class="btn primary" id="np">+ Nuevo producto</button></div>
    <div class="toolbar"><input class="in" id="pq" placeholder="Buscar producto" value="${esc(S.pQ || "")}"></div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Producto</th><th>Categoría</th><th>Descripción</th><th class="num">Precio detal</th><th class="num">Precio por mayor</th><th class="num">Mayor desde</th><th>Estado</th></tr></thead><tbody>
      ${list.map(p => `<tr data-id="${p.id}"><td class="pthumb">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ""}</td><td><b>${esc(p.name)}</b>${p.available === false ? ' <span class="soldout">Agotado</span>' : ""}</td><td>${esc(p.category || "")}</td><td>${esc(p.desc || "")}</td><td class="num">${(b => { const before = p.compareAt > p.priceRetail ? p.compareAt : b ? p.priceRetail : 0;
        return before ? `<s class="muted">${money(before)}</s> <b class="promo-price">${money(b ? b.price : p.priceRetail)}</b><br><span class="pill amber" title="${esc(b ? b.promo.name : "Oferta de Shopify")}">🔥 ${esc(b ? b.promo.name : "Oferta")}</span>` : money(p.priceRetail); })(bestPromo(p))}</td><td class="num">${p.priceWholesale ? money(p.priceWholesale) : ""}</td><td class="num">${p.minWholesale || ""}</td><td>${p.active === false ? '<span class="pill">Inactivo</span>' : '<span class="pill green">Activo</span>'}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><p><b>Tu catálogo está vacío.</b></p><p>Agrega tus productos con precio al detal y al por mayor, por ejemplo una sábana para cama de 1.40.</p></div>`}</div>`;
  $("#pq").oninput = e => { S.pQ = e.target.value; renderShell(); };
  $("#np").onclick = () => openProduct(null);
  $$("tbody tr", el).forEach(tr => tr.onclick = () => openProduct(tr.dataset.id));
}
function openProduct(id) {
  const p = id ? byId(S.products, id) : { active: true }, m = $("#modal");
  const cats = [...new Set(S.products.map(x => x.category).filter(Boolean))];
  m.innerHTML = `<form id="pf2"><div class="mh"><h2>${id ? esc(p.name) : "Nuevo producto"}</h2><button class="iconbtn" type="button" id="px">✕</button></div>
    <div class="mb"><div class="grid2">
      <div class="full"><label class="lb" for="pn">Nombre</label><input class="in" id="pn" required value="${esc(p.name || "")}" placeholder="Ej: Silver Unicolor 1.40"></div>
      <div><label class="lb" for="pc">Categoría</label><input class="in" id="pc" list="pcl" value="${esc(p.category || "")}" placeholder="Sábanas, protectores…"><datalist id="pcl">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
      <div><label class="lb" for="psku">Referencia</label><input class="in" id="psku" value="${esc(p.sku || "")}"></div>
      <div class="full"><label class="lb" for="pd">Descripción corta</label><input class="in" id="pd" value="${esc(p.desc || "")}" placeholder="Ej: 50% microfibra, 50% algodón"></div>
      <div class="full pimg-row">${p.image ? `<img class="pimg" src="${esc(p.image)}" alt="">` : ""}<div style="flex:1"><label class="lb" for="pimg">Foto (enlace https)</label><input class="in" id="pimg" type="url" value="${esc(p.image || "")}" placeholder="https://… (se llena sola al importar de Shopify)"></div></div>
      <div><label class="lb" for="pr">Precio al detal</label><input class="in tabnum" id="pr" inputmode="numeric" required value="${p.priceRetail || ""}"></div>
      <div><label class="lb" for="pw">Precio por mayor</label><input class="in tabnum" id="pw" inputmode="numeric" value="${p.priceWholesale || ""}"></div>
      <div><label class="lb" for="pm">Por mayor desde (unidades)</label><input class="in tabnum" id="pm" type="number" min="1" value="${p.minWholesale || ""}"></div>
      <div><label class="lb" for="pa">Estado</label><select class="in" id="pa"><option value="1">Activo</option><option value="0" ${p.active === false ? "selected" : ""}>Inactivo</option></select></div>
    </div></div>
    <div class="mf">${id && isAdmin() ? '<button class="btn danger" type="button" id="pdel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="pcn">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
  $("#px").onclick = $("#pcn").onclick = () => m.close();
  if ($("#pdel")) $("#pdel").onclick = async () => { if (!await ask("¿Eliminar " + p.name + "?", "Eliminar")) return; await fb.remove("products/" + id); m.close(); };
  $("#pf2").onsubmit = async e => {
    e.preventDefault();
    const img = $("#pimg").value.trim();
    if (img && !/^https:\/\/\S+$/.test(img)) return toast("La foto debe ser un enlace que empiece por https://");
    const data = { name: $("#pn").value.trim(), category: $("#pc").value.trim(), sku: $("#psku").value.trim(), desc: $("#pd").value.trim(), image: img,
      priceRetail: num($("#pr").value), priceWholesale: num($("#pw").value), minWholesale: Number($("#pm").value) || 0, active: $("#pa").value === "1", ...stamp() };
    try { id ? await fb.update("products/" + id, data) : await fb.add("products", { ...data, createdAt: Date.now() }); m.close(); toast("Producto guardado"); }
    catch (er) { toast(/permission/i.test(errMsg(er)) ? "Solo la administradora puede cambiar productos." : "No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
}

// ======================= Promociones =======================
// Misma lógica que functions/promos.js (la usa Sofía): vigencia, a qué productos aplica y precio con descuento
const PROMO_TYPES = { porcentaje: "% de descuento", valor: "Pesos menos por unidad", precio: "Precio especial", envio: "Envío gratis", regalo: "Regalo", otro: "Otro beneficio" };
const promoActive = (p, now = Date.now()) => p && p.on !== false && p.name && (!p.start || p.start <= isoBogota(now)) && (!p.end || p.end >= isoBogota(now));
const isoBogota = ms => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const promoApplies = (pr, p) => pr.scope === "categoria" ? (pr.categories || []).map(norm).includes(norm(p.category || ""))
  : pr.scope === "productos" ? (pr.productIds || []).some(id => id === p.id || String(p.id).startsWith(id + "_")) : true;
function promoUnit(pr, base, qty = 1) {
  if (!base || (pr.minQty && qty < pr.minQty)) return null;
  const v = Number(pr.value) || 0;
  const x = pr.type === "porcentaje" ? base * (1 - Math.min(100, v) / 100) : pr.type === "valor" ? base - v : pr.type === "precio" ? v : null;
  return x === null || x <= 0 || x >= base ? null : Math.round(x);
}
// Mejor precio con promoción vigente para 1 unidad: { price, promo } o null
function bestPromo(p) {
  let best = null;
  for (const pr of (S.promos || []).filter(x => promoActive(x))) {
    if (!promoApplies(pr, p)) continue;
    const x = promoUnit(pr, p.priceRetail || 0, 1);
    if (x !== null && (!best || x < best.price)) best = { price: x, promo: pr };
  }
  return best;
}
function promoCondition(pr) {
  const v = Number(pr.value) || 0;
  const what = pr.type === "porcentaje" ? `${v}% de descuento` : pr.type === "valor" ? `${money(v)} menos por unidad` : pr.type === "precio" ? `Precio especial ${money(v)}`
    : pr.type === "envio" ? "Envío gratis" : pr.type === "regalo" ? "Regalo" : "Beneficio";
  const on = pr.scope === "categoria" ? `en ${(pr.categories || []).join(", ") || "—"}` : pr.scope === "productos" ? `en ${(pr.productIds || []).length} producto(s)` : "en todo el catálogo";
  return `${what} ${on}${pr.minQty ? ` · desde ${pr.minQty} unidades` : ""}${pr.code ? ` · código ${pr.code}` : ""}`;
}
function promoState(pr) {
  const t = isoBogota(Date.now());
  if (pr.on === false) return ["Apagada", ""];
  if (pr.start && pr.start > t) return ["Programada", "blue"];
  if (pr.end && pr.end < t) return ["Vencida", "red"];
  return ["Activa", "green"];
}
function viewPromociones(el) {
  const adm = isAdmin(), list = [...(S.promos || [])].sort((a, b) => (promoActive(b) - promoActive(a)) || String(a.name).localeCompare(String(b.name)));
  el.innerHTML = `<div class="page"><div class="page-head"><div><h1>Promociones</h1><span class="sub">Descuentos y beneficios que ${esc(aiName())} ofrece a los clientes mientras estén vigentes.</span></div><span class="spacer"></span>
      ${adm ? '<button class="btn primary" id="newPromo">+ Nueva promoción</button>' : ""}</div>
    ${list.length ? `<div class="promo-list">${list.map(pr => { const [st, cls] = promoState(pr); return `<button class="promo-card" data-promo="${pr.id}">
        <div class="pc-h"><b>${esc(pr.name)}</b>${pr.source === "Shopify" ? '<span class="pill">Shopify</span>' : ""}${pr.visibility === "demanda" ? '<span class="pill">Bajo demanda</span>' : pr.visibility === "interna" ? '<span class="pill">Interna</span>' : ""}${pr.onlyBuyers ? '<span class="pill">Solo quien ya compró</span>' : ""}<span class="pill ${cls}">${st}</span></div>
        <div class="pc-c">${esc(promoCondition(pr))}</div>
        ${pr.desc ? `<p class="muted">${esc(pr.desc)}</p>` : ""}
        <small class="muted">${pr.start || pr.end ? `Vigencia: ${pr.start ? "desde " + pr.start : ""}${pr.end ? " hasta " + pr.end : ""}` : "Sin fecha de fin"}</small></button>`; }).join("")}</div>`
      : `<div class="empty"><p><b>Aún no hay promociones.</b></p><p>Por ejemplo: 15% en sábanas este mes, envío gratis desde 6 unidades o un precio especial para un producto. ${esc(aiName())} solo ofrece lo que esté aquí y vigente.</p></div>`}
    <p class="muted" style="font-size:12.5px;margin-top:14px">${esc(aiName())} ofrece estas promociones tal cual: no inventa descuentos ni los combina. Si un cliente pide un descuento mayor o distinto, pasa el chat a una persona. Las cotizaciones que prepara ya traen el precio con la promoción.</p></div>`;
  if ($("#newPromo")) $("#newPromo").onclick = () => openPromo(null);
  $$("[data-promo]", el).forEach(b => b.onclick = () => adm ? openPromo(b.dataset.promo) : null);
}
function openPromo(id) {
  const base = id ? byId(S.promos, id) : null, m = $("#modal");
  const pr = base ? JSON.parse(JSON.stringify(base)) : { name: "", desc: "", type: "porcentaje", value: 10, scope: "todo", categories: [], productIds: [], minQty: 0, code: "", start: isoBogota(Date.now()), end: "", on: true };
  const cats = [...new Set(S.products.map(p => p.category).filter(Boolean))].sort();
  let pq = "";
  const read = () => {
    pr.name = $("#prn").value.trim(); pr.desc = $("#prd").value.trim(); pr.type = $("#prt").value; pr.value = !$("#prv") ? 0 : pr.type === "porcentaje" ? Number(String($("#prv").value).replace(",", ".")) || 0 : num($("#prv").value);
    pr.scope = $("#prs").value; pr.minQty = Number($("#prm").value) || 0; pr.code = $("#prc").value.trim(); pr.start = $("#pra").value; pr.end = $("#prb").value; pr.on = $("#pro").checked;
    pr.visibility = $("#prvis").value; pr.priority = Number($("#prpri").value) || 0; pr.when = $("#prwhen").value.trim(); pr.onlyBuyers = $("#prbuy").checked;
    if ($("#prcats")) pr.categories = $$("[data-cat]:checked", m).map(x => x.dataset.cat);
    if ($("#prprods")) { const seen = new Set($$("[data-pid]", m).map(x => x.dataset.pid)); pr.productIds = [...(pr.productIds || []).filter(x => !seen.has(x)), ...$$("[data-pid]:checked", m).map(x => x.dataset.pid)]; }
  };
  const draw = () => {
    const priced = ["porcentaje", "valor", "precio"].includes(pr.type);
    const prods = S.products.filter(p => p.active !== false && (!pq || norm(p.name + " " + (p.category || "")).includes(norm(pq)))).slice(0, 80);
    m.innerHTML = `<form id="prf"><div class="mh"><h2>${id ? "Editar promoción" : "Nueva promoción"}</h2><button class="iconbtn" type="button" id="prx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><div class="grid2">
        <div class="full"><label class="lb" for="prn">Nombre</label><input class="in" id="prn" required value="${esc(pr.name)}" placeholder="Ej: Mes de las sábanas"></div>
        <div class="full"><label class="lb" for="prd">Texto para el cliente (opcional)</label><input class="in" id="prd" value="${esc(pr.desc || "")}" placeholder="Ej: Aprovecha 15% en todas las sábanas hasta fin de mes"></div>
        <div><label class="lb" for="prt">Tipo</label><select class="in" id="prt">${Object.entries(PROMO_TYPES).map(([k, t]) => `<option value="${k}" ${pr.type === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        ${priced ? `<div><label class="lb" for="prv">${pr.type === "porcentaje" ? "Porcentaje" : pr.type === "valor" ? "Pesos menos por unidad" : "Precio especial por unidad"}</label><input class="in tabnum" id="prv" inputmode="numeric" required value="${pr.value || ""}"></div>` : "<div></div>"}
        <div><label class="lb" for="prs">Aplica a</label><select class="in" id="prs"><option value="todo" ${pr.scope === "todo" ? "selected" : ""}>Todo el catálogo</option><option value="categoria" ${pr.scope === "categoria" ? "selected" : ""}>Categorías</option><option value="productos" ${pr.scope === "productos" ? "selected" : ""}>Productos específicos</option></select></div>
        <div><label class="lb" for="prm">Desde cuántas unidades (opcional)</label><input class="in tabnum" id="prm" type="number" min="0" value="${pr.minQty || ""}"></div>
        ${pr.scope === "categoria" ? `<div class="full" id="prcats"><label class="lb">Categorías</label><div class="chk-grid">${cats.map(c => `<label class="switch sm"><input type="checkbox" data-cat="${esc(c)}" ${(pr.categories || []).includes(c) ? "checked" : ""}> <span>${esc(c)}</span></label>`).join("") || '<span class="muted">Tus productos aún no tienen categoría.</span>'}</div></div>` : ""}
        ${pr.scope === "productos" ? `<div class="full" id="prprods"><label class="lb" for="prq">Productos (${(pr.productIds || []).length} elegidos)</label><input class="in" id="prq" placeholder="Buscar producto" value="${esc(pq)}" autocomplete="off">
          <div class="chk-list">${prods.map(p => `<label class="switch sm"><input type="checkbox" data-pid="${p.id}" ${(pr.productIds || []).includes(p.id) ? "checked" : ""}> <span>${esc(p.name)} <small class="muted">${money(p.priceRetail)}</small></span></label>`).join("")}</div></div>` : ""}
        <div><label class="lb" for="pra">Desde</label><input class="in" id="pra" type="date" value="${esc(pr.start || "")}"></div>
        <div><label class="lb" for="prb">Hasta (opcional)</label><input class="in" id="prb" type="date" value="${esc(pr.end || "")}"></div>
        <div><label class="lb" for="prc">Código (opcional)</label><input class="in" id="prc" value="${esc(pr.code || "")}" placeholder="Ej: SABANAS15"></div>
        <div style="align-self:end"><label class="switch"><input type="checkbox" id="pro" ${pr.on !== false ? "checked" : ""}> <span>Activa</span></label></div>
        <div><label class="lb" for="prvis">Quién la inicia</label><select class="in" id="prvis">${[["publica", `Pública (${esc(aiName())} la ofrece)`], ["demanda", "Bajo demanda (solo si el cliente da el código)"], ["interna", `Interna (${esc(aiName())} no la acepta)`]].map(([k, t]) => `<option value="${k}" ${(pr.visibility || "publica") === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div><label class="lb" for="prpri">Prioridad</label><input class="in" id="prpri" type="number" min="0" max="100" value="${Number(pr.priority) || 10}"></div>
        <div class="full"><label class="lb" for="prwhen">Cuándo ofrecerla (lo lee ${esc(aiName())})</label><input class="in" id="prwhen" value="${esc(pr.when || "")}" placeholder="Ofrécelo si el cliente duda del precio"></div>
        <div class="full"><label class="switch sm"><input type="checkbox" id="prbuy" ${pr.onlyBuyers ? "checked" : ""}> <span>Solo para quien ya compró</span></label><small class="muted" style="display:block">Se verifica con los pedidos del cliente: no se le muestra ni se le aplica a quien nunca ha comprado.</small></div>
      </div><p class="muted" style="margin:10px 0 0">${esc(aiName())} la ofrecerá así: <b id="prprev">${esc(promoCondition(pr))}</b></p></div>
      <div class="mf">${id ? '<button class="btn danger" type="button" id="prdel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="prcancel">Cancelar</button><button class="btn primary">Guardar</button></div></form>`;
    $("#prx").onclick = $("#prcancel").onclick = () => m.close();
    ["#prt", "#prs"].forEach(s => $(s).onchange = () => { read(); setTimeout(draw); });
    ["#prv", "#prm", "#prc"].forEach(s => $(s) && ($(s).oninput = () => { read(); $("#prprev").textContent = promoCondition(pr); }));
    $$("[data-cat],[data-pid]", m).forEach(x => x.onchange = () => { read(); $("#prprev").textContent = promoCondition(pr); });
    if ($("#prq")) $("#prq").oninput = e => { read(); pq = e.target.value; draw(); const i = $("#prq"); i.focus(); i.setSelectionRange(pq.length, pq.length); };
    if ($("#prdel")) $("#prdel").onclick = async () => { if (!await ask("¿Eliminar la promoción " + pr.name + "?", "Eliminar")) return; await fb.remove("promos/" + id); m.close(); toast("Promoción eliminada"); };
    $("#prf").onsubmit = async e => {
      e.preventDefault(); read();
      if (["porcentaje", "valor", "precio"].includes(pr.type) && !(pr.value > 0)) return toast("Escribe el valor del descuento.");
      if (pr.type === "porcentaje" && pr.value >= 100) return toast("El porcentaje debe ser menor a 100.");
      if (pr.scope === "categoria" && !pr.categories.length) return toast("Elige al menos una categoría.");
      if (pr.scope === "productos" && !pr.productIds.length) return toast("Elige al menos un producto.");
      if (pr.start && pr.end && pr.end < pr.start) return toast("La fecha de fin es anterior a la de inicio.");
      const data = { ...pr, ...stamp() }; delete data.id;
      try { id ? await fb.set("promos/" + id, data, false) : await fb.add("promos", { ...data, createdAt: Date.now() }); m.close(); toast("Promoción guardada"); }
      catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
    };
  };
  draw(); m.showModal();
}

// ======================= Plantillas =======================
function viewPlantillas(el) {
  const list = [...S.templates].sort((a, b) => Object.keys(SITUATIONS).indexOf(a.key) - Object.keys(SITUATIONS).indexOf(b.key));
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Plantillas</h1><span class="spacer"></span>${isAdmin() ? '<button class="btn primary" id="nt">+ Nueva plantilla</button>' : ""}</div>
    <p class="muted" style="max-width:70ch">El mensaje sugerido en Hoy sale de la plantilla de cada situación. Puedes usar {nombre}, {producto}, {precio}, {cotizacion}, {total}, {hotel}, {asesor} y {empresa}.
      Si la plantilla está aprobada en WhatsApp (Meta), escribe su nombre exacto para poder enviarla cuando la ventana de 24 h esté cerrada.</p>
    ${!list.length && isAdmin() ? `<div class="empty"><p>No hay plantillas guardadas: se usan las de ejemplo.</p><button class="btn primary" id="seed">Crear las plantillas de ejemplo</button></div>` : ""}
    ${isAdmin() ? waTplSection() : ""}
    <h2 class="sec-t">Plantillas del CRM</h2>
    <div style="display:grid;gap:10px;margin-top:12px">${(list.length ? list : DEFAULT_TEMPLATES).map(t => `<div class="card" style="padding:14px 16px;cursor:${list.length ? "pointer" : "default"}" data-id="${t.id || ""}">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(t.name)}</b><span class="pill">${esc(SITUATIONS[t.key] || t.key || "Otra")}</span>${t.waName ? `<span class="pill ${!t.waStatus || t.waStatus === "APPROVED" ? "green" : t.waStatus === "REJECTED" ? "red" : ""}">WhatsApp: ${esc(t.waName)}${t.waStatus && t.waStatus !== "APPROVED" ? " · " + esc(WA_ST[t.waStatus] || t.waStatus) : ""}</span>` : ""}</div>
      <p style="margin:6px 0 0;white-space:pre-wrap">${esc(t.text)}</p></div>`).join("")}</div></div>`;
  if ($("#nt")) $("#nt").onclick = () => openTemplate(null);
  if ($("#nwt")) $("#nwt").onclick = () => openWaTemplate();
  if ($("#syncWt")) $("#syncWt").onclick = async e => { const b = e.currentTarget; b.disabled = true; b.textContent = "Consultando a Meta…";
    try { const r = await fb.call("plantillasWhatsApp", { action: "listar" }); toast(r.list.length + " plantillas en Meta"); } catch (er) { toast(errMsg(er)); } finally { b.disabled = false; b.textContent = "Actualizar estado"; } };
  $$("[data-delwt]", el).forEach(b => b.onclick = async () => { if (!await ask(`¿Eliminar la plantilla «${b.dataset.delwt}» de Meta? No se puede deshacer y el nombre no se podrá reusar por 30 días.`, "Eliminar")) return;
    try { await fb.call("plantillasWhatsApp", { action: "eliminar", name: b.dataset.delwt }); toast("Plantilla eliminada de Meta"); } catch (er) { toast(errMsg(er)); } });
  if ($("#seed")) $("#seed").onclick = async () => { for (const t of DEFAULT_TEMPLATES) await fb.add("templates", { ...t, ...stamp() }); toast("Plantillas creadas"); };
  if (list.length && isAdmin()) $$("[data-id]", el).forEach(d => d.onclick = () => openTemplate(d.dataset.id));
}
// ---- Plantillas de WhatsApp en Meta: se crean aquí y Meta las revisa (normalmente en minutos) ----
const WA_ST = { APPROVED: "Aprobada", PENDING: "En revisión", IN_APPEAL: "En apelación", REJECTED: "Rechazada", PAUSED: "Pausada", DISABLED: "Desactivada", PENDING_DELETION: "Eliminándose" };
const WA_CAT = { MARKETING: "Marketing", UTILITY: "Utilidad", AUTHENTICATION: "Autenticación" };
const WA_REASON = { PROMOTIONAL: "Meta la consideró promocional: créala como Marketing.", INVALID_FORMAT: "Formato inválido: revisa los campos y el texto.", ABUSIVE_CONTENT: "Meta la consideró contenido no permitido.", TAG_CONTENT_MISMATCH: "La categoría no corresponde al contenido.", SCAM: "Meta la marcó como posible estafa." };
const WA_FIELDS = { enlace: "https://casadorada.co/carrito", nombre: "María", producto: "Juego de sábanas", precio: "$189.900", cotizacion: "COT-0012", total: "$350.000", hotel: "Hotel Central", asesor: "Luisa", empresa: "Casa Dorada" };
function waTplSection() {
  const d = S.waTpl, list = (d && d.list) || [];
  return `<h2 class="sec-t">Plantillas de WhatsApp (aprobadas por Meta)</h2>
    <p class="muted" style="max-width:75ch">Con ellas escribes a clientes después de 24 horas sin respuesta, y envías difusiones desde <a href="#campanas">Campañas</a>. Créalas aquí: House Chat las envía a Meta para aprobación y te muestra el estado.</p>
    <div class="chrow" style="margin:8px 0 12px"><button class="btn primary" id="nwt">+ Crear plantilla de WhatsApp</button><button class="btn" id="syncWt">Actualizar estado</button>${d && d.at ? `<small class="muted">Revisado ${ago(d.at)}</small>` : ""}</div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Plantilla</th><th>Categoría</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(t => `<tr><td><b class="mono" style="font-size:13px">${esc(t.name)}</b><small class="muted" style="display:block;white-space:pre-wrap">${esc((t.body || "").slice(0, 140))}</small></td><td>${esc(WA_CAT[t.category] || t.category)}</td>
        <td><span class="pill ${t.status === "APPROVED" ? "green" : t.status === "REJECTED" || t.status === "DISABLED" ? "red" : ""}">${esc(WA_ST[t.status] || t.status)}</span>${t.reason ? `<small class="err" style="display:block">${esc(WA_REASON[t.reason] || t.reason)}</small>` : ""}</td>
        <td class="num"><button class="link" data-delwt="${esc(t.name)}">Eliminar</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">${d ? "No hay plantillas en tu cuenta de WhatsApp Business." : "Toca «Actualizar estado» para traer las plantillas de tu cuenta."}</p>`}`;
}
function openWaTemplate() {
  const m = $("#modal");
  m.innerHTML = `<form id="wtf"><div class="mh"><h2>Nueva plantilla de WhatsApp</h2><button class="iconbtn" type="button" id="wtx" aria-label="Cerrar">✕</button></div>
    <div class="mb"><div class="wt-grid"><div style="display:grid;gap:10px">
      <div><label class="lb" for="wtn">Nombre</label><input class="in" id="wtn" required maxlength="60" placeholder="Seguimiento de cotización"><small class="muted" id="wtslug"></small></div>
      <div class="grid2"><div><label class="lb" for="wtc">Categoría</label><select class="in" id="wtc"><option value="MARKETING">Marketing (promociones, difusiones)</option><option value="UTILITY">Utilidad (pedidos, cotizaciones, citas)</option></select></div>
        <div><label class="lb" for="wtk">Se usa para</label><select class="in" id="wtk">${Object.entries(SITUATIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}<option value="otra" selected>Difusiones o envío a mano</option></select></div></div>
      <div><label class="lb" for="wth">Encabezado (opcional)</label><input class="in" id="wth" maxlength="60" placeholder="🎉 Promoción de la semana"></div>
      <div><label class="lb" for="wtb">Mensaje</label><textarea class="in" id="wtb" rows="6" maxlength="1024" required placeholder="Hola {nombre}, tenemos {producto} con 30% de descuento solo esta semana. ¿Te envío las fotos?"></textarea>
        <div class="var-chips">${Object.keys(WA_FIELDS).map(k => `<button type="button" data-var="${k}">{${k}}</button>`).join("")}</div>
        <small class="muted">Toca un campo para insertarlo; se llena con los datos de cada cliente. No empieces ni termines el mensaje con un campo.</small></div>
      <div><label class="lb" for="wtf2">Pie (opcional)</label><input class="in" id="wtf2" maxlength="60" placeholder="Casa Dorada · Responde SALIR para no recibir más"></div>
      <div><label class="lb">Botones de respuesta rápida (opcional, hasta 3)</label><div class="grid3"><input class="in wtq" maxlength="25" placeholder="Sí, quiero verlas" aria-label="Botón 1"><input class="in wtq" maxlength="25" placeholder="Ahora no" aria-label="Botón 2"><input class="in wtq" maxlength="25" aria-label="Botón 3"></div></div>
      <div class="grid2"><div><label class="lb" for="wtut">Botón con enlace (opcional)</label><input class="in" id="wtut" maxlength="25" placeholder="Ver tienda"></div><div><label class="lb" for="wtuu">Enlace</label><input class="in" id="wtuu" placeholder="https://casadorada.co"></div></div>
    </div><div class="wt-side"><label class="lb">Así se verá</label><div class="wa-prev" id="wtp"></div><small class="muted" style="display:block;margin-top:8px">Meta la revisa, normalmente en minutos. Las de Marketing tienen costo por mensaje en WhatsApp; las de Utilidad son más baratas pero solo para información de pedidos o cotizaciones, no promociones.</small></div></div></div>
    <div class="mf"><span class="spacer"></span><button class="btn" type="button" id="wtc2">Cancelar</button><button class="btn primary" id="wts">Enviar a Meta</button></div></form>`;
  const slugOf = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  const prev = () => {
    const fill = t => esc(t).replace(/\{\s*([a-záéíóúñ]+)\s*\}/gi, (x, k) => WA_FIELDS[k.toLowerCase()] ? `<b>${esc(WA_FIELDS[k.toLowerCase()])}</b>` : x);
    const q = $$(".wtq", m).map(x => x.value.trim()).filter(Boolean).slice(0, 3), u = $("#wtut").value.trim();
    $("#wtslug").textContent = $("#wtn").value.trim() ? "En Meta: " + slugOf($("#wtn").value) : "";
    $("#wtp").innerHTML = `<div class="bub">${$("#wth").value.trim() ? `<b class="h">${esc($("#wth").value.trim())}</b>` : ""}${fill($("#wtb").value || "Escribe el mensaje…")}${$("#wtf2").value.trim() ? `<small>${esc($("#wtf2").value.trim())}</small>` : ""}</div>
      ${q.length || u ? `<div class="btns">${q.map(x => `<span>${esc(x)}</span>`).join("")}${u ? `<span>↗ ${esc(u)}</span>` : ""}</div>` : ""}`;
  };
  prev(); $$("input,textarea", m).forEach(x => x.addEventListener("input", prev));
  $$("[data-var]", m).forEach(b => b.onclick = () => { const ta = $("#wtb"), p = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, p) + "{" + b.dataset.var + "}" + ta.value.slice(ta.selectionEnd ?? p); ta.focus(); prev(); });
  $("#wtx").onclick = $("#wtc2").onclick = () => m.close();
  $("#wtf").onsubmit = async e => {
    e.preventDefault(); const b = $("#wts"); b.disabled = true; b.textContent = "Enviando…";
    const template = { name: $("#wtn").value.trim(), title: $("#wtn").value.trim(), category: $("#wtc").value, key: $("#wtk").value, header: $("#wth").value, body: $("#wtb").value, footer: $("#wtf2").value,
      buttons: $$(".wtq", m).map(x => x.value.trim()).filter(Boolean), url: $("#wtut").value.trim() || $("#wtuu").value.trim() ? { text: $("#wtut").value.trim(), url: $("#wtuu").value.trim() } : null };
    try { const r = await fb.call("plantillasWhatsApp", { action: "crear", template }); m.close(); toast(`Plantilla enviada a Meta (${WA_ST[r.status] || r.status})`); }
    catch (er) { toast(errMsg(er)); b.disabled = false; b.textContent = "Enviar a Meta"; }
  };
  m.showModal();
}
function openTemplate(id) {
  const t = id ? byId(S.templates, id) : { key: "seguimiento", waLang: "es", waParams: ["nombre"] }, m = $("#modal");
  m.innerHTML = `<form id="tf"><div class="mh"><h2>${id ? esc(t.name) : "Nueva plantilla"}</h2><button class="iconbtn" type="button" id="tx">✕</button></div>
    <div class="mb"><div class="grid2">
      <div><label class="lb" for="tn">Nombre</label><input class="in" id="tn" required value="${esc(t.name || "")}"></div>
      <div><label class="lb" for="tk">Situación</label><select class="in" id="tk">${Object.entries(SITUATIONS).map(([k, v]) => `<option value="${k}" ${t.key === k ? "selected" : ""}>${v}</option>`).join("")}<option value="otra" ${t.key === "otra" ? "selected" : ""}>Otra (solo para enviar a mano)</option></select></div>
      <div class="full"><label class="lb" for="tt">Mensaje</label><textarea class="in" id="tt" rows="4" required>${esc(t.text || "")}</textarea></div></div>
      <fieldset class="fs"><legend>Plantilla aprobada en WhatsApp (opcional)</legend><div class="grid2">
        <div><label class="lb" for="twn">Nombre en Meta</label><input class="in" id="twn" value="${esc(t.waName || "")}" placeholder="ej: seguimiento_cotizacion"></div>
        <div><label class="lb" for="twl">Idioma</label><input class="in" id="twl" value="${esc(t.waLang || "es")}"></div>
        <div class="full"><label class="lb" for="twp">Variables en orden ({{1}}, {{2}}…)</label><input class="in" id="twp" value="${esc((t.waParams || []).join(", "))}" placeholder="nombre, cotizacion"></div></div></fieldset></div>
    <div class="mf">${id ? '<button class="btn danger" type="button" id="tdel">Eliminar</button>' : ""}<span class="spacer"></span><button class="btn" type="button" id="tc">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
  $("#tx").onclick = $("#tc").onclick = () => m.close();
  if ($("#tdel")) $("#tdel").onclick = async () => { if (!await ask("¿Eliminar la plantilla?", "Eliminar")) return; await fb.remove("templates/" + id); m.close(); };
  $("#tf").onsubmit = async e => {
    e.preventDefault();
    const data = { name: $("#tn").value.trim(), key: $("#tk").value, text: $("#tt").value.trim(), waName: $("#twn").value.trim(), waLang: $("#twl").value.trim() || "es",
      waParams: $("#twp").value.split(",").map(s => s.trim().replace(/[{}]/g, "")).filter(Boolean), ...stamp() };
    id ? await fb.update("templates/" + id, data) : await fb.add("templates", data);
    m.close(); toast("Plantilla guardada");
  };
  m.showModal();
}

// ======================= Equipo =======================
function viewEquipo(el) {
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Equipo</h1><span class="spacer"></span>${isAdmin() ? '<button class="btn primary" id="nu">+ Agregar persona</button>' : ""}</div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th class="num">Contactos</th></tr></thead><tbody>
    ${S.team.map(u => `<tr data-id="${u.id}"><td><b>${esc(u.name)}</b></td><td>${esc(u.email || "")}</td><td>${u.role === "admin" ? "Administradora" : "Asesor"}</td><td>${u.active === false ? '<span class="pill red">Sin acceso</span>' : '<span class="pill green">Activo</span>'}</td><td class="num">${S.contacts.filter(c => c.owner === u.name).length}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted">Cada persona entra con su correo y contraseña. Al quitarle el acceso deja de ver el CRM de inmediato.</p></div>`;
  if ($("#nu")) $("#nu").onclick = () => openUser(null);
  if (isAdmin()) $$("tbody tr", el).forEach(tr => tr.onclick = () => openUser(tr.dataset.id));
}
// Mi cuenta: cambiar la propia contraseña
const AUTH_ERR = { "auth/wrong-password": "La contraseña actual no es correcta.", "auth/invalid-credential": "La contraseña actual no es correcta.",
  "auth/weak-password": "La contraseña nueva es muy débil: usa al menos 6 caracteres.", "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
  "auth/requires-recent-login": "Por seguridad, sal y vuelve a entrar, y luego cambia la contraseña.", "auth/network-request-failed": "Sin conexión a internet." };
// ======================= Aviso con sonido (con House Chat abierto) =======================
// Cuando llega un mensaje nuevo de un cliente: suena una campanita y aparece un aviso arriba; al tocarlo se abre el chat.
// Safari solo deja sonar después de que la persona toca la pantalla una vez: el primer toque "desbloquea" el audio.
const soundOn = () => { try { return localStorage.getItem("crm-sound") !== "0"; } catch { return true; } };
let AC = null;
function unlockAudio() {
  try {
    if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; AC = new C(); }
    if (AC.state === "suspended") AC.resume();
    const b = AC.createBuffer(1, 1, 22050), s = AC.createBufferSource(); s.buffer = b; s.connect(AC.destination); s.start(0); // Safari iOS
  } catch { }
}
["pointerdown", "keydown", "touchend"].forEach(ev => addEventListener(ev, unlockAudio, { passive: true }));
function ding() {
  if (!AC || !soundOn()) return;
  try {
    if (AC.state === "suspended") AC.resume();
    const t = AC.currentTime;
    [[880, 0], [1318.5, 0.14]].forEach(([f, d]) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.7);
      o.connect(g); g.connect(AC.destination); o.start(t + d); o.stop(t + d + 0.75);
    });
  } catch { }
}
// Compara la lista anterior de contactos con la nueva y avisa de los mensajes entrantes nuevos
function inboundAlert(prev, list) {
  if (!prev) return;
  const before = new Map(prev.map(c => [c.id, c.lastInboundAt || 0]));
  const fresh = list.filter(c => (c.lastInboundAt || 0) > (before.get(c.id) || 0) && Date.now() - (c.lastInboundAt || 0) < 5 * 60 * 1000)
    .sort((a, b) => b.lastInboundAt - a.lastInboundAt);
  if (!fresh.length) return;
  ding();
  const c = fresh[0];
  if (S.view === "conv" && S.convSel === c.id && document.visibilityState === "visible") return; // ya lo está viendo
  let box = $("#inAlert");
  if (!box) { box = document.createElement("button"); box.id = "inAlert"; box.className = "in-alert"; document.body.appendChild(box); }
  const text = c.lastMessageDir === "in" ? stripWa(c.lastMessage || "") : "Mensaje nuevo";
  box.innerHTML = `<span class="ia-ic">${chIcon(chOf(c), "inl")}</span><span class="ia-tx"><b>${esc(contactName(c))}${fresh.length > 1 ? ` <small>+${fresh.length - 1} más</small>` : ""}</b><span>${esc(text.slice(0, 140))}</span></span>`;
  box.onclick = () => { box.classList.remove("show"); go("conv", c.id); };
  box.classList.add("show");
  clearTimeout(box._t); box._t = setTimeout(() => box.classList.remove("show"), 7000);
}

// ======================= Notificaciones push =======================
// Cada mensaje de un cliente avisa en este dispositivo (función notificarMensaje). En iPhone/iPad Apple solo lo permite
// con House Chat agregado a la pantalla de inicio.
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushState() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "instalar" : "nosoportado";
  if (Notification.permission === "denied") return "bloqueado";
  return S.pushOn ? "on" : "off";
}
const b64uBytes = s => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, ch => ch.charCodeAt(0)); };
function pushBanner() {
  const st = pushState();
  if (st !== "off" || !S.pushInitDone) return "";
  let dis = 0; try { dis = Number(localStorage.getItem("crm-push-dismiss")) || 0; } catch { }
  if (Date.now() - dis < 7 * 864e5) return "";
  return `<div class="banner push-banner"><span>${icon("campana")} Activa las notificaciones para enterarte cada vez que un cliente te escriba.</span>
    <span class="pb-act"><button class="btn sm primary" id="pushOnB">Activar</button><button class="iconbtn" id="pushX" aria-label="Ahora no" title="Ahora no">✕</button></span></div>`;
}
// Al cargar: si ya hay permiso, registra el service worker y vuelve a enviar la suscripción (por si cambió)
async function initPush() {
  if (S.pushInit) return; S.pushInit = true;
  if (!pushSupported()) { S.pushInitDone = true; renderShell(); return; }
  navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "open") { const h = new URL(e.data.url).hash; if (h) location.hash = h; } });
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg && Notification.permission === "granted" ? await reg.pushManager.getSubscription() : null;
    if (sub) { S.pushOn = true; await reg.update().catch(() => { }); fb.call("notificaciones", { action: "subscribe", subscription: sub.toJSON() }).catch(() => { }); }
  } catch (e) { console.warn("notificaciones", e); }
  S.pushInitDone = true; renderShell();
}
async function enablePush() {
  const st = pushState();
  if (st === "instalar") return showInstallHelp();
  if (st === "nosoportado") return toast("Este navegador no permite notificaciones. Usa Chrome, Edge o Safari actualizado.");
  if (st === "bloqueado") return toast("Las notificaciones están bloqueadas: permítelas para House Chat en los ajustes del navegador o del iPad.");
  const perm = await Notification.requestPermission(); // primero, dentro del toque (Safari lo exige)
  if (perm !== "granted") return toast("No se activaron las notificaciones.");
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const { publicKey } = await fb.call("notificaciones", { action: "key" });
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(publicKey) });
    await fb.call("notificaciones", { action: "subscribe", subscription: sub.toJSON() });
    S.pushOn = true; renderShell();
    await fb.call("notificaciones", { action: "test" });
    toast("Notificaciones activadas en este dispositivo ✅");
  } catch (e) { toast("No se pudieron activar: " + errMsg(e)); }
}
function openPushMenu() {
  const m = $("#modal");
  m.innerHTML = `<div class="mh"><h2>Notificaciones</h2><button class="iconbtn" id="px" aria-label="Cerrar">✕</button></div>
    <div class="mb"><p style="margin:0">Están <b>activadas en este dispositivo</b>: te avisamos cada vez que un cliente escribe${S.me.role === "admin" ? "" : " (los chats asignados a ti y los que no tienen responsable)"}.</p></div>
    <div class="mf"><button class="btn" id="poff">Desactivar aquí</button><span class="spacer"></span><button class="btn" id="ptest">Enviar prueba</button><button class="btn primary" id="pok">Listo</button></div>`;
  $("#px").onclick = $("#pok").onclick = () => m.close();
  $("#ptest").onclick = async () => { try { const r = await fb.call("notificaciones", { action: "test" }); toast(r.enviadas ? "Prueba enviada" : "No hay dispositivos activos"); } catch (e) { toast(errMsg(e)); } };
  $("#poff").onclick = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/"), sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await fb.call("notificaciones", { action: "unsubscribe", endpoint: sub.endpoint }); await sub.unsubscribe(); }
      S.pushOn = false; m.close(); renderShell(); toast("Notificaciones desactivadas en este dispositivo");
    } catch (e) { toast(errMsg(e)); }
  };
  m.showModal();
}
// iPhone/iPad: primero hay que agregar House Chat a la pantalla de inicio
function showInstallHelp() {
  const m = $("#modal");
  m.innerHTML = `<div class="mh"><h2>Notificaciones en ${/iPhone/.test(navigator.userAgent) ? "iPhone" : "iPad"}</h2><button class="iconbtn" id="ix" aria-label="Cerrar">✕</button></div>
    <div class="mb"><p style="margin:0 0 10px">En iPhone y iPad, Apple solo permite notificaciones (en Safari y también en Chrome) cuando House Chat está en tu pantalla de inicio. Mientras tanto, con la página abierta te avisa con sonido. Para recibirlas aunque esté cerrada:</p>
      <ol class="steps">${/CriOS|EdgiOS|FxiOS/.test(navigator.userAgent)
        ? `<li>En ${/CriOS/.test(navigator.userAgent) ? "Chrome" : /EdgiOS/.test(navigator.userAgent) ? "Edge" : "Firefox"}, toca el botón <b>Compartir</b> (el cuadrado con la flecha, arriba a la derecha en la barra de la dirección; si no lo ves, está en el menú <b>⋯</b>).</li>`
        : `<li>En Safari, toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>`}
        <li>Elige <b>Agregar a pantalla de inicio</b> (o <b>Agregar a inicio</b>) y toca <b>Agregar</b>.</li>
        <li>Abre <b>House Chat</b> desde el ícono nuevo e inicia sesión.</li>
        <li>Toca <b>Activar</b> en el aviso de notificaciones (o la campana del menú) y permite las notificaciones.</li></ol></div>
    <div class="mf"><span class="spacer"></span><button class="btn primary" id="iok">Entendido</button></div>`;
  $("#ix").onclick = $("#iok").onclick = () => m.close();
  m.showModal();
}

function openAccount() {
  const m = $("#modal");
  m.innerHTML = `<form id="af"><div class="mh"><h2>Mi cuenta</h2><button class="iconbtn" type="button" id="ax" aria-label="Cerrar">✕</button></div>
    <div class="mb">
      <div class="acc-card"><div class="avatar lg c" style="${avColor(S.me.name)}">${esc((S.me.name || "?")[0].toUpperCase())}</div>
        <div><b>${esc(S.me.name || "")}</b><div class="muted">${esc(S.user.email)} · ${S.me.role === "admin" ? "Administradora" : "Asesor"}</div></div></div>
      <fieldset class="fs"><legend>Cambiar contraseña</legend><div class="grid2 pw-grid">
        <div class="full"><label class="lb" for="apc">Contraseña actual</label><input class="in" id="apc" type="password" autocomplete="current-password" required></div>
        <div><label class="lb" for="apn">Contraseña nueva</label><input class="in" id="apn" type="password" autocomplete="new-password" minlength="6" required placeholder="mínimo 6 caracteres"></div>
        <div><label class="lb" for="apr">Repite la contraseña nueva</label><input class="in" id="apr" type="password" autocomplete="new-password" minlength="6" required></div>
      </div>
      <label class="show-pw"><input type="checkbox" id="aps"> Mostrar contraseñas</label>
      <p id="aerr" class="form-err" role="alert"></p></fieldset>
    </div>
    <div class="mf"><button class="btn" type="button" id="ac">Cancelar</button><button class="btn primary" type="submit" id="asave">Cambiar contraseña</button></div></form>`;
  $("#ax").onclick = $("#ac").onclick = () => m.close();
  $("#aps").onchange = e => ["#apc", "#apn", "#apr"].forEach(q => $(q).type = e.target.checked ? "text" : "password");
  $("#af").onsubmit = async e => {
    e.preventDefault();
    const cur = $("#apc").value, nw = $("#apn").value, err = $("#aerr");
    err.textContent = "";
    if (nw.length < 6) return err.textContent = "La contraseña nueva debe tener al menos 6 caracteres.";
    if (nw !== $("#apr").value) return err.textContent = "Las dos contraseñas nuevas no coinciden.";
    if (nw === cur) return err.textContent = "La contraseña nueva es igual a la actual.";
    $("#asave").disabled = true;
    try { await fb.changePassword(cur, nw); m.close(); toast("Contraseña cambiada. La próxima vez entra con la nueva."); }
    catch (er) { err.textContent = AUTH_ERR[er.code] || "No se pudo cambiar: " + errMsg(er); $("#asave").disabled = false; }
  };
  m.style.width = "min(520px, calc(100vw - 24px))";
  m.addEventListener("close", () => { m.style.width = ""; }, { once: true });
  m.showModal();
  $("#apc").focus();
}
function openUser(id) {
  const u = id ? byId(S.team, id) : { role: "asesor", active: true }, m = $("#modal");
  m.innerHTML = `<form id="uf"><div class="mh"><h2>${id ? esc(u.name) : "Agregar persona"}</h2><button class="iconbtn" type="button" id="ux">✕</button></div>
    <div class="mb"><div class="grid2">
      <div><label class="lb" for="un">Nombre</label><input class="in" id="un" required value="${esc(u.name || "")}"></div>
      <div><label class="lb" for="ue">Correo</label><input class="in" id="ue" type="email" required value="${esc(u.email || "")}" ${id ? "disabled" : ""}></div>
      ${id ? "" : '<div><label class="lb" for="up">Contraseña inicial</label><input class="in" id="up" type="text" minlength="6" required placeholder="mínimo 6 caracteres"></div>'}
      <div><label class="lb" for="ur">Rol</label><select class="in" id="ur"><option value="asesor">Asesor</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Administradora</option></select></div>
      ${id && id !== S.user.uid ? `<div><label class="lb" for="upn">Nueva contraseña <span class="muted">(opcional)</span></label><input class="in" id="upn" type="text" minlength="6" autocomplete="off" placeholder="déjala vacía para no cambiarla"></div>` : ""}
      ${id ? `<div><label class="lb" for="ua">Acceso</label><select class="in" id="ua"><option value="1">Activo</option><option value="0" ${u.active === false ? "selected" : ""}>Sin acceso</option></select></div>` : ""}
    </div>${id ? "" : '<p class="muted" style="margin:0">Comparte el correo y la contraseña con la persona. Puede cambiarla con "Olvidé mi contraseña".</p>'}</div>
    <div class="mf"><button class="btn" type="button" id="uc">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
  $("#ux").onclick = $("#uc").onclick = () => m.close();
  $("#uf").onsubmit = async e => {
    e.preventDefault();
    try {
      if (id) {
        if (id === S.user.uid && ($("#ua").value === "0" || $("#ur").value !== "admin") && !await ask("Vas a quitarte el rol de administradora o el acceso. ¿Seguro?", "Sí")) return;
        await fb.update("users/" + id, { name: $("#un").value.trim(), role: $("#ur").value, active: $("#ua").value === "1", ...stamp() });
        const np = $("#upn") ? $("#upn").value.trim() : "";
        if (np) { if (np.length < 6) return toast("La contraseña debe tener al menos 6 caracteres."); await fb.call("setTeamPassword", { uid: id, password: np }); }
      } else await fb.call("createTeamUser", { name: $("#un").value.trim(), email: $("#ue").value.trim(), password: $("#up").value, role: $("#ur").value });
      m.close(); toast("Guardado");
    } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
}

// ======================= Importar Excel =======================
const SHEET_SEG = { "prosp hoteles": ["Hoteles", "Prospecto"], "hoteles activos": ["Hoteles", "Cliente"], "prosp dotacion": ["Dotación", "Prospecto"],
  "prosp servicio": ["Servicio", "Prospecto"], "servicio activos": ["Servicio", "Cliente"], "prosp dist": ["Distribución", "Prospecto"], "dist activos": ["Distribución", "Cliente"] };
const hk = v => norm(v).replace(/auto\W*$/, "").replace(/[^a-z0-9]/g, "");
const COLMAP = {
  name: ["nombrecontacto", "contactopuertadeentrada"], company: ["nombredelhotel", "empresa", "nombreempresa", "proyecto"], cargo: ["cargo", "cargorolpublico"],
  phone: ["whatsapp", "telefonowhatsapppublico"], email: ["correo", "emailpublico"], city: ["ciudad"], stage: ["etapa", "etapapipeline", "estadocontacto", "estado"],
  temperature: ["temperatura"], potential: ["potencial"], owner: ["responsable"], level: ["nivel"], nextDate: ["proxseguimiento"], lastContact: ["ultimocontacto"],
};
const OBS = ["obervacion1", "obervacion2", "observacion1", "observacion2", "notas", "notasresultado", "siguientepaso", "estadodeinvestigacion"];
function cellIso(v) { if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); const m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(v); }
function stageFrom(v, type) {
  const s = norm(v);
  if (type === "Cliente") return "Ganado";
  const found = STAGES.find(x => norm(x) === s); if (found) return found;
  if (/cotiz/.test(s)) return "Cotización enviada"; if (/negoci/.test(s)) return "Negociación"; if (/ganad|cerrad/.test(s)) return "Ganado";
  if (/perdid|descart/.test(s)) return "Perdido"; if (/contact|reunion|demo|propuesta/.test(s)) return "Contactado"; return "Nuevo";
}
export function parseWorkbook(rowsBySheet) {
  const out = new Map(), report = [];
  for (const [sheet, rows] of Object.entries(rowsBySheet)) {
    const seg = SHEET_SEG[norm(sheet)];
    if (!seg) { report.push(`“${sheet}”: no es una hoja de contactos, se omitió`); continue; }
    let hi = -1, best = 0;
    for (let i = 0; i < Math.min(8, rows.length); i++) { const n = rows[i].filter(h => Object.values(COLMAP).flat().includes(hk(h))).length; if (n > best) { best = n; hi = i; } }
    if (best < 2) { report.push(`“${sheet}”: no encontré los encabezados`); continue; }
    const hdr = rows[hi].map(h => String(h).trim()), keys = hdr.map(hk);
    let n = 0;
    for (const row of rows.slice(hi + 1)) {
      const c = { segment: seg[0], type: seg[1], sourceSheet: sheet, extra: {} }, obs = [];
      keys.forEach((k, i) => {
        const raw = row[i]; if (raw === "" || raw == null) return;
        const field = Object.keys(COLMAP).find(f => COLMAP[f].includes(k));
        const v = ["nextDate", "lastContact"].includes(field) ? cellIso(raw) : String(raw).trim();
        if (field && c[field] == null) c[field] = v; else if (OBS.includes(k)) obs.push(v); else if (hdr[i]) c.extra[hdr[i].replace(/[▼⚡]/g, "").trim()] = typeof raw === "number" && /fecha|verificado/i.test(hdr[i]) ? cellIso(raw) : String(raw).trim();
      });
      if (!c.name && !c.company) continue;
      if (c.owner && ["alto", "medio", "bajo"].includes(norm(c.owner))) { c.potential = c.potential || c.owner; delete c.owner; }
      if (c.type === "Cliente" && c.stage) c.clientStatus = c.stage;
      c.stage = stageFrom(c.stage, c.type);
      if (obs.length) c.obs = obs.join(" · ");
      if (c.nextDate && !isoRe.test(c.nextDate)) delete c.nextDate;
      const pid = phoneId(c.phone), id = pid ? "wa_" + pid : "x_" + hk(sheet) + "_" + hk(c.name + c.company).slice(0, 40) + "_" + n;
      if (out.has(id)) { const prev = out.get(id); out.set(id, { ...c, ...prev, extra: { ...c.extra, ...prev.extra }, obs: [prev.obs, c.obs].filter(Boolean).join(" · ") || undefined }); }
      else out.set(id, c);
      n++;
    }
    report.push(`“${sheet}”: ${n} contactos`);
  }
  return { contacts: out, report };
}
function viewImportar(el) {
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Importar Excel</h1></div>
    <div class="card" style="padding:20px;display:grid;gap:12px;max-width:720px">
      <p style="margin:0">Carga tu archivo <b>CasaDorada_CRM.xlsx</b> (en Google Drive: Archivo › Descargar › Microsoft Excel). Se importan las pestañas de prospectos y clientes; los datos que no tienen campo propio quedan en "Datos del Excel" dentro de cada ficha.</p>
      <p class="muted" style="margin:0">Los contactos con el mismo WhatsApp se unen en una sola ficha. Si vuelves a importar, se actualizan los que ya existen y no se borra nada.</p>
      ${isAdmin() ? `<label class="btn primary" style="justify-self:start">Elegir archivo<input type="file" id="xf" accept=".xlsx,.xls" hidden></label>` : '<p class="muted">Solo la administradora puede importar.</p>'}
      <pre id="xr" class="muted" style="white-space:pre-wrap;margin:0">${esc(S.importMsg || "")}</pre></div></div>`;
  if (!$("#xf")) return;
  $("#xf").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (typeof XLSX === "undefined") return info("No se pudo cargar el lector de Excel. Revisa tu conexión y recarga.");
    const wb = XLSX.read(await f.arrayBuffer());
    const rowsBy = {}; wb.SheetNames.forEach(n => rowsBy[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true }));
    const { contacts, report } = parseWorkbook(rowsBy);
    if (!await ask(`Se van a importar ${contacts.size} contactos:\n\n${report.join("\n")}\n\n¿Continuar?`, "Importar")) return;
    S.importMsg = "Importando…"; $("#xr").textContent = S.importMsg;
    const now = Date.now(), ops = [];
    for (const [id, c] of contacts) {
      const exists = byId(S.contacts, id);
      const data = JSON.parse(JSON.stringify({ ...c, ...stamp() }));
      if (!exists) Object.assign(data, { createdAt: now, stageAt: now, unread: 0 });
      ops.push({ op: "set", path: "contacts/" + id, data, merge: true });
    }
    try { await fb.batch(ops, (d, t) => { S.importMsg = `Importando… ${d} de ${t}`; if ($("#xr")) $("#xr").textContent = S.importMsg; }); S.importMsg = "Listo:\n" + report.join("\n"); toast(contacts.size + " contactos importados"); }
    catch (er) { S.importMsg = "Error: " + errMsg(er); }
    if ($("#xr")) $("#xr").textContent = S.importMsg;
  };
}

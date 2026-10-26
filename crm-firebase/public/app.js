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

function startData() {
  const w = (name, path, opts) => S.unsubs.push(fb.watch(path, list => { S[name] = list; S.loaded[name] = true; S.syncedAt = Date.now(); scheduleRender(); }, opts,
    e => toast("No se pudo leer " + name + ": " + errMsg(e))));
  S.unsubs.push(fb.watch("contacts", list => { inboundAlert(S.loaded.contacts ? S.contacts : null, list); S.contacts = list; S.loaded.contacts = true; S.syncedAt = Date.now(); scheduleRender(); }, undefined,
    e => toast("No se pudo leer contacts: " + errMsg(e))));
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
  S.unsubs.push(fb.watchDoc("settings/asesora", d => { S.ai = d || {}; scheduleRender(); }, () => { S.ai = {}; }));
  S.unsubs.push(fb.watchDoc("settings/channels", d => { S.ch = d || {}; scheduleRender(); }, () => { S.ch = {}; }));
  // Estado del puente de WhatsApp por QR (solo la administradora puede leerlo); late cada minuto, así que solo redibuja Canales
  S.unsubs.push(fb.watchDoc("waqr/state", d => { S.waqr = d; if (S.view === "canales" || S.view === "integraciones") scheduleRender(); }, () => { S.waqr = null; }));
  S.unsubs.push(fb.watchDoc("settings/apps", d => { S.apps = d || {}; scheduleRender(); }, () => { S.apps = {}; }));
  S.unsubs.push(fb.watchDoc("settings/pipelines", d => { S.pipes = (d && d.list) || []; scheduleRender(); }, () => { S.pipes = []; }));
  window.addEventListener("hashchange", route);
  route();
  setInterval(() => { if (S.view === "hoy" && !document.hidden) scheduleRender(); }, 60000);
}
let rq = false;
function scheduleRender() { if (S.dragging) { S.pendingRender = true; return; } if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; renderShell(); }); }
function route() {
  const [v, id] = (location.hash.slice(1) || "hoy").split("/");
  S.view = v || "hoy";
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
  ["Ventas", [["pedidos", "Pedidos"], ["cotizaciones", "Cotizaciones"], ["agenda", "Agenda"], ["reposicion", "Avisos de reposición"], ["campanas", "Campañas"], ["promociones", "Promociones"], ["formularios", "Formularios"], ["metricas", "Métricas"]]],
  ["Catálogo", [["productos", "Productos"]]],
  ["Configuración", [["integraciones", "Integraciones"], ["asesora", "Asesora virtual"], ["automatizaciones", "Automatizaciones"], ["plantillas", "Plantillas"], ["equipo", "Equipo"], ["importar", "Importar Excel"], ["exportar", "Exportar Excel"]]],
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
      <nav class="nav">${NAV.map(([h, items]) => (h ? `<h4><button class="grp" data-grp="${h}" aria-expanded="${!navClosed(h)}">${h}${icon("chev")}</button></h4>` : "") + (h && navClosed(h) && !items.some(([k]) => navOn(k)) ? "" : items.map(([k, t]) =>
        `<button data-go="${k}" class="${navOn(k) ? "on" : ""}">${icon(k)}<span>${t}</span>${k === "hoy" && pend ? `<span class="count">${pend}</span>` : ""}${k === "conv" && unread ? `<span class="count">${unread}</span>` : ""}</button>`).join(""))).join("")}</nav>
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
    pedidos: viewPedidos, agenda: viewAgenda, reposicion: viewReposicion, metricas: viewMetricas, exportar: viewExportar, productos: viewProductos, plantillas: viewPlantillas, asesora: viewAsesora, canales: viewCanales, integraciones: viewIntegraciones, conectores: viewConectores, apps: viewApps, formularios: viewFormularios, automatizaciones: viewAutomatizaciones, campanas: viewCampanas, promociones: viewPromociones, equipo: viewEquipo, importar: viewImportar };
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
  return true;
}
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
  const st = s => ({ borrador: '<span class="pill">Borrador</span>', enviando: '<span class="pill amber">Enviando…</span>', enviada: '<span class="pill green">Enviada</span>' }[s] || "");
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
  const cp = base ? JSON.parse(JSON.stringify(base)) : { name: preset && preset.stage ? "Mensaje a " + preset.stage : "", filter: { ...(preset || {}) }, text: "", template: null, status: "borrador" };
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
          ${sel("tag", tags, "Cualquier etiqueta")}
          <div><input class="in" type="number" min="0" data-cf="quietDays" value="${cp.filter.quietDays || ""}" placeholder="Sin hablar hace… días" ${locked ? "disabled" : ""}></div></div></fieldset>
        <div class="reach" id="reach">${reachHtml(reach)}</div>
        <fieldset class="fs"><legend>Mensaje</legend>
          <textarea class="in" id="cpt" rows="4" placeholder="Hola {nombre}, te cuento que llegaron…" ${locked ? "disabled" : ""}>${esc(cp.text || "")}</textarea>
          <small class="muted">Variables: {nombre} {empresa} {asesor} {producto} {busca}</small>
          <div style="margin-top:10px"><label class="lb" for="cptpl">Plantilla de WhatsApp para quienes tienen la ventana cerrada</label>
          <select class="in" id="cptpl" ${locked ? "disabled" : ""}><option value="">No enviar a quienes tienen la ventana cerrada</option>${waTpls.map(t => `<option value="${t.id}" ${cp.template && cp.template.name === t.waName ? "selected" : ""}>${esc(t.name)} (${esc(t.waName)})</option>`).join("")}</select>
          ${waTpls.length ? "" : '<small class="muted">No tienes plantillas con "Nombre en Meta". Configúralas en Plantillas.</small>'}</div></fieldset>
        ${locked ? `<fieldset class="fs"><legend>Resultados</legend><div class="camp-k">${(() => { const s = campStats(cp); return `<div><b>${s.sent || 0}</b>enviados</div><div><b>${s.replied}</b>respondieron</div><div><b>${s.skipped || 0}</b>omitidos</div><div><b>${s.failed || 0}</b>fallidos</div>`; })()}</div>
          <div class="table-wrap" style="max-height:260px;margin-top:10px"><table class="t"><thead><tr><th>Contacto</th><th>Canal</th><th>Estado</th><th>Detalle</th></tr></thead><tbody id="cprec"><tr><td colspan="4" class="muted">Cargando…</td></tr></tbody></table></div></fieldset>` : ""}
      </div>
      <div class="mf">${id && !locked && adm ? '<button class="btn danger" type="button" id="cpdel">Eliminar</button><span class="spacer"></span>' : ""}
        <button class="btn" type="button" id="cpc">Cerrar</button>
        ${!locked && adm ? `<button class="btn" type="submit">Guardar borrador</button><button class="btn primary" type="button" id="cpsend" ${reach.now + reach.tpl ? "" : "disabled"}>${icon("send")}Enviar a ${reach.now + reach.tpl}</button>` : ""}</div></form>`;
    $("#cpx").onclick = $("#cpc").onclick = () => m.close();
    const upd = () => { read(); const r = campReach(S.contacts.filter(c => campMatch(c, cp.filter)), cp); $("#reach").innerHTML = reachHtml(r);
      if ($("#cpsend")) { $("#cpsend").disabled = !(r.now + r.tpl); $("#cpsend").innerHTML = `${icon("send")}Enviar a ${r.now + r.tpl}`; } };
    $$("[data-cf]", m).forEach(i => i.onchange = upd);
    if ($("#cpt")) $("#cpt").oninput = upd;
    if ($("#cptpl")) $("#cptpl").onchange = upd;
    if ($("#cpdel")) $("#cpdel").onclick = async () => { if (!await ask("¿Eliminar esta campaña?", "Eliminar")) return; await fb.remove("campaigns/" + id); m.close(); };
    if ($("#cpsend")) $("#cpsend").onclick = async () => {
      read(); if (!cp.name.trim()) return toast("Ponle un nombre a la campaña.");
      const r = campReach(S.contacts.filter(c => campMatch(c, cp.filter)), cp);
      if (!await ask(`Se enviará a ${r.now + r.tpl} contactos${r.no ? ` (${r.no} se omiten)` : ""}. ¿Enviar ahora?`, "Enviar")) return;
      const cid = await save();
      toast("Enviando campaña… puedes seguir trabajando");
      m.close();
      fb.call("runCampaign", { id: cid }).then(k => toast(`Campaña enviada: ${k.sent} enviados${k.skipped ? `, ${k.skipped} omitidos` : ""}${k.failed ? `, ${k.failed} fallidos` : ""}`))
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
    ["Aplicaciones", "Tu tienda en línea y tu facturación.", [
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
// ======================= Aplicaciones: Shopify, Mastershop y Siigo =======================
const APP_ICONS = {
  shopify: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
  mastershop: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></svg>',
  siigo: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></svg>',
};
const APP_COLORS = { shopify: "#5e8e3e", mastershop: "#5b21b6", siigo: "#0077c8" };
const appCall = (action, data = {}) => fb.call("apps", { action, ...data });
function viewApps(el) {
  const A = S.apps || {}, adm = isAdmin(), sh = A.shopify || {}, sg = A.siigo || {}, ms = A.mastershop || {};
  const hookUrl = `${location.origin}/api/shopify`;
  const head = (k, name, sub, on) => `<div class="chcard-h"><span class="itile-ic sm" style="--ic:${APP_COLORS[k]}">${APP_ICONS[k]}</span><div><b>${name}</b><small>${sub}</small></div><span class="pill ${on ? "green" : ""}">${on ? "Conectado" : "Sin conectar"}</span></div>`;
  el.innerHTML = `<div class="page">${crumb("Aplicaciones")}<div class="page-head"><div><h1>Aplicaciones</h1><span class="sub">Tu tienda en línea y tu facturación, unidas a House Chat.</span></div></div>
    <div class="chgrid apps">
    <section class="chcard" id="app-shopify">${head("shopify", "Shopify", "Pedidos, clientes, carritos abandonados y productos", sh.on)}
      ${sh.on ? `<div class="app-k"><div><b>${sh.orders || 0}</b>pedidos recibidos</div><div><b>${sh.products || 0}</b>productos importados</div><div><b>${sh.lastAt ? ago(sh.lastAt) : "—"}</b>último pedido</div></div>
        <div class="chrow"><span>Tienda: <b>${esc(sh.shop)}</b></span><span class="spacer"></span>${adm ? `<button class="btn" type="button" id="shImp">Importar productos</button><button class="btn" type="button" id="shPromos" title="${sh.hasToken ? "Trae los descuentos automáticos y códigos de Shopify a Promociones" : "Necesita un token de Admin con permiso read_discounts"}">Importar descuentos</button>` : ""}</div>
        ${sh.promosAt ? `<p class="muted" style="margin:6px 0 0;font-size:12.5px">${sh.promos || 0} descuentos de Shopify en Promociones · ${ago(sh.promosAt)}</p>` : ""}` : ""}
      <ul class="app-what"><li>Cada <b>pedido</b> de Shopify llega a Pedidos con su número, productos, dirección y estado de pago, y el cliente queda como Ganado.</li>
        <li>Los <b>carritos abandonados</b> crean una tarea en Hoy con el enlace para recuperarlos.</li><li>Puedes <b>importar tus productos</b> al catálogo para que la asesora los cotice.</li></ul>
      ${adm ? `<details class="app-steps" ${sh.on ? "" : "open"}><summary>${sh.on ? "Cambiar la conexión" : "Cómo conectarlo"}</summary><ol class="steps">
          <li>En Shopify ve a <b>Configuración › Notificaciones › Webhooks</b> y pulsa <b>Crear webhook</b> cinco veces, uno por evento: <i>Creación de pedido</i>, <i>Pago de pedido</i>, <i>Actualización de pedido</i>, <i>Creación de cliente</i> y <i>Creación de pago (checkout)</i>. Formato <b>JSON</b> y esta URL:<div class="codebox"><code class="sel">${esc(hookUrl)}</code><button class="btn sm" type="button" data-copy="${esc(hookUrl)}">Copiar</button></div></li>
          <li>Debajo de la lista, Shopify muestra "Tus webhooks se firmarán con…": copia esa clave y pégala aquí.</li>
          <li>Productos: cuando la tienda esté conectada, toca <b>Importar productos</b>. Se leen del catálogo público de tu tienda; cada medida o talla con precio distinto queda como un producto. Solo si tu tienda tiene contraseña necesitas un token de Admin.</li></ol>
        <form id="shf" class="chform"><div class="grid2"><div><label class="lb" for="shs">Dominio de la tienda</label><input class="in" id="shs" placeholder="casadorada.myshopify.com" value="${esc(sh.shop || "")}" required></div>
          <div><label class="lb" for="shk">Clave de firma de webhooks</label><input class="in" id="shk" placeholder="${sh.on ? "Guardada · escribe para cambiarla" : "Pega la clave"}" autocomplete="off"></div>
          <div class="full"><label class="lb" for="sht">Token de acceso de Admin (opcional: sin él, los productos se importan del catálogo público de la tienda)</label><input class="in" id="sht" placeholder="${sh.hasToken ? "Guardado · escribe para cambiarlo" : "shpat_…"}" autocomplete="off"></div></div>
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
    </section></div></div>`;
  $$("[data-copy]", el).forEach(b => b.onclick = () => copy(b.dataset.copy));
  const busy = (b, t) => { b.disabled = true; b.dataset.t = b.textContent; b.textContent = t; }, done = b => { b.disabled = false; b.textContent = b.dataset.t; };
  if ($("#shf")) $("#shf").onsubmit = async e => { e.preventDefault(); const b = $("#shf .btn.primary"); busy(b, "Guardando…");
    try { await appCall("saveShopify", { shop: $("#shs").value, secret: $("#shk").value, token: $("#sht").value }); toast("Shopify conectado"); } catch (er) { toast(errMsg(er)); } finally { done(b); } };
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
    <li>En cada uno, configura el webhook con esta URL y tu palabra de verificación (WA_VERIFY_TOKEN), y suscribe el campo <b>messages</b>:<br><code class="sel">${esc(hook)}</code></li>
    <li>Genera un <b>token de acceso de la página</b> (permisos <code>pages_messaging</code> e <code>instagram_manage_messages</code>) y pégalo aquí:</li></ol>
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
  const a = S.ai || {}, adm = isAdmin();
  const waiting = S.contacts.filter(c => c.aiHandoff).sort((x, y) => y.aiHandoff.at - x.aiHandoff.at);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const today = S.contacts.filter(c => isAiName(c.lastOutboundBy) && (c.lastOutboundAt || 0) >= t0.getTime()).length;
  const drafts = S.quotes.filter(q => q.aiCreated && q.status === "Borrador").length;
  el.innerHTML = `<div class="page"><div class="page-head"><h1>Asesora virtual</h1><span class="spacer"></span>
      <span class="pill ${a.enabled ? "green" : ""}">${a.enabled ? "Activa" : "Apagada"}</span></div>
    ${anyChannel() ? "" : `<div class="card" style="margin-bottom:16px;padding:12px 16px"><b>Necesita al menos un canal conectado.</b><p class="muted" style="margin:6px 0 0">La asesora responde lo que llega por WhatsApp, Instagram, Messenger, Telegram o el chat web. Conéctalos en <a href="#canales">Canales</a>; puedes dejarla configurada desde ya.</p></div>`}
    <div class="kpis" style="margin-bottom:16px;width:fit-content"><div><b>${today}</b>chats respondidos hoy</div><div><b>${waiting.length}</b>esperando a una persona</div><div><b>${drafts}</b>cotizaciones por revisar</div></div>
    <form id="aif" class="card ai-form">
      <label class="switch"><input type="checkbox" id="aen" ${a.enabled ? "checked" : ""} ${adm ? "" : "disabled"}> <span>Responder automáticamente los mensajes de todos los canales, las 24 horas</span></label>
      <div class="grid2">
        <div><label class="lb" for="anm">Nombre de la asesora</label><input class="in" id="anm" value="${esc(a.name || "Sofía")}" ${adm ? "" : "disabled"}></div>
        <div><label class="lb" for="aph">Se pausa en un chat cuando una persona escribe, durante (horas)</label><input class="in tabnum" id="aph" type="number" min="1" max="168" value="${a.pauseHours || 12}" ${adm ? "" : "disabled"}></div>
        <div class="full"><label class="lb" for="amd">Modelo de IA</label><select class="in" id="amd" ${adm ? "" : "disabled"}>
          ${[["haiku", "Haiku 5.5 · rápido y económico (recomendado) · ≈ US$0,001–0,003 por respuesta"], ["sonnet", "Sonnet 5.5 · más inteligente · ≈ US$0,02–0,05 por respuesta"], ["opus", "Opus 5.5 · el más inteligente · ≈ US$0,05–0,10 por respuesta"]]
            .map(([k, l]) => `<option value="${k}" ${(a.model || "haiku") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <label class="switch"><input type="checkbox" id="aqa" ${a.quoteAuto !== false ? "checked" : ""} ${adm ? "" : "disabled"}> <span>Cuando el cliente pida cotización, enviársela de una vez en PDF por el chat (si lo apagas, queda en borrador para que el equipo la revise)</span></label>
      <label class="switch"><input type="checkbox" id="aan" ${a.autoAnalisis !== false ? "checked" : ""} ${adm ? "" : "disabled"}> <span>Copiloto: analizar solas las conversaciones, sin dar clic (cada 10 minutos y al abrir un chat) (probabilidad de compra, siguiente paso y riesgo) · ≈ US$0,002 por análisis</span></label>
      <div><label class="lb" for="ain">Lo que debe saber del negocio</label>
        <textarea class="in" id="ain" rows="12" ${adm ? "" : "disabled"} placeholder="Ejemplo:&#10;- Horario de atención: lunes a sábado de 8 a.m. a 6 p.m.&#10;- Envíos a todo Colombia por Servientrega; en Medellín entrega en 1 a 2 días.&#10;- Pagos: transferencia Bancolombia o Nequi; pedidos por mayor con 50% de anticipo.&#10;- Medidas de sábanas: sencilla 1.00, semidoble 1.20, doble 1.40, queen 1.60, king 2.00.&#10;- Bordado de logo para hoteles desde 24 unidades.&#10;- No ofrecemos descuentos adicionales sin autorización.">${esc(a.instructions || "")}</textarea>
        <small class="muted">Los precios los toma del Catálogo de Productos. Aquí escribe horarios, envíos, formas de pago, medidas, tiempos y políticas.</small></div>
      <div class="card soft"><b>Qué hace sola</b><p class="muted" style="margin:4px 0 0">Responde preguntas de productos, precios, medidas y disponibilidad; llena la ficha (nombre, ciudad, qué busca, temperatura, producto elegido); prepara cotizaciones en Borrador para que el equipo las revise; agenda seguimientos.</p>
        <b style="display:block;margin-top:10px">Qué pasa a una persona</b><p class="muted" style="margin:4px 0 0">Cerrar pedidos y pagos, negociaciones y descuentos, quejas o reclamos, y lo que no sepa. Esos chats aparecen de primeros en Hoy y ella deja de responder ahí hasta que la reactives.</p></div>
      ${adm ? '<div><button class="btn primary" type="submit">Guardar</button></div>' : '<p class="muted">Solo la administradora puede cambiar esta configuración.</p>'}
    </form>
    <h2 class="sec-t">Base de conocimiento <small class="muted">· lo que la asesora sabe de tu empresa</small></h2>
    <div class="kb">${(S.knowledge || []).slice().sort((x, y) => String(x.title).localeCompare(String(y.title))).map(k => `<button class="kb-item ${k.on === false ? "off" : ""}" data-kb="${k.id}">
        <b>${esc(k.title)}</b><span>${esc(String(k.content || "").slice(0, 140))}${String(k.content || "").length > 140 ? "…" : ""}</span><small class="muted">${String(k.content || "").length.toLocaleString("es-CO")} caracteres${k.on === false ? " · apagado" : ""}</small></button>`).join("")}
      ${adm ? `<button class="kb-item add" id="kbNew"><b>+ Agregar artículo</b><span>Preguntas frecuentes, políticas de envío y garantía, cuidados de las sábanas, medidas, formas de pago… También puedes subir un archivo .txt.</span></button>` : ""}</div>
    ${(S.knowledge || []).length ? "" : '<p class="muted" style="font-size:12.5px">Mientras más le enseñes, mejor responde. Si un tema no está aquí ni en el catálogo, la asesora pasa el chat a una persona.</p>'}
    <h2 style="margin-top:24px">Esperando a una persona</h2>
    <div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Motivo</th><th>Resumen</th><th>Hace</th></tr></thead><tbody>
      ${waiting.map(c => `<tr data-c="${c.id}"><td><b>${esc(contactName(c))}</b></td><td>${esc(c.aiHandoff.reason || "")}</td><td>${esc(c.aiHandoff.summary || "")}</td><td>${ago(c.aiHandoff.at)}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Ninguno.</td></tr>'}</tbody></table></div></div>`;
  $$("[data-c]", el).forEach(tr => tr.onclick = () => go("conv", tr.dataset.c));
  $$("[data-kb]", el).forEach(b => b.onclick = () => openKb(b.dataset.kb));
  if ($("#kbNew")) $("#kbNew").onclick = () => openKb(null);
  $("#aif").onsubmit = async e => {
    e.preventDefault(); if (!adm) return;
    try {
      await fb.set("settings/asesora", { enabled: $("#aen").checked, name: $("#anm").value.trim() || "Sofía", pauseHours: Math.min(168, Math.max(1, Number($("#aph").value) || 12)), model: $("#amd").value, autoAnalisis: $("#aan").checked, quoteAuto: $("#aqa").checked,
        instructions: $("#ain").value.trim(), empresa: EMPRESA, ...stamp() });
      toast("Guardado");
    } catch (er) { toast("No se pudo guardar: " + errMsg(er)); }
  };
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
  return `<div class="bubble ${out ? "out" : "in"}${tail ? " tail" : ""}${pic ? " has-img" : ""}">${tail ? who : ""}${pic}${txt ? `<span class="btx">${fmtWa(txt)}</span>` : ""}${t}${m.status === "failed" ? '<span class="bfail">⚠ No se entregó</span>' : ""}</div>`;
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
  const pts = String(p.desc || "").split(/[.;\n•·]+/).map(x => x.trim().replace(/^[-–]\s*/, "")).filter(x => x.length > 2).slice(0, 3).map(x => "▫️ " + (x[0].toUpperCase() + x.slice(1)).slice(0, 90));
  const L = [`*${p.name}*`];
  if (p.category) L.push(`_${p.category}_`);
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
      .sort((a, b) => (!!b.image - !!a.image) || a.name.localeCompare(b.name)).slice(0, 60);
    m.innerHTML = sel ? `<div class="mh"><h2>Enviar a ${esc(contactName(c))}</h2><button class="iconbtn" id="ppx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><img class="pp-big" src="${esc(sel.image)}" alt="${esc(sel.name)}"><label class="lb" for="ppcap">Texto que acompaña la foto</label><textarea class="in" id="ppcap" rows="3">${esc(prodCaption(sel))}</textarea></div>
      <div class="mf"><button class="btn" id="ppback">← Otro producto</button><span class="spacer"></span><button class="btn primary" id="ppsend">Enviar por ${CHN[chOf(c)].label}</button></div>`
      : `<div class="mh"><h2>Enviar foto de un producto</h2><button class="iconbtn" id="ppx" aria-label="Cerrar">✕</button></div>
      <div class="mb"><input class="in" id="ppq" placeholder="Buscar producto" value="${esc(q)}" autocomplete="off">
        <div class="pp-grid">${list.map(p => `<button class="pp-item" data-pp="${p.id}" ${p.image ? "" : "disabled"}>${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : '<span class="pp-noimg">Sin foto</span>'}<b>${esc(p.name)}</b><small class="tabnum">${money(p.priceRetail)}</small></button>`).join("")
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
  return `${aiInsight(c)}<div><p class="eyebrow">Etapa${pipes().length > 1 ? " · " + esc(pipeOf(c).name) : ""}</p><select class="in" id="sStage">${stagesOf(c).map(s => `<option ${c.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    <div><p class="eyebrow">Responsable</p><select class="in" id="sOwner"><option value="">Sin asignar</option>${S.team.filter(u => u.active !== false).map(u => `<option ${c.owner === u.name ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div>
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
      const opts = t === "team" ? S.team.filter(u => u.active !== false).map(u => u.name) : t === "stages" ? stagesOf(c) : t;
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
        <fieldset class="fs"><legend>Productos</legend><div class="lines">
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
      if (f === "productId") { const p = byId(S.products, inp.value); it.productId = inp.value; it.name = p ? p.name : ""; it.price = priceFor(p, it.qty); }
      else if (f === "qty") { it.qty = Math.max(1, Number(inp.value) || 1); const p = byId(S.products, it.productId); if (p) it.price = priceFor(p, it.qty); }
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
      : `<div class="empty"><p>No hay seguimientos programados.</p><p>Usa "Recordar en…" en Hoy o la fecha de próximo seguimiento en la ficha del contacto.</p></div>`}</div>`;
  $("#agm").onchange = e => { S.agMine = e.target.checked; renderShell(); };
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
        <div class="full"><label class="lb" for="on">Notas (dirección, guía de envío…)</label><textarea class="in" id="on" rows="3">${esc(o.notes || "")}</textarea></div></div>
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
  $("#of2").onsubmit = async e => { e.preventDefault(); await fb.update("orders/" + id, { status: $("#os").value, payment: $("#op").value, notes: $("#on").value.trim(), ...stamp() }); m.close(); toast("Pedido actualizado"); };
  m.showModal();
}

// ======================= Productos =======================
function viewProductos(el) {
  const q = norm(S.pQ || "");
  const list = S.products.filter(p => !q || norm(p.name + " " + (p.desc || "") + " " + (p.category || "") + " " + (p.sku || "")).includes(q)).sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Productos</h1><span class="sub tabnum">${S.products.length}</span><span class="spacer"></span><button class="btn primary" id="np">+ Nuevo producto</button></div>
    <div class="toolbar"><input class="in" id="pq" placeholder="Buscar producto" value="${esc(S.pQ || "")}"></div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Producto</th><th>Categoría</th><th>Descripción</th><th class="num">Precio detal</th><th class="num">Precio por mayor</th><th class="num">Mayor desde</th><th>Estado</th></tr></thead><tbody>
      ${list.map(p => `<tr data-id="${p.id}"><td class="pthumb">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ""}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.category || "")}</td><td>${esc(p.desc || "")}</td><td class="num">${(b => { const before = p.compareAt > p.priceRetail ? p.compareAt : b ? p.priceRetail : 0;
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
        <div class="pc-h"><b>${esc(pr.name)}</b>${pr.source === "Shopify" ? '<span class="pill">Shopify</span>' : ""}<span class="pill ${cls}">${st}</span></div>
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
    <div style="display:grid;gap:10px;margin-top:12px">${(list.length ? list : DEFAULT_TEMPLATES).map(t => `<div class="card" style="padding:14px 16px;cursor:${list.length ? "pointer" : "default"}" data-id="${t.id || ""}">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(t.name)}</b><span class="pill">${esc(SITUATIONS[t.key] || t.key || "Otra")}</span>${t.waName ? `<span class="pill green">WhatsApp: ${esc(t.waName)}</span>` : ""}</div>
      <p style="margin:6px 0 0;white-space:pre-wrap">${esc(t.text)}</p></div>`).join("")}</div></div>`;
  if ($("#nt")) $("#nt").onclick = () => openTemplate(null);
  if ($("#seed")) $("#seed").onclick = async () => { for (const t of DEFAULT_TEMPLATES) await fb.add("templates", { ...t, ...stamp() }); toast("Plantillas creadas"); };
  if (list.length && isAdmin()) $$("[data-id]", el).forEach(d => d.onclick = () => openTemplate(d.dataset.id));
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
    <div class="mb"><p style="margin:0 0 10px">Apple solo permite notificaciones cuando House Chat está en tu pantalla de inicio. Es un minuto:</p>
      <ol class="steps"><li>En Safari, toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
        <li>Elige <b>Agregar a pantalla de inicio</b> y toca <b>Agregar</b>.</li>
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

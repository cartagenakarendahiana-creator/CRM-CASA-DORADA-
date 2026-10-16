import { fb } from "./fb.js";
import { WHATSAPP_ENABLED, EMPRESA } from "./firebase-config.js";

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
  reposicion: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  metricas: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  exportar: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  salir: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
const icon = k => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ""}</svg>`;

// ======================= Modelo =======================
const STAGES = ["Nuevo", "Contactado", "Catálogo enviado", "Cotización enviada", "Negociación", "Ganado", "Perdido"];
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
  user: null, me: null, contacts: [], quotes: [], orders: [], products: [], templates: [], team: [],
  loaded: {}, view: "hoy", sel: null, convSel: null, convFilter: "todas", search: "", msgsUnsub: null, msgs: [], msgsFor: null,
  hoyMsgsUnsub: null, hoyMsgs: [], hoyMsgsFor: null, unsubs: [],
};
const byId = (list, id) => list.find(x => x.id === id);
const contactName = c => c ? (c.name || c.company || "+" + (c.phone || "")) : "";
const winInfo = c => {
  const last = c && c.lastInboundAt;
  if (!last) return { open: false, closesAt: null, never: true };
  const closesAt = last + 24 * H;
  return { open: Date.now() < closesAt, closesAt };
};
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

function renderLogin(err) {
  root.innerHTML = `<div class="login"><form class="card" id="lf">
    <div class="brand"><div class="brand-mark">CD</div><div><b>${esc(EMPRESA)}</b><small>CRM</small></div></div>
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
  w("contacts", "contacts");
  w("quotes", "quotes", { orderBy: ["createdAt", "desc"], limit: 500 });
  w("orders", "orders", { orderBy: ["createdAt", "desc"], limit: 500 });
  w("products", "products");
  w("templates", "templates");
  w("team", "users");
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
const NAV = [
  [null, [["hoy", "Hoy"], ["conv", "Conversaciones"], ["embudo", "Embudo"], ["contactos", "Contactos"]]],
  ["Ventas", [["pedidos", "Pedidos"], ["cotizaciones", "Cotizaciones"], ["agenda", "Agenda"], ["reposicion", "Avisos de reposición"], ["metricas", "Métricas"]]],
  ["Catálogo", [["productos", "Productos"]]],
  ["Configuración", [["plantillas", "Plantillas"], ["equipo", "Equipo"], ["importar", "Importar Excel"], ["exportar", "Exportar Excel"]]],
];
function renderShell() {
  if (!S.me) return;
  const keepScroll = $(".view") ? $(".view").scrollTop : 0;
  const active = document.activeElement && document.activeElement.id;
  const caret = active && document.activeElement.selectionStart;
  const pend = pendingCount(), unread = S.contacts.filter(c => c.unread > 0).length;
  root.innerHTML = `<div class="app">
    <aside class="side" id="side">
      <div class="side-top">
        <div class="brand"><div class="brand-mark">CD</div><div><b>${esc(EMPRESA)}</b><small>CRM</small></div></div>
        <label class="side-search">${icon("buscar")}<input id="gsearch" placeholder="Buscar contacto" value="${esc(S.search)}" autocomplete="off"></label>
      </div>
      <nav class="nav">${NAV.map(([h, items]) => (h ? `<h4><button class="grp" data-grp="${h}" aria-expanded="${!navClosed(h)}">${h}${icon("chev")}</button></h4>` : "") + (h && navClosed(h) && !items.some(([k]) => k === S.view) ? "" : items.map(([k, t]) =>
        `<button data-go="${k}" class="${S.view === k ? "on" : ""}">${icon(k)}<span>${t}</span>${k === "hoy" && pend ? `<span class="count">${pend}</span>` : ""}${k === "conv" && unread ? `<span class="count">${unread}</span>` : ""}</button>`).join(""))).join("")}</nav>
      <div class="side-user"><div class="avatar">${esc((S.me.name || "?")[0].toUpperCase())}</div>
        <div class="who"><b>${esc(S.me.name || S.user.email)}</b><small>${S.me.role === "admin" ? "Administradora" : "Asesor"}</small></div>
        <button class="iconbtn" id="logout" title="Salir" aria-label="Salir">${icon("salir")}</button></div>
    </aside>
    <main class="main">
      <div class="topbar-mobile"><button class="iconbtn" id="menuBtn" aria-label="Menú">${icon("menu")}</button><b>${esc(EMPRESA)}</b></div>
      ${!WHATSAPP_ENABLED ? `<div class="banner"><span>WhatsApp todavía no está conectado: los mensajes se abren en tu WhatsApp y los registras aquí.</span></div>` : ""}
      <div class="view" id="view"></div>
    </main></div>`;
  $$("[data-go]").forEach(b => b.onclick = () => { $("#side").classList.remove("open"); S.hoyOpen = false; if (location.hash.slice(1) === b.dataset.go) renderShell(); else go(b.dataset.go); });
  $("#logout").onclick = () => fb.logout();
  $$("[data-grp]").forEach(b => b.onclick = () => { const k = "crm-nav-" + b.dataset.grp; try { localStorage.setItem(k, navClosed(b.dataset.grp) ? "0" : "1"); } catch { } renderShell(); });
  $("#menuBtn").onclick = () => $("#side").classList.toggle("open");
  $("#gsearch").oninput = e => { S.search = e.target.value; if (S.view !== "contactos") go("contactos"); else renderShell(); };
  const views = { hoy: viewHoy, conv: viewConv, embudo: viewEmbudo, contactos: viewContactos, cotizaciones: viewCotizaciones,
    pedidos: viewPedidos, agenda: viewAgenda, reposicion: viewReposicion, metricas: viewMetricas, exportar: viewExportar, productos: viewProductos, plantillas: viewPlantillas, equipo: viewEquipo, importar: viewImportar };
  (views[S.view] || viewHoy)($("#view"));
  $(".view").scrollTop = keepScroll;
  if (active && $("#" + active)) { const el = $("#" + active); el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch { } }
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
  if (c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt) && !done[safeKey("responder:" + c.lastInboundAt)])
    out.push({ key: safeKey("responder:" + c.lastInboundAt), kind: "responder", rank: 0, title: "Respóndele", sub: `sin respuesta hace ${ago(c.lastInboundAt)}`,
      hint: c.lastMessage ? `Escribió: “${c.lastMessage}”` : "Te escribió y está esperando respuesta." });
  S.quotes.filter(q => q.contactId === c.id && q.status === "Aceptada").forEach(q => {
    if (!done[safeKey("pedido:" + q.id)]) out.push({ key: safeKey("pedido:" + q.id), kind: "pedido", rank: 1, q, title: `Convierte en pedido la cotización ${q.number} por ${money(q.total)}`,
      sub: `aceptó la cotización ${q.number} por ${money(q.total)}: conviértela en pedido`, hint: "Ya la aceptó: crea el pedido y confírmale la entrega." });
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
    if (a.win.open !== b.win.open) return a.win.open ? -1 : 1;
    if (a.win.open) return a.win.closesAt - b.win.closesAt;
    return a.task.rank - b.task.rank || lvl(b.c) - lvl(a.c) || (b.c.lastInboundAt || 0) - (a.c.lastInboundAt || 0);
  });
  return list;
}
const pendingCount = () => S.contacts.reduce((n, c) => n + (tasksFor(c).length ? 1 : 0), 0);

// ======================= Vista: Hoy =======================
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
  const row = i => `<button class="item ${i.c.id === S.sel ? "on" : ""}" data-sel="${i.c.id}">
      <span class="dot ${i.win.open || i.task.rank <= 1 ? "hot" : ""}"></span>
      <div class="row1"><span class="nm">${esc(contactName(i.c))}</span>
        <span class="when">${i.win.open ? "cierra " + whenLabel(i.win.closesAt) : i.c.lastInboundAt ? icon("lock") + " cerró hace " + ago(i.win.closesAt) : esc(i.c.company || "")}</span></div>
      <div class="what">${monoNums(esc(i.task.title))}</div><div class="sub">${monoNums(esc(i.task.sub))}${i.more ? ` · +${i.more} más` : ""}</div></button>`;
  el.innerHTML = `<div class="page" style="max-width:none;padding-bottom:0">
    <div class="page-head"><h1>Hoy</h1><span class="sub">${t0.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} · <small>Actualizado ${upd}</small></span><span class="spacer"></span>
      <div class="kpis"><div><b>${convToday}</b>conversaciones hoy</div><div><b>${mine}</b>tú</div><div><b>${team}</b>tu equipo</div>
        <div><span class="dot" style="color:var(--green);margin-right:6px"></span><b class="mono">${money(closed)}</b>cerrado hoy · ${ordersToday.length} ${ordersToday.length === 1 ? "venta" : "ventas"}</div></div></div></div>
    <div class="today ${S.sel && innerWidth <= 860 && S.hoyOpen ? "has-sel" : ""}">
      <div class="today-list">
        <div class="list-head"><h2>Necesita tu intervención</h2><span class="badge">${items.length}</span></div>
        <details class="how"><summary>Cómo se ordena</summary><ol>
          <li>Primero los clientes con la ventana de WhatsApp abierta, el que cierra más pronto arriba.</li>
          <li>Luego los que tienen la ventana cerrada (solo se les puede escribir con una plantilla aprobada).</li>
          <li>En cada uno, la acción más importante: responder, convertir una cotización aceptada, cerrar con el producto elegido, preguntar por una cotización sin respuesta o el seguimiento programado.</li></ol></details>
        ${openItems.map(row).join("")}
        ${closedItems.length ? `<div class="group">${icon("lock")}<div><b>Ventana de WhatsApp cerrada</b>Ya no se les puede escribir libre: solo con una plantilla.</div><span class="spacer"></span><span class="badge">${closedItems.length}</span></div>` : ""}
        ${closedItems.map(row).join("")}
        ${!items.length ? `<div class="empty"><p><b>Todo al día.</b></p><p>Aquí aparecen los clientes que te escriben, las cotizaciones por cerrar y los seguimientos programados.</p></div>` : ""}
      </div>
      <div class="detail" id="detail"></div>
    </div>`;
  $$("[data-sel]", el).forEach(b => b.onclick = () => { S.sel = b.dataset.sel; S.hoyOpen = true; renderShell(); });
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
  const winTxt = win.open ? `La ventana de 24 h cierra ${whenLabel(win.closesAt)}` : win.never ? "Todavía no te ha escrito por WhatsApp: el primer mensaje debe ser una plantilla aprobada"
    : `La ventana se cerró hace ${ago(win.closesAt)}: solo puedes escribirle con una plantilla aprobada`;
  el.innerHTML = `<button class="btn sm back" id="back">← Volver</button>
    <div class="detail-head"><div><h2>${esc(contactName(c))}</h2>
      <div class="muted tabnum">${esc(phoneId(c.phone) || c.phone || "sin teléfono")}${c.company && c.name ? " · " + esc(c.company) : ""} · ${c.sourceSheet ? (c.type === "Cliente" ? "cliente" : "prospecto") + " del Excel" : (c.type === "Cliente" ? "cliente" : "contacto") + " desde " + fmtDMY(c.createdAt || Date.now())}</div></div>
      <button class="btn primary" id="openConv">Abrir conversación</button></div>
    <section><p class="eyebrow">Qué busca</p><p class="big inline-edit" id="looking" title="Clic para editar">${esc(c.looking || "Sin registrar — clic para escribir qué busca")}</p></section>
    <section><p class="eyebrow">Producto elegido</p><p class="big">${c.chosenProduct ? `${esc(c.chosenProduct.name)} ${money(c.chosenProduct.price)}${c.chosenProduct.desc ? ` <span class="muted">(${esc(c.chosenProduct.desc)})</span>` : ""}` : '<span class="muted">Ninguno todavía</span>'}
      <button class="btn sm" id="chooseProd" style="margin-left:8px">${c.chosenProduct ? "Cambiar" : "Elegir producto"}</button></p></section>
    <div class="closebox"><p class="eyebrow">Para cerrar la venta</p>
      <span class="pill ${win.open ? "amber" : "red"}"><span class="dot"></span>${esc(winTxt)}</span>
      <div class="step"><span class="n">1</span><div><b>${monoNums(esc(task.title))}</b><div class="muted">${esc(task.hint)}</div></div></div>
      <div class="suggest"><span class="muted" style="font-size:14px">Mensaje sugerido · ${esc(tpl.name)}</span><p id="sugg">${esc(msg)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="copyMsg">Copiar mensaje</button>
          ${WHATSAPP_ENABLED && win.open ? `<button class="btn primary" id="sendMsg">Enviar por WhatsApp</button>` : ""}
          ${!WHATSAPP_ENABLED && waLink(c.phone) ? `<a class="btn" href="${waLink(c.phone, msg)}" target="_blank" rel="noopener" id="waOpen">Abrir en WhatsApp</a>` : ""}
          ${task.kind === "pedido" ? `<button class="btn primary" id="toOrder">Crear pedido</button>` : ""}
          ${task.q ? `<button class="btn" id="openQuote">Ver ${esc(task.q.number)}</button>` : ""}
        </div></div>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="doneTask">Ya terminó</button>
        <button class="btn" id="snooze">Recordar en…</button><button class="btn" id="openContact">Ver ficha</button></div>
    </div>
    <section><p class="eyebrow" style="display:flex;justify-content:space-between">Lo último de la conversación <span class="muted">${icon("bell")}</span></p><div class="lastmsgs">${S.hoyMsgsFor === c.id && S.hoyMsgs.length ? S.hoyMsgs.map(bubble).join("") : '<span class="muted">Sin mensajes registrados.</span>'}</div></section>`;
  $("#back").onclick = () => { S.hoyOpen = false; renderShell(); };
  $("#openConv").onclick = () => go("conv", c.id);
  $("#openContact").onclick = () => openContact(c.id);
  $("#copyMsg").onclick = () => copy(msg);
  if ($("#waOpen")) $("#waOpen").onclick = () => logOutbound(c, msg, "Abierto en WhatsApp");
  if ($("#sendMsg")) $("#sendMsg").onclick = () => sendText(c, msg);
  if ($("#toOrder")) $("#toOrder").onclick = () => quoteToOrder(task.q);
  if ($("#openQuote")) $("#openQuote").onclick = () => openQuote(task.q.id);
  $("#chooseProd").onclick = () => chooseProduct(c);
  $("#looking").onclick = () => editLooking(c);
  $("#doneTask").onclick = async () => { await fb.update("contacts/" + c.id, { ["done." + task.key]: Date.now(), ...stamp() }); toast("Listo"); };
  $("#snooze").onclick = () => snooze(c);
}
function bubble(m) {
  const who = m.dir === "in" ? "Cliente" : m.dir === "note" ? "Nota" : (m.byName || "Equipo");
  return `<div class="bubble ${m.dir === "out" ? "out" : m.dir === "note" ? "note" : ""}"><small>${esc(who)} · ${fmtDT(m.ts)}${m.status === "failed" ? " · ⚠ no se entregó" : m.status === "read" ? " · leído" : ""}</small>${esc(m.text)}</div>`;
}
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
    await fb.call("sendWhatsApp", { contactId: c.id, text });
    toast("Mensaje enviado");
  } catch (e) {
    if (/VENTANA_CERRADA/.test(errMsg(e))) return info("La ventana de 24 h está cerrada: usa una plantilla aprobada.");
    toast("No se pudo enviar: " + errMsg(e));
  }
}
const info = msg => ask(msg, "Entendido", null);
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
  S.msgsUnsub && S.msgsUnsub(); S.msgs = []; S.msgsFor = cid;
  if (!cid) return;
  S.msgsUnsub = fb.watch(`contacts/${cid}/messages`, list => { S.msgs = list.reverse(); if (S.view === "conv") scheduleRender(); }, { orderBy: ["ts", "desc"], limit: 200 });
  const c = byId(S.contacts, cid);
  if (c && c.unread) fb.update("contacts/" + cid, { unread: 0 }).catch(() => { });
}
function viewConv(el) {
  const q = norm(S.convQ || "");
  let list = S.contacts.filter(c => c.lastInboundAt || c.lastOutboundAt);
  if (S.convFilter === "sin") list = list.filter(c => c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt));
  if (S.convFilter === "mias") list = list.filter(c => c.owner === S.me.name);
  if (q) list = list.filter(c => norm(contactName(c) + " " + c.phone + " " + (c.company || "")).includes(q));
  list.sort((a, b) => Math.max(b.lastInboundAt || 0, b.lastOutboundAt || 0) - Math.max(a.lastInboundAt || 0, a.lastOutboundAt || 0));
  const c = byId(S.contacts, S.convSel);
  watchConv(c ? c.id : null);
  const w = c ? winInfo(c) : null;
  const waTpls = S.templates.filter(t => t.waName);
  el.innerHTML = `<div class="chat ${c ? "has-sel" : ""}">
    <div class="chat-list"><div class="search"><input class="in" id="convQ" placeholder="Buscar conversación" value="${esc(S.convQ || "")}">
      <select class="in" id="convF"><option value="todas">Todas</option><option value="sin" ${S.convFilter === "sin" ? "selected" : ""}>Sin responder</option><option value="mias" ${S.convFilter === "mias" ? "selected" : ""}>Mías</option></select></div>
      ${list.map(x => { const last = Math.max(x.lastInboundAt || 0, x.lastOutboundAt || 0); return `<button class="conv ${c && x.id === c.id ? "on" : ""}" data-c="${x.id}">
        <div class="avatar">${esc((contactName(x) || "?")[0].toUpperCase())}</div><div class="meta"><div class="l1"><b>${esc(contactName(x))}</b><small class="muted">${last ? whenLabel(last).replace(/^hoy /, "") : ""}</small></div>
        <div class="l1"><span class="l2">${x.lastMessageDir === "out" ? "Tú: " : ""}${esc(x.lastMessage || "")}</span>${x.unread ? `<span class="unread">${x.unread}</span>` : ""}</div></div></button>`; }).join("")
        || `<div class="empty"><p>${WHATSAPP_ENABLED ? "Aún no hay conversaciones. Cuando un cliente escriba a tu WhatsApp aparecerá aquí." : "Aquí verás las conversaciones cuando conectes WhatsApp. Mientras tanto, los mensajes que registres desde Hoy o Contactos aparecen aquí."}</p></div>`}
    </div>
    <div class="chat-pane">${c ? `
      <div class="chat-top"><button class="btn sm back" id="cback">←</button><div class="avatar">${esc(contactName(c)[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0"><b>${esc(contactName(c))}</b><div class="muted tabnum" style="font-size:13px">${esc(c.phone || "")}${c.company ? " · " + esc(c.company) : ""}</div></div>
        <span class="pill ${w.open ? "green" : "red"}">${w.open ? "Ventana abierta · cierra " + whenLabel(w.closesAt) : "Ventana cerrada"}</span></div>
      <div class="msgs" id="msgs">${S.msgs.map(bubble).join("") || '<div class="empty">Sin mensajes todavía.</div>'}</div>
      <div class="composer">
        ${WHATSAPP_ENABLED && w.open ? `<div class="row"><textarea class="in" id="ctext" rows="1" placeholder="Escribe un mensaje"></textarea><button class="btn primary" id="csend">Enviar</button></div>` : ""}
        ${WHATSAPP_ENABLED && !w.open ? `<div class="row"><select class="in" id="ctpl">${waTpls.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("") || "<option value=''>No hay plantillas aprobadas</option>"}</select><button class="btn primary" id="ctplsend" ${waTpls.length ? "" : "disabled"}>Enviar plantilla</button></div>
          <small class="muted">Pasaron más de 24 h desde su último mensaje: WhatsApp solo permite plantillas aprobadas por Meta.</small>` : ""}
        ${!WHATSAPP_ENABLED ? `<div class="row"><textarea class="in" id="ctext" rows="1" placeholder="Escribe el mensaje y ábrelo en WhatsApp"></textarea>
          ${waLink(c.phone) ? `<button class="btn primary" id="cwa">Abrir en WhatsApp</button>` : ""}</div>` : ""}
        <div class="row"><input class="in" id="cnote" placeholder="Agregar nota interna (el cliente no la ve)"><button class="btn" id="cnotebtn">Nota</button></div>
      </div>` : `<div class="empty" style="margin:auto">Elige una conversación.</div>`}</div>
    ${c ? `<aside class="chat-info">${contactSummary(c)}</aside>` : ""}</div>`;
  $("#convQ").oninput = e => { S.convQ = e.target.value; renderShell(); };
  $("#convF").onchange = e => { S.convFilter = e.target.value; renderShell(); };
  $$("[data-c]", el).forEach(b => b.onclick = () => go("conv", b.dataset.c));
  if (!c) return;
  const box = $("#msgs"); box.scrollTop = box.scrollHeight;
  $("#cback").onclick = () => { S.convSel = null; go("conv"); };
  if ($("#csend")) $("#csend").onclick = async () => { const t = $("#ctext").value.trim(); if (!t) return; $("#csend").disabled = true; await sendText(c, t); $("#ctext").value = ""; };
  if ($("#ctext") && $("#csend")) $("#ctext").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#csend").click(); } };
  if ($("#ctplsend")) $("#ctplsend").onclick = () => sendTemplate(c, byId(S.templates, $("#ctpl").value));
  if ($("#cwa")) $("#cwa").onclick = async () => { const t = $("#ctext").value.trim(); window.open(waLink(c.phone, t), "_blank"); if (t) { await logOutbound(c, t, "Abierto en WhatsApp"); } };
  $("#cnotebtn").onclick = async () => { const t = $("#cnote").value.trim(); if (!t) return; await addNote(c, t); $("#cnote").value = ""; };
  bindSummary(c);
}
function contactSummary(c) {
  const qs = S.quotes.filter(q => q.contactId === c.id).slice(0, 5);
  return `<div><p class="eyebrow">Etapa</p><select class="in" id="sStage">${STAGES.map(s => `<option ${c.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    <div><p class="eyebrow">Responsable</p><select class="in" id="sOwner"><option value="">Sin asignar</option>${S.team.filter(u => u.active !== false).map(u => `<option ${c.owner === u.name ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></div>
    <div><p class="eyebrow">Qué busca</p><div class="inline-edit" id="sLook">${esc(c.looking || "—")}</div></div>
    <div><p class="eyebrow">Producto elegido</p><div>${c.chosenProduct ? esc(c.chosenProduct.name) + " · " + money(c.chosenProduct.price) : "—"}</div><button class="btn sm" id="sProd" style="margin-top:6px">Elegir</button></div>
    <div><p class="eyebrow">Cotizaciones</p>${qs.map(q => `<div><a href="#" data-q="${q.id}">${esc(q.number)}</a> · ${money(q.total)} · <span class="muted">${esc(q.status)}</span></div>`).join("") || '<span class="muted">Ninguna</span>'}
      <button class="btn sm" id="sQuote" style="margin-top:6px">Nueva cotización</button></div>
    <button class="btn" id="sCard">Ver ficha completa</button>`;
}
function bindSummary(c) {
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
    <div class="mb"><p class="eyebrow" style="margin:0">Mover a la etapa</p>
      <div class="stage-pick">${STAGES.map(st => `<button class="btn ${st === cur ? "on" : ""}" data-st="${st}">${st === cur ? "✓ " : ""}${st}</button>`).join("")}</div>
      ${c.company && c.name ? `<p class="muted" style="margin:0">${esc(c.company)}</p>` : ""}${c.lostReason && cur === "Perdido" ? `<p class="muted" style="margin:0">Motivo: ${esc(c.lostReason)}</p>` : ""}</div>
    <div class="mf"><button class="btn" id="sconv">Conversación</button><button class="btn primary" id="scard">Ver ficha</button></div>`;
  $("#sx").onclick = () => m.close();
  $("#scard").onclick = () => { m.close(); openContact(c.id); };
  $("#sconv").onclick = () => { m.close(); go("conv", c.id); };
  $$("[data-st]", m).forEach(b => b.onclick = () => { m.close(); moveStage(c, b.dataset.st); });
  m.showModal();
}
function viewEmbudo(el) {
  const f = S.embF || {}, q = norm(f.q || ""), more = S.embMore || (S.embMore = {});
  const base = S.contacts.filter(c => !c.archived);
  const segCount = sg => base.filter(c => !sg || c.segment === sg).length;
  let list = base.filter(c => (!f.seg || c.segment === f.seg) && (!f.owner || c.owner === f.owner));
  if (q) list = list.filter(c => norm([c.name, c.company, c.phone, c.city, c.chosenProduct && c.chosenProduct.name].join(" ")).includes(q));
  const qv = {}; S.quotes.forEach(x => { if (["Enviada", "Aceptada", "Borrador"].includes(x.status)) qv[x.contactId] = (qv[x.contactId] || 0) + (x.total || 0); });
  const stages = f.showLost ? STAGES : STAGES.filter(st => st !== "Perdido");
  // Conserva el desplazamiento del tablero cuando se redibuja por cambios en vivo
  const ob = $(".board"), keep = ob ? { x: ob.scrollLeft, y: Object.fromEntries($$(".col").map(cl => [cl.dataset.stage, $(".col-body", cl).scrollTop])) } : null;
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Embudo</h1>
      <span class="sub">Toca una tarjeta para moverla de etapa${matchMedia("(pointer:fine)").matches ? " o arrástrala con el mouse" : ""}</span></div>
    <div class="seg-tabs">${["", ...SEGMENTS].filter(sg => !sg || segCount(sg)).map(sg => `<button class="${(f.seg || "") === sg ? "on" : ""}" data-seg="${sg}">${sg || "Todos"} <small class="tabnum">${segCount(sg)}</small></button>`).join("")}</div>
    <div class="toolbar"><input class="in" id="eq" placeholder="Buscar en el embudo" value="${esc(f.q || "")}">
      <select class="in" id="ef2"><option value="">Todos los responsables</option>${[...new Set(S.contacts.map(c => c.owner).filter(Boolean))].map(o => `<option ${f.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
      <label class="pill"><input type="checkbox" id="ef3" ${f.showLost ? "checked" : ""}> Ver perdidos</label></div>
    <div class="board">${stages.map(st => {
      const cards = list.filter(c => (c.stage || "Nuevo") === st).sort((a, b) => (b.stageAt || b.updatedAt || 0) - (a.stageAt || a.updatedAt || 0));
      const total = cards.reduce((a, c) => a + (qv[c.id] || 0), 0), lim = more[st] || 40;
      return `<div class="col" data-stage="${st}"><div class="col-head"><b>${st}</b><small class="tabnum">${cards.length}${total ? " · " + money(total) : ""}</small></div>
        <div class="col-body">${cards.slice(0, lim).map(c => `<div class="deal" data-id="${c.id}" tabindex="0" role="button" aria-label="${esc(contactName(c))}, ${st}">
          <span class="nm">${esc(contactName(c))}</span>${c.company && c.name ? `<span class="muted" style="font-size:13px">${esc(c.company)}</span>` : ""}
          ${c.chosenProduct ? `<span style="font-size:13px">${esc(c.chosenProduct.name)}</span>` : ""}
          <div class="ln"><span>${esc(c.owner || "")}</span><span class="tabnum">${qv[c.id] ? money(qv[c.id]) : esc(c.temperature || "")}</span></div>
          ${c.stageAt && st !== "Nuevo" ? `<small class="age">en esta etapa hace ${ago(c.stageAt)}</small>` : ""}</div>`).join("")}
          ${cards.length > lim ? `<button class="btn sm" data-more="${st}">Ver ${Math.min(50, cards.length - lim)} más (quedan ${cards.length - lim})</button>` : ""}
          ${!cards.length ? '<small class="muted" style="padding:6px">Vacío</small>' : ""}</div></div>`;
    }).join("")}</div></div>`;
  const board = $(".board", el);
  if (keep) { board.scrollLeft = keep.x; $$(".col", el).forEach(cl => { const y = keep.y[cl.dataset.stage]; if (y) $(".col-body", cl).scrollTop = y; }); }
  $$("[data-seg]", el).forEach(b => b.onclick = () => { S.embF = { ...f, seg: b.dataset.seg }; S.embMore = {}; renderShell(); });
  $("#eq").oninput = e => { S.embF = { ...f, q: e.target.value }; renderShell(); };
  $("#ef2").onchange = e => { S.embF = { ...f, owner: e.target.value }; renderShell(); };
  $("#ef3").onchange = e => { S.embF = { ...f, showLost: e.target.checked }; renderShell(); };
  $$("[data-more]", el).forEach(b => b.onclick = () => { more[b.dataset.more] = (more[b.dataset.more] || 40) + 50; renderShell(); });
  $$(".deal", el).forEach(d => {
    const c = byId(S.contacts, d.dataset.id);
    d.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stageSheet(c); } };
    d.onpointerdown = e => {
      if (e.button !== 0) return;
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
        else if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) stageSheet(c);
      };
      const cancel = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", cancel); clearInterval(timer); ghost && ghost.remove(); d.classList.remove("dragging"); over && over.classList.remove("over"); finish(); };
      addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", cancel);
    };
  });
}

// ======================= Vista: Contactos =======================
function viewContactos(el) {
  const f = S.conF || {}, q = norm(S.search);
  let list = S.contacts.filter(c => (!f.seg || c.segment === f.seg) && (!f.stage || c.stage === f.stage) && (!f.owner || c.owner === f.owner) && (!f.type || c.type === f.type));
  if (q) {
    const terms = q.split(/\s+/);
    list = list.filter(c => { const h = norm([c.name, c.company, c.phone, c.city, c.email, c.cargo, c.looking, c.obs].join(" ")), d = h.replace(/\D/g, "");
      return terms.every(t => h.includes(t) || (/^\d{3,}$/.test(t) && d.includes(t))); });
  }
  list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const shown = list.slice(0, 300);
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Contactos</h1><span class="sub tabnum">${list.length} de ${S.contacts.length}</span><span class="spacer"></span>
      <button class="btn primary" id="newC">+ Nuevo contacto</button></div>
    <div class="toolbar"><input class="in" id="cq" placeholder="Buscar nombre, hotel, teléfono, ciudad…" value="${esc(S.search)}">
      <select class="in" id="f1"><option value="">Segmento</option>${SEGMENTS.map(s => `<option ${f.seg === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select class="in" id="f2"><option value="">Etapa</option>${STAGES.map(s => `<option ${f.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select class="in" id="f3"><option value="">Tipo</option>${["Prospecto", "Cliente"].map(s => `<option ${f.type === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select class="in" id="f4"><option value="">Responsable</option>${[...new Set(S.contacts.map(c => c.owner).filter(Boolean))].map(o => `<option ${f.owner === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>
    ${S.contacts.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Nombre</th><th>Hotel / empresa</th><th>Segmento</th><th>Etapa</th><th>Temperatura</th><th>WhatsApp</th><th>Responsable</th><th>Próx. seguimiento</th></tr></thead>
      <tbody>${shown.map(c => `<tr data-id="${c.id}"><td><b>${esc(c.name || "—")}</b></td><td>${esc(c.company || "")}</td><td>${esc(c.segment || "")}</td><td>${esc(c.stage || "")}</td><td>${esc(c.temperature || "")}</td>
        <td class="tabnum">${esc(c.phone || "")}</td><td>${esc(c.owner || "")}</td><td class="tabnum" style="${c.nextDate && c.nextDate < todayIso() ? "color:var(--red);font-weight:600" : ""}">${fmtDate(c.nextDate)}</td></tr>`).join("")}</tbody></table></div>
      ${list.length > 300 ? `<p class="muted">Mostrando 300: afina la búsqueda.</p>` : ""}`
      : `<div class="empty"><p><b>Todavía no hay contactos.</b></p><p>Impórtalos desde tu Excel CasaDorada_CRM o créalos uno por uno.</p><button class="btn primary" onclick="location.hash='importar'">Importar Excel</button></div>`}</div>`;
  $("#cq").oninput = e => { S.search = e.target.value; renderShell(); };
  [["f1", "seg"], ["f2", "stage"], ["f3", "type"], ["f4", "owner"]].forEach(([id, k]) => $("#" + id).onchange = e => { S.conF = { ...f, [k]: e.target.value }; renderShell(); });
  $("#newC").onclick = () => openContact(null);
  $$("tbody tr", el).forEach(tr => tr.onclick = () => openContact(tr.dataset.id));
}

const C_FIELDS = [
  ["Contacto", [["name", "Nombre"], ["phone", "WhatsApp", "tel"], ["email", "Correo", "email"], ["cargo", "Cargo"]]],
  ["Empresa", [["company", "Hotel / empresa"], ["city", "Ciudad"], ["segment", "Segmento", SEGMENTS], ["type", "Tipo", ["Prospecto", "Cliente"]]]],
  ["Venta", [["stage", "Etapa", STAGES], ["temperature", "Temperatura", TEMPS], ["potential", "Potencial", ["Alto", "Medio", "Bajo"]], ["level", "Nivel", ["3", "2", "1", "0", "-1"]],
    ["owner", "Responsable", "team"], ["reorderDays", "Recompra cada (días)", "num"], ["looking", "Qué busca", "wide"]]],
  ["Seguimiento", [["nextDate", "Próx. seguimiento", "date"], ["nextAction", "Qué hacer"], ["obs", "Observaciones", "textarea"]]],
];
function openContact(id) {
  const c = id ? byId(S.contacts, id) : { stage: "Nuevo", type: "Prospecto", segment: "Hoteles", owner: S.me.name };
  if (id && !c) return toast("Ese contacto ya no existe.");
  const m = $("#modal");
  const field = ([k, label, t]) => {
    const v = c[k] ?? "";
    if (Array.isArray(t) || t === "team") {
      const opts = t === "team" ? S.team.filter(u => u.active !== false).map(u => u.name) : t;
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
  if (id) unsub = fb.watch(`contacts/${id}/messages`, list => { const h = $("#chist"); if (h) h.innerHTML = list.map(bubble).join("") || '<span class="muted">Sin mensajes ni notas.</span>'; }, { orderBy: ["ts", "desc"], limit: 50 });
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
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Cotizaciones</h1><span class="spacer"></span><button class="btn primary" id="nq">+ Nueva cotización</button></div>
    <div class="toolbar"><select class="in" id="qf"><option value="">Todos los estados</option>${Q_STATUS.map(s => `<option ${f === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Número</th><th>Cliente</th><th class="num">Total</th><th>Estado</th><th>Creada</th><th>Por</th></tr></thead><tbody>
      ${list.map(q => `<tr data-id="${q.id}"><td class="mono">${esc(q.number)}</td><td>${esc(q.contactName)}</td><td class="num">${money(q.total)}</td><td>${statusPill(q.status)}</td><td>${fmtDT(q.createdAt)}</td><td>${esc(q.createdByName || "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty"><p>No hay cotizaciones${f ? " en ese estado" : ""}.</p></div>`}</div>`;
  $("#qf").onchange = e => { S.qF = e.target.value; renderShell(); };
  $("#nq").onclick = () => openQuote(null);
  $$("tbody tr", el).forEach(tr => tr.onclick = () => openQuote(tr.dataset.id));
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
        ${locked ? "" : `<button class="btn" id="qsave">Guardar</button>`}
        ${["Borrador"].includes(q.status) ? '<button class="btn primary" id="qsent">Marcar enviada</button>' : ""}
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
    if ($("#qsent")) $("#qsent").onclick = async () => {
      if (!await save({ status: "Enviada", sentAt: Date.now() })) return;
      const c = byId(S.contacts, q.contactId), text = quoteText(q);
      draw();
      if (WHATSAPP_ENABLED && winInfo(c).open && await ask("¿Enviar la cotización por WhatsApp ahora?", "Enviar", "No, ya la envié")) await sendText(c, text);
      else if (!WHATSAPP_ENABLED && waLink(c.phone) && await ask("Cotización marcada como enviada. ¿Abrir WhatsApp con el texto listo?", "Abrir WhatsApp", "No")) { window.open(waLink(c.phone, text), "_blank"); await logOutbound(c, text, "Cotización"); }
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
  const stageRows = STAGES.map(st => ({ k: st, v: S.contacts.filter(c => !c.archived && (c.stage || "Nuevo") === st).length }));
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
      ${list.map(o => `<tr data-id="${o.id}"><td class="mono">${esc(o.number)}</td><td>${esc(o.contactName)}</td><td class="num">${money(o.total)}</td><td>${statusPill(o.status)}</td><td>${statusPill(o.payment || "Pendiente")}</td><td class="mono">${esc(o.quoteNumber || "")}</td><td>${fmtDT(o.createdAt)}</td></tr>`).join("")}</tbody></table></div>`
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
      <small class="muted">Creado ${fmtDT(o.createdAt)} por ${esc(o.createdByName || "")} desde ${esc(o.quoteNumber || "")}</small></div>
    <div class="mf"><button class="btn" type="button" id="oc">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div></form>`;
  $("#ox").onclick = $("#oc").onclick = () => m.close();
  $("#of2").onsubmit = async e => { e.preventDefault(); await fb.update("orders/" + id, { status: $("#os").value, payment: $("#op").value, notes: $("#on").value.trim(), ...stamp() }); m.close(); toast("Pedido actualizado"); };
  m.showModal();
}

// ======================= Productos =======================
function viewProductos(el) {
  const q = norm(S.pQ || "");
  const list = S.products.filter(p => !q || norm(p.name + " " + (p.desc || "") + " " + (p.category || "") + " " + (p.sku || "")).includes(q)).sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
  el.innerHTML = `<div class="page" style="max-width:none"><div class="page-head"><h1>Productos</h1><span class="sub tabnum">${S.products.length}</span><span class="spacer"></span><button class="btn primary" id="np">+ Nuevo producto</button></div>
    <div class="toolbar"><input class="in" id="pq" placeholder="Buscar producto" value="${esc(S.pQ || "")}"></div>
    ${list.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Producto</th><th>Categoría</th><th>Descripción</th><th class="num">Precio detal</th><th class="num">Precio por mayor</th><th class="num">Mayor desde</th><th>Estado</th></tr></thead><tbody>
      ${list.map(p => `<tr data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td>${esc(p.category || "")}</td><td>${esc(p.desc || "")}</td><td class="num">${money(p.priceRetail)}</td><td class="num">${p.priceWholesale ? money(p.priceWholesale) : ""}</td><td class="num">${p.minWholesale || ""}</td><td>${p.active === false ? '<span class="pill">Inactivo</span>' : '<span class="pill green">Activo</span>'}</td></tr>`).join("")}</tbody></table></div>`
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
    const data = { name: $("#pn").value.trim(), category: $("#pc").value.trim(), sku: $("#psku").value.trim(), desc: $("#pd").value.trim(),
      priceRetail: num($("#pr").value), priceWholesale: num($("#pw").value), minWholesale: Number($("#pm").value) || 0, active: $("#pa").value === "1", ...stamp() };
    try { id ? await fb.update("products/" + id, data) : await fb.add("products", { ...data, createdAt: Date.now() }); m.close(); toast("Producto guardado"); }
    catch (er) { toast(/permission/i.test(errMsg(er)) ? "Solo la administradora puede cambiar productos." : "No se pudo guardar: " + errMsg(er)); }
  };
  m.showModal();
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
function openUser(id) {
  const u = id ? byId(S.team, id) : { role: "asesor", active: true }, m = $("#modal");
  m.innerHTML = `<form id="uf"><div class="mh"><h2>${id ? esc(u.name) : "Agregar persona"}</h2><button class="iconbtn" type="button" id="ux">✕</button></div>
    <div class="mb"><div class="grid2">
      <div><label class="lb" for="un">Nombre</label><input class="in" id="un" required value="${esc(u.name || "")}"></div>
      <div><label class="lb" for="ue">Correo</label><input class="in" id="ue" type="email" required value="${esc(u.email || "")}" ${id ? "disabled" : ""}></div>
      ${id ? "" : '<div><label class="lb" for="up">Contraseña inicial</label><input class="in" id="up" type="text" minlength="6" required placeholder="mínimo 6 caracteres"></div>'}
      <div><label class="lb" for="ur">Rol</label><select class="in" id="ur"><option value="asesor">Asesor</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Administradora</option></select></div>
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

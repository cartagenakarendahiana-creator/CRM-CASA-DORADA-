/* Chat web de House Chat · Casa Dorada
   Pega en tu página:  <script src="https://crm-casa-dorada.web.app/widget.js" defer></script>
   Los mensajes llegan a Conversaciones en el CRM y la asesora virtual puede responderlos. */
(function () {
  if (window.__houseChat) return; window.__houseChat = true;
  var me = document.currentScript || document.querySelector('script[src*="widget.js"]');
  var API = new URL("/api/webchat", me ? me.src : location.href).href;
  var KEY = "housechat_sid", NAMEKEY = "housechat_name";
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var sid = store(KEY);
  if (!sid || !/^[a-z0-9]{16,40}$/.test(sid)) {
    sid = ""; var a = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < 24; i++) sid += a[Math.floor(Math.random() * a.length)];
    store(KEY, sid);
  }
  var cfg = null, open = false, last = 0, msgs = [], timer = null, unseen = 0, sending = false, proactive = null;

  var host = document.createElement("div");
  host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483000";
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  root.innerHTML = '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}' +
    '.fab{width:58px;height:58px;border-radius:50%;border:0;background:var(--c);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.22);position:relative;transition:transform .15s}' +
    '.fab:hover{transform:scale(1.05)}.fab svg{width:28px;height:28px}' +
    '.badge{position:absolute;top:-2px;right:-2px;background:#ff3b30;color:#fff;font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:none;place-items:center;padding:0 5px}' +
    '.panel{position:absolute;right:0;bottom:72px;width:min(370px,calc(100vw - 24px));height:min(560px,calc(100vh - 110px));background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden}' +
    '.panel.on{display:flex}' +
    '.head{background:var(--c);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}' +
    '.head b{font-size:15px;display:block}.head small{opacity:.85;font-size:12px}.head .x{margin-left:auto;background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;padding:4px 8px}' +
    '.dot{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:grid;place-items:center;font-weight:700}' +
    '.body{flex:1;overflow:auto;padding:14px;background:#efeae2;display:flex;flex-direction:column;gap:6px}' +
    '.m{max-width:80%;padding:7px 10px;border-radius:10px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px .5px rgba(0,0,0,.13);color:#111b21}' +
    '.m.in{align-self:flex-end;background:#d9fdd3}.m.out{align-self:flex-start;background:#fff}' +
    '.m small{display:block;font-size:11px;color:#667781;margin-top:2px;text-align:right}.m .by{font-size:12px;font-weight:600;color:var(--c);display:block;margin-bottom:2px}' +
    '.foot{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#f7f7f7}' +
    '.foot textarea{flex:1;resize:none;border:1px solid #ddd;border-radius:20px;padding:9px 14px;font-size:14px;max-height:100px;outline:none}' +
    '.foot button{width:40px;height:40px;border-radius:50%;border:0;background:var(--c);color:#fff;cursor:pointer;display:grid;place-items:center;flex:none}' +
    '.foot button:disabled{opacity:.5}.foot button svg{width:18px;height:18px}' +
    '.ask{padding:14px;display:grid;gap:8px;background:#fff;border-top:1px solid #eee}.ask input{border:1px solid #ddd;border-radius:10px;padding:9px 12px;font-size:14px}' +
    '.ask button{border:0;border-radius:10px;padding:10px;background:var(--c);color:#fff;font-weight:600;cursor:pointer}.ask p{margin:0;font-size:13px;color:#555}' +
    '.m .doc{display:block;padding:8px 10px;margin:2px 0 6px;border-radius:8px;background:rgba(0,0,0,.05);color:inherit;font-weight:600;text-decoration:none}' +
    '.m .pic{display:block;width:100%;max-width:240px;border-radius:8px;margin:2px 0 6px}' +
    '.brand{text-align:center;font-size:10.5px;color:#999;padding:4px 0 6px;background:#f7f7f7}' +
    '.tease{position:absolute;right:0;bottom:72px;width:max-content;max-width:min(290px,calc(100vw - 40px));background:#fff;color:#111b21;border-radius:14px;padding:12px 30px 12px 14px;font-size:14px;line-height:1.4;box-shadow:0 10px 30px rgba(0,0,0,.2);cursor:pointer;display:none;white-space:pre-wrap;animation:up .3s ease}' +
    '.tease b{display:block;font-size:12px;color:var(--c);margin-bottom:2px}.tease .tx{position:absolute;top:4px;right:6px;border:0;background:transparent;color:#999;font-size:16px;cursor:pointer;padding:2px 6px}' +
    '@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '</style>' +
    '<div class="panel" part="panel"><div class="head"><div class="dot">CD</div><div><b class="t"></b><small>Respondemos en minutos</small></div><button class="x" aria-label="Cerrar">×</button></div>' +
    '<div class="body" role="log" aria-live="polite"></div>' +
    '<form class="ask" style="display:none"><p>Para atenderte mejor, cuéntanos:</p><input name="n" placeholder="Tu nombre" required maxlength="80"><input name="p" placeholder="Tu celular (opcional)" inputmode="tel" maxlength="20"><button>Empezar chat</button></form>' +
    '<form class="foot"><textarea rows="1" placeholder="Escribe un mensaje" maxlength="1000"></textarea><button aria-label="Enviar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/></svg></button></form>' +
    '<div class="brand">House Chat</div></div>' +
    '<div class="tease" role="status"><button class="tx" aria-label="Cerrar">×</button><b class="tt"></b><span class="tm"></span></div>' +
    '<button class="fab" aria-label="Abrir chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span class="badge"></span></button>';
  var $ = function (s) { return root.querySelector(s); };
  var panel = $(".panel"), body = $(".body"), fab = $(".fab"), badge = $(".badge"), foot = $(".foot"), ta = $(".foot textarea"), ask = $(".ask");

  function fmt(ts) { var d = new Date(ts); return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }); }
  function draw() {
    var html = '<div class="m out">' + esc(cfg.greeting) + '</div>' + (proactive ? '<div class="m out">' + fmt2(proactive.text) + '</div>' : "");
    msgs.forEach(function (m) { html += '<div class="m ' + m.dir + '">' + (m.dir === "out" && m.by ? '<span class="by">' + esc(m.by) + '</span>' : "") + (m.document && /^https:\/\//.test(m.document.url) ? '<a class="doc" href="' + esc(m.document.url) + '" target="_blank" rel="noopener">📄 ' + esc(m.document.filename || "Documento") + '</a>' : "") + (m.image && /^https:\/\//.test(m.image) ? '<a href="' + esc(m.image) + '" target="_blank" rel="noopener"><img class="pic" src="' + esc(m.image) + '" alt="Foto del producto" loading="lazy"></a>' : "") + fmt2(m.text) + '<small>' + fmt(m.ts) + '</small></div>'; });
    body.innerHTML = html; body.scrollTop = body.scrollHeight;
  }
  // Formato de WhatsApp (*negrita*, _cursiva_, ~tachado~) sobre texto escapado
  function fmt2(s) { return esc(s).replace(/(^|[\s(¡¿"'])([*_~])([^\s*_~](?:[^*_~\n]*[^\s*_~])?)\2(?=$|[\s).,!?:;"'])/g, function (m, pre, k, x) { var t = { "*": "b", "_": "i", "~": "s" }[k]; return pre + "<" + t + ">" + x + "</" + t + ">"; }); }
  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function poll() {
    fetch(API + "?sid=" + sid + "&after=" + last).then(function (r) { return r.json(); }).then(function (d) {
      var add = (d.msgs || []).filter(function (m) { return m.ts > last; });
      if (!add.length) return;
      add.forEach(function (m) { msgs.push(m); last = Math.max(last, m.ts); if (!open && m.dir === "out") unseen++; });
      draw(); setBadge();
    }).catch(function () {});
  }
  function setBadge() { badge.textContent = unseen; badge.style.display = unseen ? "grid" : "none"; }
  function schedule() { clearInterval(timer); timer = setInterval(poll, open ? 3000 : 20000); }
  function toggle(v) {
    open = v; panel.classList.toggle("on", v);
    if (v) { tease.style.display = "none"; unseen = 0; setBadge(); var needName = cfg.askName && !store(NAMEKEY) && !msgs.length; ask.style.display = needName ? "grid" : "none"; foot.style.display = needName ? "none" : "flex"; if (!needName) ta.focus(); poll(); }
    schedule();
  }
  function send(text) {
    if (sending || !text.trim()) return; sending = true; foot.querySelector("button").disabled = true;
    var temp = { dir: "in", text: text, ts: Date.now() }; msgs.push(temp); draw();
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: sid, text: text, name: store(NAMEKEY) || "", phone: store(NAMEKEY + "_p") || "", page: location.href, funnel: proactive ? proactive.id : "" }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        msgs.splice(msgs.indexOf(temp), 1);
        if (d.error) { alert(d.error); draw(); return; }
        proactive = null; store("housechat_chatted", "1"); poll(); // el mensaje automático ya quedó guardado en el chat
      }).catch(function () { alert("No se pudo enviar. Revisa tu conexión."); })
      .then(function () { sending = false; foot.querySelector("button").disabled = false; });
  }
  fab.onclick = function () { toggle(!open); };
  // Mensaje automático según la página: aparece después de unos segundos, una sola vez por visitante, si aún no ha chateado
  var tease = $(".tease");
  tease.onclick = function () { toggle(true); };
  $(".tx").onclick = function (e) { e.stopPropagation(); tease.style.display = "none"; };
  function startFunnel() {
    var url = decodeURIComponent(location.href).toLowerCase(), f = null;
    (cfg.funnels || []).some(function (x) { var m = String(x.match || "").toLowerCase().trim(); if (store("housechat_f_" + x.id) || (m && url.indexOf(m) < 0)) return false; f = x; return true; });
    if (!f || store("housechat_chatted")) return; // quien ya chateó no recibe saludos automáticos
    setTimeout(function () {
      if (open || msgs.length || proactive) return;
      proactive = f; store("housechat_f_" + f.id, "1");
      $(".tt").textContent = cfg.title || "Chat"; $(".tm").textContent = f.text.replace(/[*_~]/g, "");
      tease.style.display = "block"; unseen = 1; setBadge(); draw();
    }, Math.max(2, f.delay || 0) * 1000); // al menos 2 s: primero se sabe si ya tenía un chat
  }
  $(".x").onclick = function () { toggle(false); };
  foot.onsubmit = function (e) { e.preventDefault(); var t = ta.value; ta.value = ""; send(t); };
  ta.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); foot.onsubmit(e); } };
  ask.onsubmit = function (e) { e.preventDefault(); store(NAMEKEY, ask.n.value.trim()); store(NAMEKEY + "_p", ask.p.value.trim()); ask.style.display = "none"; foot.style.display = "flex"; ta.focus(); };

  fetch(API + "?cfg=1").then(function (r) { return r.json(); }).then(function (c) {
    if (!c.on) return;
    cfg = c; host.style.setProperty("--c", c.color || "#0f7a4c"); root.host && root.host.style.setProperty("--c", c.color || "#0f7a4c");
    $(".t").textContent = c.title || "Chat";
    $(".dot").textContent = (c.title || "Chat").trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
    document.body.appendChild(host); draw(); poll(); schedule(); startFunnel();
  }).catch(function () {});
})();

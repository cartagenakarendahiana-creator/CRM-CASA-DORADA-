// Inversión en pauta de Meta (Facebook e Instagram Ads) para compararla con las ventas.
// Se conecta con la cuenta publicitaria (act_…) y un token con permiso ads_read; los dos quedan en private/ads.
// Cada 6 horas (y con el botón) se lee lo gastado por anuncio en cada periodo y se guarda en adSpend/{periodo}.
const PRESETS = ["this_month", "last_month", "last_7d", "last_30d", "last_90d", "this_year", "maximum"];
const actId = s => { const d = String(s || "").replace(/\D/g, ""); return d ? "act_" + d : ""; };
const SALES = /SALES|CONVERSIONS|PRODUCT_CATALOG|MESSAGES|LEAD/; // objetivos que buscan ventas o conversaciones

module.exports = function pauta({ db, GRAPH, fetchFn = (...a) => fetch(...a) }) {
  async function get(path, token) {
    const r = await fetchFn(`${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error((j.error && (j.error.error_user_msg || j.error.message)) || "Meta respondió " + r.status);
    return j;
  }
  async function connect({ token, account }) {
    const act = actId(account);
    if (!act) throw new Error("Escribe el número de tu cuenta publicitaria (lo ves en el Administrador de anuncios, junto al nombre de la cuenta).");
    if (!token || String(token).length < 20) throw new Error("Pega el token de acceso con permiso ads_read.");
    const a = await get(`${act}?fields=name,currency,account_status`, token);
    await db.doc("private/ads").set({ token: String(token).trim(), account: act });
    await db.doc("settings/ads").set({ on: true, name: a.name || "", currency: a.currency || "COP", account: act, at: Date.now(), error: "" }, { merge: true });
    return { name: a.name, currency: a.currency, synced: await sync().catch(e => ({ error: e.message })) };
  }
  async function sync(now = Date.now()) {
    const cfg = (await db.doc("private/ads").get()).data();
    if (!cfg || !cfg.token) return "sin conectar";
    try {
      for (const preset of PRESETS) {
        const ads = {}; let total = 0;
        let path = `${cfg.account}/insights?level=ad&date_preset=${preset}&fields=ad_id,ad_name,campaign_id,campaign_name,objective,spend,impressions,clicks&limit=500`;
        for (let page = 0; path && page < 6; page++) {
          const j = await get(path, cfg.token);
          for (const r of j.data || []) {
            const spend = Math.round(Number(r.spend) || 0);
            ads[r.ad_id] = { name: String(r.ad_name || "").slice(0, 120), campaign: String(r.campaign_name || "").slice(0, 120), campaignId: String(r.campaign_id || ""),
              objective: r.objective || "", sales: SALES.test(r.objective || ""), spend, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0 };
            total += spend;
          }
          path = j.paging && j.paging.next ? j.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "").replace(/([?&])access_token=[^&]*&?/, "$1") : null;
        }
        await db.doc("adSpend/" + preset).set({ preset, total, ads, at: now });
      }
      await db.doc("settings/ads").set({ syncedAt: now, error: "" }, { merge: true });
      return "ok";
    } catch (e) {
      await db.doc("settings/ads").set({ error: String(e.message).slice(0, 300), errorAt: now }, { merge: true });
      throw e;
    }
  }
  return { connect, sync };
};
module.exports.actId = actId;
module.exports.PRESETS = PRESETS;

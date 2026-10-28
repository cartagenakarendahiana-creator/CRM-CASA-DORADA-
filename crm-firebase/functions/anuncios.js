// Anuncios: de qué anuncio llegó cada conversación (Click to WhatsApp, Instagram y Messenger).
// Meta manda un "referral" con el primer mensaje que viene de un anuncio; aquí se normaliza a
// { id, type, headline, body, url, thumb, channel, at }. En el contacto queda `ad` (el anuncio que lo trajo
// la primera vez) y `lastAd` (el más reciente); la app arma el reporte por anuncio.
const clip = (s, n) => String(s || "").slice(0, n);

// WhatsApp Cloud API: messages[].referral { source_url, source_id, source_type, headline, body, media_type, image_url, thumbnail_url, ctwa_clid }
function fromWhatsApp(r, ts) {
  if (!r || !(r.source_id || r.source_url || r.headline)) return null;
  return { id: clip(r.source_id, 60), type: r.source_type === "post" ? "post" : "ad", headline: clip(r.headline, 160), body: clip(r.body, 300),
    url: clip(r.source_url, 500), thumb: clip(r.thumbnail_url || r.image_url, 500), channel: "whatsapp", at: ts };
}
// Messenger e Instagram: referral { ad_id, source: "ADS", type, ref, ads_context_data: { ad_title, photo_url, video_url, post_id } }
function fromMeta(r, channel, ts) {
  if (!r || !(r.ad_id || (r.ads_context_data && r.ads_context_data.ad_title))) return null;
  const c = r.ads_context_data || {};
  return { id: clip(r.ad_id, 60), type: "ad", headline: clip(c.ad_title, 160), body: "", url: "", thumb: clip(c.photo_url, 500), channel, at: ts };
}
// Campos para el contacto: el primer anuncio se conserva y el último se actualiza
const contactPatch = (ad, existingAd) => (ad ? { lastAd: ad, ...(existingAd ? {} : { ad }) } : {});

module.exports = { fromWhatsApp, fromMeta, contactPatch };

// Transcripción de notas de voz con Speech-to-Text v2 de Google Cloud (mismo proyecto, sin claves extra:
// usa la cuenta de servicio de las funciones). Audios de hasta 1 minuto se transcriben al instante;
// los más largos se procesan en lote desde el bucket privado de archivos.
const LANGS = ["es-CO", "es-US"]; // si el modelo no tiene español de Colombia, usa el latino

module.exports = function transcribir({ project, bucketName, getToken, fetchFn = (...a) => fetch(...a), wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  const base = `https://speech.googleapis.com/v2/projects/${project}/locations/global/recognizers/_`;
  async function call(url, body) {
    const r = await fetchFn(url, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + await getToken(), "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || "Speech-to-Text respondió " + r.status);
    return j;
  }
  const config = lang => ({ autoDecodingConfig: {}, languageCodes: [lang], model: "long", features: { enableAutomaticPunctuation: true } });
  const joinText = results => (results || []).map(x => ((x.alternatives || [])[0] || {}).transcript || "").join(" ").replace(/\s+/g, " ").trim();
  const isLong = e => /60 seconds|duration|too long|exceeds|maximum/i.test(e.message || "");
  const isLang = e => /language|locale/i.test(e.message || "");

  async function batch(lang, path) {
    const uri = `gs://${bucketName}/${path}`;
    let op = await call(`${base}:batchRecognize`, { config: config(lang), files: [{ uri }], recognitionOutputConfig: { inlineResponseConfig: {} } });
    for (let i = 0; i < 40 && !op.done; i++) { await wait(3000); op = await call(`https://speech.googleapis.com/v2/${op.name}`); }
    if (!op.done) throw new Error("La transcripción tardó demasiado.");
    if (op.error) throw new Error(op.error.message || "No se pudo transcribir.");
    const res = ((op.response || {}).results || {})[uri] || {};
    if (res.error) throw new Error(res.error.message || "No se pudo transcribir.");
    return joinText(((res.transcript || res.inlineResult && res.inlineResult.transcript) || {}).results);
  }
  // buf: el audio; path: dónde quedó guardado en el bucket (para audios largos)
  async function transcribe(buf, path) {
    let last;
    for (const lang of LANGS) {
      try { return joinText((await call(`${base}:recognize`, { config: config(lang), content: buf.toString("base64") })).results); }
      catch (e) {
        last = e;
        if (isLong(e) && path) { try { return await batch(lang, path); } catch (e2) { last = e2; if (!isLang(e2)) throw e2; continue; } }
        if (!isLang(e)) throw e;
      }
    }
    throw last;
  }
  return { transcribe };
};

// Embudos con nombre conocido (el id lo pone cada empresa; se reconocen por el nombre en settings/pipelines):
//   hoteles → "Línea Hotelera" · sitio → "Sitio web" · registro → "Registro en sitio web" · distribuidores → "Distribuidores"
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const KINDS = { hoteles: n => /hotel/.test(n), registro: n => /registro/.test(n), sitio: n => /(sitio|pagina) web/.test(n) && !/registro/.test(n), distribuidores: n => /distribu|mayorist/.test(n) };
const findPipe = (list, kind) => (list || []).find(p => p && p.id !== "ventas" && KINDS[kind](norm(p.name))) || null;
// ¿Es un hotel u hospedaje? (por el nombre de la empresa o lo que busca)
const HOTEL_RE = /\b(hotel(es|ero|era)?|hostal(es)?|apartahotel|aparta ?estudio|motel|glamping|airbnb|hospedaje|posada|resort|alojamiento|cabanas?|finca hotel|hosteria)\b/;
const isHotel = (...texts) => HOTEL_RE.test(norm(texts.join(" ")));
// Pasa un contacto al embudo indicado (a la etapa equivalente si existe, si no a la primera)
function movePatch(contact, pipe) {
  if (!pipe || (contact.pipeline || "ventas") === pipe.id) return {};
  const stage = (pipe.stages || []).includes(contact.stage) ? contact.stage : (pipe.stages || ["Nuevo"])[0];
  return { pipeline: pipe.id, stage, stageAt: Date.now() };
}
module.exports = { findPipe, isHotel, movePatch, norm };

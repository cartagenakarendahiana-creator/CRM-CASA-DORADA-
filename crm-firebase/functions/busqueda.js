// Búsqueda de productos para la asesora: sin tildes, singular o plural, con sinónimos de cómo la gente llama los
// productos (cobija = manta = frazada; cuadros = escocesa = plaid…) y sin palabras de relleno ("de", "la", "quiero"…).
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set("de del la las el los un una unos unas y o a al en con sin para por que q me mi mis tu su sus hay tienen tiene tienes quiero quisiera busco buscando necesito precio precios valor cuanto cuesta vale foto fotos ver mostrar muestrame algo alguna alguno como esta este estos estas ese esa eso hola buenas buenos dias tardes noches porfa favor gracias".split(" "));
// Grupos de sinónimos (raíces): si el cliente dice una, cuenta cualquiera del grupo
const SYN = [
  ["cobij", "manta", "frazad", "cobertor", "frisa"],
  ["cuadr", "cuadricul", "escoce", "plaid", "tartan", "check", "buffalo"],
  ["plumon", "edredon", "acolchad", "duvet"],
  ["cubrelech", "tendido", "colcha", "sobrecama"],
  ["sabana", "juego de cama"],
  ["almohad"], ["cojin", "cojines"], ["protector", "forro"], ["toall"], ["cortin"], ["tapete", "alfombr"],
  ["estampad", "diseno", "figura", "dibujo", "infantil"], ["unicolor", "liso", "lisa", "entero", "solido"],
  ["rayas", "rayad", "lineas"], ["flore", "floral"], ["peluch", "peludit", "sherpa", "borreg", "corder"],
];
// Raíz de una palabra: sin plural ("cuadros" → "cuadro", "sabanas" → "sabana", "colores" → "color")
const stem = w => (w.length > 5 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
// Términos de la consulta: cada uno con sus variantes (raíz + sinónimos)
function terms(query) {
  const words = norm(query).split(/[^a-z0-9.]+/).filter(w => w.length > 1 && !STOP.has(w));
  return [...new Set(words)].map(w => { const st = stem(w), g = SYN.find(grp => grp.some(r => st.startsWith(r) || r.startsWith(st) && st.length >= 4)); return { w, alts: [...new Set([st, ...(g || [])])] }; });
}
const hayOf = p => norm([p.name, p.category, p.desc, p.search].join(" "));
// Puntaje por término: la palabra misma pesa más que un sinónimo, y en el nombre más que en la descripción
function score(p, ts) {
  const hay = hayOf(p), name = norm(p.name);
  return ts.reduce((n, t) => { const own = t.alts[0], syn = t.alts.slice(1);
    return n + (name.includes(own) ? 4 : syn.some(a => name.includes(a)) ? 2 : hay.includes(own) ? 2 : syn.some(a => hay.includes(a)) ? 1 : 0); }, 0);
}
function search(products, query, max = 12) {
  const ts = terms(query);
  if (!ts.length) return [];
  const need = ts.length >= 3 ? 2 : 1; // con 3 o más palabras, al menos 2 deben coincidir
  return products.map(p => [p, score(p, ts), ts.filter(t => t.alts.some(a => hayOf(p).includes(a))).length])
    .filter(([, s, hits]) => s > 0 && hits >= Math.min(need, ts.length)).sort((a, b) => b[2] - a[2] || b[1] - a[1]).slice(0, max).map(([p]) => p);
}
module.exports = { search, terms, score, norm, stem };

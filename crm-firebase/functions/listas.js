// Listas de precios por tipo de cliente (hoteles, distribuidores…) y venta cruzada.
// priceLists/{id}: { name, pct (descuento % sobre el precio de la tienda), rules: [{ scope: "categoria"|"producto", match, tiers: [{ min, price }] }],
//                    minOrder (pedido mínimo en pesos), validDays (vigencia de la cotización), pipelines: [embudos conectados] }
// La lista de un contacto: la que tiene asignada en su ficha (priceList) o la del embudo en el que está.
// Solo se usan al cotizar: la tienda y la asesora siguen vendiendo con el precio normal.
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const baseName = name => norm(String(name || "").split(" · ")[0].split("|")[0]);

function listFor(contact, lists) {
  if (!contact) return null;
  return (lists || []).find(l => l.id === contact.priceList) || (lists || []).find(l => (l.pipelines || []).includes(contact.pipeline || "ventas")) || null;
}
// Precio por unidad de un producto con la lista: la regla del producto gana a la de la categoría; dentro de la regla,
// el escalón de mayor cantidad que se alcance. Sin regla que aplique: el % general sobre el precio de la tienda.
function listPrice(p, qty, list) {
  const retail = Number(p.priceRetail) || 0;
  if (!list) return null;
  const rules = list.rules || [];
  const rule = rules.find(r => r.scope === "producto" && (r.match === p.id || String(p.id).startsWith(r.match + "_") || baseName(r.match) === baseName(p.name)))
    || rules.find(r => r.scope === "categoria" && norm(r.match) && (norm(r.match) === norm(p.category) || baseName(p.name).includes(norm(r.match))));
  const tier = rule && (rule.tiers || []).filter(t => qty >= (Number(t.min) || 1) && Number(t.price) > 0).sort((a, b) => b.min - a.min)[0];
  if (tier) return Math.round(Number(tier.price));
  if (Number(list.pct) > 0 && retail) return Math.round(retail * (1 - Math.min(90, Number(list.pct)) / 100));
  return null;
}

// Venta cruzada: settings/ventaCruzada { pairs: [{ from, to, fromName, toName, note }], dismissed: ["from>to"] }
// from/to: nombre base del producto (sin color ni medida). La asesora ofrece el complemento una vez, al cerrar.
function crossText(pairs) {
  const list = (pairs || []).filter(p => p.fromName && p.toName).slice(0, 40);
  if (!list.length) return "";
  return "Venta cruzada (cuando el cliente ya decidió comprar uno de estos productos, ofrécele UNA vez su complemento, en una frase, sin insistir; si dice que no, sigue con el cierre):\n"
    + list.map(p => `- ${p.fromName} → ${p.toName}${p.note ? " (" + String(p.note).slice(0, 120) + ")" : ""}`).join("\n");
}

module.exports = { listFor, listPrice, crossText, baseName, norm };

// Stock: por defecto todo producto activo se ofrece como disponible (settings/asesora.ignoreStock, encendido salvo que
// la administradora lo apague). Apagado, se respeta lo que diga Shopify (available=false: agotado).
const ignoreStock = cfg => !cfg || cfg.ignoreStock !== false;
const applyStock = (products, cfg) => (ignoreStock(cfg) ? products.map(p => (p.active !== false ? { ...p, available: true } : p)) : products);
module.exports = { ignoreStock, applyStock };

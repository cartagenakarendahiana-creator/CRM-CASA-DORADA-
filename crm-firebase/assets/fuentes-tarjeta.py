# Prepara las letras (Inter, licencia OFL) que usa la tarjeta de descuento en PNG.
# Uso: python3 assets/fuentes-tarjeta.py  → escribe functions/tarjeta-fuentes.js
import base64, json, zlib, os
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__))
D = "/usr/share/fonts/opentype/inter/"
FULL = "".join(chr(c) for c in range(32, 127)) + "áéíóúÁÉÍÓÚñÑüÜ¡¿°·–—‘’“”…"
STYLES = {  # nombre: (archivo, tamaño, caracteres)
  "pct": ("InterDisplay-Black.otf", 230, " -–0123456789%"),
  "price": ("Inter-Bold.otf", 78, " $0123456789.Ahora"),
  "old": ("Inter-Regular.otf", 40, " $0123456789.Antes"),
  "title": ("Inter-SemiBold.otf", 46, FULL),
  "body": ("Inter-Regular.otf", 32, FULL),
  "caps": ("Inter-SemiBold.otf", 24, FULL),
  "pill": ("Inter-Bold.otf", 30, FULL),
  "badge": ("InterDisplay-Black.otf", 92, " -–0123456789%"),
}
out = {}
for name, (fname, size, chars) in STYLES.items():
    f = ImageFont.truetype(D + fname, size)
    asc, desc = f.getmetrics()
    glyphs, blob = {}, bytearray()
    for ch in dict.fromkeys(chars):
        adv = f.getlength(ch)
        bb = f.getbbox(ch, anchor="ls")  # relativo a la línea base
        w, h = max(0, bb[2] - bb[0]), max(0, bb[3] - bb[1])
        if w and h:
            im = Image.new("L", (w, h), 0)
            ImageDraw.Draw(im).text((-bb[0], -bb[1]), ch, font=f, fill=255, anchor="ls")
            off = len(blob); blob += im.tobytes()
        else:
            off = len(blob)
        glyphs[ch] = [round(adv, 2), bb[0], bb[1], w, h, off]
    out[name] = {"size": size, "asc": asc, "desc": desc, "g": glyphs, "a": base64.b64encode(zlib.compress(bytes(blob), 9)).decode()}
dst = os.path.join(here, "..", "functions", "tarjeta-fuentes.js")
with open(dst, "w") as fh:
    fh.write("// Letras de Inter (licencia SIL Open Font License) ya dibujadas para la tarjeta de descuento.\n// Generado por assets/fuentes-tarjeta.py; no editar a mano.\n")
    fh.write("module.exports = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(os.path.getsize(dst))

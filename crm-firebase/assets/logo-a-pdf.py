# Convierte el logo (dorado sobre negro) en la máscara de transparencia que usa la cotización en PDF.
# Uso: python3 assets/logo-a-pdf.py   → escribe functions/logo-pdf.js
import base64, zlib, os
from PIL import Image, ImageFilter
here = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(here, "logo-casa-dorada.jpg")).convert("L")
bbox = im.point(lambda v: 255 if v > 60 else 0).getbbox()          # recorta el fondo negro
x0, y0, x1, y1 = bbox; pad = 4
im = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
im = im.resize((im.width * 3, im.height * 3), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
# brillo → opacidad: negro = transparente, dorado = opaco (con borde suave)
lo, hi = 45, 150
im = im.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * 255 / (hi - lo)))
data = zlib.compress(im.tobytes(), 9)
out = os.path.join(here, "..", "functions", "logo-pdf.js")
with open(out, "w") as f:
    f.write("// Logo de Casa Dorada como máscara de transparencia (generado por assets/logo-a-pdf.py; no editar a mano)\n")
    f.write(f"module.exports = {{ width: {im.width}, height: {im.height}, alpha: \"{base64.b64encode(data).decode()}\" }};\n")
print(im.size, len(data))

#!/bin/bash
# Script de arranque del servidor del puente de WhatsApp (Google Compute Engine).
# Corre como root cada vez que el servidor enciende: instala Node 22, baja el código
# desde los metadatos del servidor (puente-mjs y puente-pkg) y deja el puente como servicio.
set -e
MD=http://metadata.google.internal/computeMetadata/v1
md() { curl -sf -H "Metadata-Flavor: Google" "$MD/$1"; }

# 1 GB de memoria de intercambio: el servidor gratuito tiene poca RAM
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! node -v 2>/dev/null | grep -q '^v22'; then
  apt-get update -y && apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

APP=/opt/housechat-wa
mkdir -p "$APP"
md instance/attributes/puente-mjs > "$APP/puente.mjs"
md instance/attributes/puente-pkg > "$APP/package.json.new"
if [ ! -d "$APP/node_modules" ] || ! cmp -s "$APP/package.json.new" "$APP/package.json"; then
  mv "$APP/package.json.new" "$APP/package.json"
  (cd "$APP" && npm install --omit=dev --no-audit --no-fund)
else
  rm "$APP/package.json.new"
fi

PROJECT=$(md project/project-id)
cat > /etc/systemd/system/housechat-wa.service <<UNIT
[Unit]
Description=House Chat - puente de WhatsApp por QR
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$APP
Environment=GOOGLE_CLOUD_PROJECT=$PROJECT
Environment=WA_SESSION_DIR=$APP/sesion
ExecStart=/usr/bin/node --max-old-space-size=400 puente.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable housechat-wa
systemctl restart housechat-wa

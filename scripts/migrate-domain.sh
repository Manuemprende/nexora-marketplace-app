#!/usr/bin/env bash
set -euo pipefail

DOMAIN=nexora.wentixai.cyou
ACME_ROOT=/var/lib/nexora/acme
SITE_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
SITE_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"

test -d /opt/nexora/dist
test -f /etc/nexora/nexora.env
test -d "${ACME_ROOT}"
getent ahostsv4 "${DOMAIN}" | awk '{print $1}' | grep -qx '161.97.160.76'
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tar -czf "/var/backups/nexora/pre-domain-release-${stamp}.tar.gz" -C /opt/nexora server templates dist
cp -a /etc/nexora/nexora.env "/var/backups/nexora/nexora.env-pre-domain-${stamp}"

cat > "${SITE_AVAILABLE}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${ACME_ROOT}; }
    location / { return 503; }
}
EOF
ln -sfn "${SITE_AVAILABLE}" "${SITE_ENABLED}"
nginx -t
systemctl reload nginx
certbot certonly --webroot -w "${ACME_ROOT}" -d "${DOMAIN}" --non-interactive --agree-tos --account 4aa39942cd7a250a071d1445700425aa

cat > "${SITE_AVAILABLE}" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root ${ACME_ROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    root /opt/nexora/dist;
    index index.html;
    client_max_body_size 18m;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options DENY always;
    location /api/ {
        proxy_pass http://127.0.0.1:3107;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location /tienda {
        try_files /tienda/index.html /tienda.html =404;
    }
    location /assets/ { try_files \$uri =404; expires 7d; }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF

chmod 644 "${SITE_AVAILABLE}"
python3 - <<'PY'
from pathlib import Path
path = Path('/etc/nexora/nexora.env')
lines = path.read_text().splitlines()
replacement = 'NEXORA_PUBLIC_ORIGIN=https://nexora.wentixai.cyou'
found = False
for i, line in enumerate(lines):
    if line.startswith('NEXORA_PUBLIC_ORIGIN='):
        lines[i] = replacement
        found = True
        break
if not found:
    lines.append(replacement)
tmp = path.with_suffix('.env.new')
tmp.write_text('\n'.join(lines) + '\n')
tmp.chmod(0o600)
tmp.replace(path)
PY

nginx -t
systemctl daemon-reload
systemctl restart nexora.service
systemctl reload nginx
curl --fail --silent http://127.0.0.1:3107/api/health
printf '\nDOMAIN_MIGRATED %s\n' "${DOMAIN}"

#!/bin/bash
set -euo pipefail
test ! -e /opt/nexora
test ! -e /etc/nginx/sites-available/nexora.wentixai.cyou
! ss -ltn | grep -q ':3107 '
mkdir -p /opt/nexora /opt/nexora-runtime /var/lib/nexora/acme /var/backups/nexora /etc/nexora
tar -xzf /root/nexora-release.tar.gz -C /opt/nexora
cd /opt/nexora-runtime
curl -fsS https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o SHASUMS256.txt
node_archive=$(awk '$2 ~ /linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
test -n "$node_archive"
curl -fsS "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$node_archive"
awk -v name="$node_archive" '$2 == name' SHASUMS256.txt | sha256sum --check -
tar -xf "$node_archive" --strip-components=1
export PATH="/opt/nexora-runtime/bin:$PATH"
cd /opt/nexora
NODE_OPTIONS=--max-old-space-size=192 npm ci --omit=dev --no-audit --no-fund
id nexora >/dev/null 2>&1 || useradd --system --home-dir /var/lib/nexora --shell /usr/sbin/nologin nexora
cp .deploy/nexora.sqlite /var/lib/nexora/nexora.sqlite
node scripts/bootstrap-hosted.mjs
chown -R nexora:nexora /var/lib/nexora /var/backups/nexora
chmod 750 /var/lib/nexora /var/backups/nexora
cat > /etc/nexora/nexora.env <<'EOF'
NODE_ENV=production
NEXORA_PUBLIC_ORIGIN=https://nexora.wentixai.cyou
NEXORA_DB_PATH=/var/lib/nexora/nexora.sqlite
NEXORA_API_PORT=3107
NODE_OPTIONS=--max-old-space-size=192
EOF
chmod 600 /etc/nexora/nexora.env
cat > /etc/systemd/system/nexora.service <<'EOF'
[Unit]
Description=Nexora commerce API
After=network.target
[Service]
User=nexora
Group=nexora
WorkingDirectory=/opt/nexora
EnvironmentFile=/etc/nexora/nexora.env
ExecStart=/opt/nexora-runtime/bin/node server/index.mjs
Restart=on-failure
RestartSec=5
MemoryMax=256M
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/nexora
UMask=0027
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/nginx/sites-available/nexora.wentixai.cyou <<'EOF'
server {
    listen 80;
    server_name nexora.wentixai.cyou;
    location /.well-known/acme-challenge/ { root /var/lib/nexora/acme; }
    location / { return 503; }
}
EOF
ln -s /etc/nginx/sites-available/nexora.wentixai.cyou /etc/nginx/sites-enabled/nexora.wentixai.cyou
# Challenge directory is readable by nginx; database stays private.
chmod 755 /var/lib/nexora /var/lib/nexora/acme
chmod 640 /var/lib/nexora/nexora.sqlite
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/lib/nexora/acme -d nexora.wentixai.cyou --non-interactive --account 4aa39942cd7a250a071d1445700425aa
cat > /etc/nginx/sites-available/nexora.wentixai.cyou <<'EOF'
server {
    listen 80;
    server_name nexora.wentixai.cyou;
    location /.well-known/acme-challenge/ { root /var/lib/nexora/acme; }
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    server_name nexora.wentixai.cyou;
    ssl_certificate /etc/letsencrypt/live/nexora.wentixai.cyou/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nexora.wentixai.cyou/privkey.pem;
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
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /assets/ { try_files $uri =404; expires 7d; }
    location / { try_files $uri $uri/ /index.html; }
}
EOF
systemctl daemon-reload
systemctl enable --now nexora.service
curl --fail --silent http://127.0.0.1:3107/api/health
nginx -t
systemctl reload nginx
echo DEPLOYED

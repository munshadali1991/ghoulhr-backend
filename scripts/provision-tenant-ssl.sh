#!/usr/bin/env bash
set -euo pipefail

FQDN="${1:-}"
if [[ -z "$FQDN" ]]; then
  echo "Usage: $0 <tenant-fqdn>" >&2
  exit 1
fi

if [[ ! "$FQDN" =~ ^[a-z0-9-]+(\.[a-z0-9-]+)+$ ]]; then
  echo "Invalid domain: $FQDN" >&2
  exit 1
fi

APP_BASE_PATH="${APP_BASE_PATH:-/ghoulhrms}"
API_UPSTREAM="${API_UPSTREAM:-http://127.0.0.1:3000/}"
FRONTEND_UPSTREAM="${FRONTEND_UPSTREAM:-http://127.0.0.1:4173/}"
NGINX_SITE_PATH="/etc/nginx/sites-available/tenant-${FQDN}.conf"
NGINX_SITE_LINK="/etc/nginx/sites-enabled/tenant-${FQDN}.conf"

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot not found. Install certbot first." >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx not found." >&2
  exit 1
fi

cat >"$NGINX_SITE_PATH" <<EOF
server {
    listen 80;
    server_name $FQDN;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

ln -sf "$NGINX_SITE_PATH" "$NGINX_SITE_LINK"
nginx -t
systemctl reload nginx

LE_EMAIL="${LETSENCRYPT_EMAIL:-}"
CERTBOT_ARGS=(
  certonly
  --webroot
  -w /var/www/html
  -d "$FQDN"
  --non-interactive
  --agree-tos
)

if [[ -n "$LE_EMAIL" ]]; then
  CERTBOT_ARGS+=(--email "$LE_EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

certbot "${CERTBOT_ARGS[@]}"

cat >"$NGINX_SITE_PATH" <<EOF
server {
    listen 80;
    server_name $FQDN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name $FQDN;

    ssl_certificate /etc/letsencrypt/live/$FQDN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$FQDN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location = / {
        return 301 $APP_BASE_PATH/login;
    }

    location = /login {
        return 301 $APP_BASE_PATH/login;
    }

    location / {
        return 301 $APP_BASE_PATH\$request_uri;
    }

    location $APP_BASE_PATH/api/v1/ {
        proxy_pass $API_UPSTREAM;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection upgrade;
    }

    location $APP_BASE_PATH/ {
        proxy_pass $FRONTEND_UPSTREAM;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

nginx -t
systemctl reload nginx

echo "SSL provisioned for $FQDN"

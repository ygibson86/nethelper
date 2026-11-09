#!/usr/bin/env bash
set -euo pipefail

# Production deployment helper for NetHelper with a local TLS CA.
#
# The script can be started from an existing checkout or downloaded standalone.
# It updates the checkout from Git, configures .env for TLS, issues/reuses the
# server certificate and restarts Docker Compose with docker-compose.tls.yml.

REPO_URL="${REPO_URL:-https://github.com/ygibson86/nethelper.git}"
BRANCH="${BRANCH:-main}"
TARGET_DIR="${TARGET_DIR:-}"
DOMAIN="${DOMAIN:-nethelper.ad.tarkett.ru}"
IP="${IP:-10.179.37.41}"
HTTP_PORT="${HTTP_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-443}"
CA_DIR="${CA_DIR:-/root/nethelper-ca}"
FORCE_CERT=0
FORCE_RESET=0
SKIP_BACKUP=0
ASSUME_YES=0
PREPARE_ONLY=0
NO_UPDATE=0

# Re-exec from a private copy. Git can replace this file while it is running.
if [[ -z "${NETHELPER_DEPLOY_SELF:-}" ]]; then
  self_copy="$(mktemp /tmp/nethelper-deploy.XXXXXX.sh)"
  cp "$0" "$self_copy"
  chmod 700 "$self_copy"
  export NETHELPER_DEPLOY_SELF="$self_copy"
  exec bash "$self_copy" "$@"
fi
trap 'rm -f "$NETHELPER_DEPLOY_SELF"' EXIT

log() {
  printf '\n==> %s\n' "$*"
}

warn() {
  printf '\n[!] %s\n' "$*" >&2
}

die() {
  printf '\n[ x ] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  deploy-prod-tls.sh [options]

Options:
  --dir PATH          Existing NetHelper checkout or new clone destination.
                      Default: autodetect from the running nethelper container,
                      otherwise /opt/nethelper.
  --repo URL          Git repository. Default: https://github.com/ygibson86/nethelper.git
  --branch NAME       Git branch. Default: main
  --domain NAME       Public DNS name. Default: nethelper.ad.tarkett.ru
  --ip ADDRESS        Server IP for the certificate SAN. Default: 10.179.37.41
  --http-port PORT    Host HTTP port. Default: 80 (redirects to HTTPS)
  --https-port PORT   Host HTTPS port. Default: 443
  --force-cert        Reissue the server certificate even if it is valid.
  --force-reset       Discard tracked local changes before updating from Git.
  --skip-backup       Do not dump PostgreSQL before the update.
  --prepare-only      Update the checkout and .env, then stop before certificates
                      and Docker Compose.
  --no-update         Do not run Git fetch/merge. Use when the code was already
                      copied or applied from a git bundle on an offline host.
  --yes               Do not ask for confirmation.
  --help              Show this help.

The script must run as the user that owns the checkout and can use Docker.
It calls sudo for Docker commands or certificate creation when needed.

Examples:
  ./scripts/deploy-prod-tls.sh --yes
  ./scripts/deploy-prod-tls.sh --dir /opt/nethelper --yes
  ./scripts/deploy-prod-tls.sh --domain nethelper.example.internal --ip 192.168.1.10 --yes
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)        TARGET_DIR="${2:?--dir requires a value}"; shift 2 ;;
    --repo)       REPO_URL="${2:?--repo requires a value}"; shift 2 ;;
    --branch)     BRANCH="${2:?--branch requires a value}"; shift 2 ;;
    --domain)     DOMAIN="${2:?--domain requires a value}"; shift 2 ;;
    --ip)         IP="${2:?--ip requires a value}"; shift 2 ;;
    --http-port)  HTTP_PORT="${2:?--http-port requires a value}"; shift 2 ;;
    --https-port) HTTPS_PORT="${2:?--https-port requires a value}"; shift 2 ;;
    --force-cert) FORCE_CERT=1; shift ;;
    --force-reset) FORCE_RESET=1; shift ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    --prepare-only) PREPARE_ONLY=1; shift ;;
    --no-update)  NO_UPDATE=1; shift ;;
    --yes)        ASSUME_YES=1; shift ;;
    --help|-h)    usage; exit 0 ;;
    *)            die "Unknown option: $1" ;;
  esac
done

[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "Invalid domain: $DOMAIN"
[[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "Invalid IPv4 address: $IP"
[[ "$HTTP_PORT" =~ ^[0-9]+$ ]] || die "Invalid HTTP port: $HTTP_PORT"
[[ "$HTTPS_PORT" =~ ^[0-9]+$ ]] || die "Invalid HTTPS port: $HTTPS_PORT"
(( HTTP_PORT >= 1 && HTTP_PORT <= 65535 )) || die "HTTP port out of range: $HTTP_PORT"
(( HTTPS_PORT >= 1 && HTTPS_PORT <= 65535 )) || die "HTTPS port out of range: $HTTPS_PORT"
[[ "$HTTP_PORT" != "$HTTPS_PORT" ]] || die "HTTP and HTTPS ports must differ"

if [[ "$HTTPS_PORT" != "443" ]]; then
  warn "PUBLIC_ORIGIN will include :$HTTPS_PORT. The HTTP->HTTPS redirect in nginx.tls.conf uses the standard 443 port; prefer --https-port 443."
fi

if [[ "$NO_UPDATE" -eq 0 ]]; then
  command -v git >/dev/null 2>&1 || die "git is not installed"
fi
command -v openssl >/dev/null 2>&1 || die "openssl is not installed"
command -v curl >/dev/null 2>&1 || die "curl is not installed"

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
  else
    DOCKER=(sudo docker)
  fi
else
  die "docker is not installed"
fi

"${DOCKER[@]}" compose version >/dev/null 2>&1 || die "docker compose plugin is not installed"

compose_version="$("${DOCKER[@]}" compose version --short 2>/dev/null | sed 's/^v//' | cut -d. -f1-2)"
compose_major="${compose_version%%.*}"
compose_minor="${compose_version#*.}"

if [[ ! "$compose_major" =~ ^[0-9]+$ || ! "$compose_minor" =~ ^[0-9]+$ ]]; then
  die "Cannot determine Docker Compose version"
fi

if (( compose_major < 2 || (compose_major == 2 && compose_minor < 24) )); then
  die "Docker Compose 2.24+ is required for the '!override' tag. Installed: v${compose_version}"
fi

if [[ "$EUID" -eq 0 ]]; then
  SUDO=()
  if [[ -n "${SUDO_USER:-}" ]]; then
    die "Run this script without sudo as the repository owner. It will call sudo itself when needed."
  fi
else
  SUDO=(sudo)
  command -v sudo >/dev/null 2>&1 || die "sudo is not installed"
fi

detect_container_id() {
  local id
  id="$("${DOCKER[@]}" ps --filter 'name=^nethelper$' --format '{{.ID}}' 2>/dev/null | head -n1 || true)"
  if [[ -z "$id" ]]; then
    id="$("${DOCKER[@]}" ps --filter ancestor=nethelper:latest --format '{{.ID}}' 2>/dev/null | head -n1 || true)"
  fi
  if [[ -z "$id" ]]; then
    id="$("${DOCKER[@]}" ps --filter name=nethelper --format '{{.ID}}' 2>/dev/null | head -n1 || true)"
  fi
  printf '%s\n' "$id"
}

detect_compose_dir() {
  local id dir
  id="$(detect_container_id)"
  [[ -n "$id" ]] || return 0

  dir="$("${DOCKER[@]}" inspect "$id" \
    --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' \
    2>/dev/null || true)"
  if [[ -n "$dir" && "$dir" != "<no value>" && -f "$dir/docker-compose.yml" ]]; then
    printf '%s\n' "$dir"
  fi
}

detect_compose_project() {
  local id project
  id="$(detect_container_id)"
  [[ -n "$id" ]] || return 0

  project="$("${DOCKER[@]}" inspect "$id" \
    --format '{{ index .Config.Labels "com.docker.compose.project" }}' \
    2>/dev/null || true)"
  if [[ -n "$project" && "$project" != "<no value>" ]]; then
    printf '%s\n' "$project"
  fi
}

detected_dir="$(detect_compose_dir || true)"
detected_project="$(detect_compose_project || true)"

if [[ -z "$TARGET_DIR" ]]; then
  TARGET_DIR="${detected_dir:-/opt/nethelper}"
fi

TARGET_DIR="$(realpath -m "$TARGET_DIR")"
PROJECT_NAME=""
if [[ -n "$detected_dir" && -n "$detected_project" && "$TARGET_DIR" == "$(realpath -m "$detected_dir")" ]]; then
  PROJECT_NAME="$detected_project"
fi

COMPOSE_PROJECT_ARGS=()
[[ -n "$PROJECT_NAME" ]] && COMPOSE_PROJECT_ARGS=(-p "$PROJECT_NAME")

ENV_FILE="$TARGET_DIR/.env"
CERT_DIR="$TARGET_DIR/certs"
BACKUP_DIR="$TARGET_DIR/backups"
CA_CERT_PUBLIC="$CERT_DIR/nethelper-root-ca.crt"

log "NetHelper production TLS deployment"
printf '    Repository: %s\n' "$REPO_URL"
printf '    Branch:     %s\n' "$BRANCH"
printf '    Directory:  %s\n' "$TARGET_DIR"
printf '    URL:        https://%s%s\n' "$DOMAIN" "$([[ "$HTTPS_PORT" == "443" ]] || printf ':%s' "$HTTPS_PORT")"
printf '    Certificate SAN: DNS:%s, IP:%s\n' "$DOMAIN" "$IP"

if [[ "$ASSUME_YES" -ne 1 ]]; then
  printf '\nThe script will update the checkout, modify .env, issue a certificate and restart the Compose stack.\n'
  read -r -p "Continue? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 1; }
fi

if [[ "$NO_UPDATE" -eq 1 ]]; then
  [[ -d "$TARGET_DIR" && -f "$TARGET_DIR/docker-compose.yml" ]] || \
    die "--no-update requires an existing NetHelper checkout in $TARGET_DIR"
  log "Skipping Git update (--no-update)"
else
  if [[ -d "$TARGET_DIR" && ! -d "$TARGET_DIR/.git" && -n "$(ls -A "$TARGET_DIR" 2>/dev/null || true)" ]]; then
    die "$TARGET_DIR exists but is not a Git checkout. Move it away or choose another --dir."
  fi

  if [[ -d "$TARGET_DIR/.git" ]]; then
    if [[ -n "$(git -C "$TARGET_DIR" diff --name-only --diff-filter=U 2>/dev/null || true)" ]]; then
      die "There are unresolved merge conflicts in $TARGET_DIR"
    fi

    if [[ "$FORCE_RESET" -ne 1 ]] && { ! git -C "$TARGET_DIR" diff --quiet || ! git -C "$TARGET_DIR" diff --cached --quiet; }; then
      die "Tracked local changes exist in $TARGET_DIR. Commit/stash them, or rerun with --force-reset."
    fi
  else
    log "Cloning $REPO_URL ($BRANCH) into $TARGET_DIR"
    mkdir -p "$(dirname "$TARGET_DIR")"
    git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$TARGET_DIR"
  fi
fi

# Back up the database before replacing the old version. The old stack is read
# from the old checkout, so this runs before the Git update.
if [[ "$SKIP_BACKUP" -ne 1 && -f "$ENV_FILE" && -f "$TARGET_DIR/docker-compose.yml" ]]; then
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  postgres_id="$(cd "$TARGET_DIR" && "${DOCKER[@]}" compose "${COMPOSE_PROJECT_ARGS[@]}" -f docker-compose.yml ps -q postgres 2>/dev/null || true)"
  if [[ -n "$postgres_id" ]]; then
    pg_user="$(awk -F= '$1 == "POSTGRES_USER" { print $2; exit }' "$ENV_FILE")"
    pg_db="$(awk -F= '$1 == "POSTGRES_DB" { print $2; exit }' "$ENV_FILE")"
    pg_password="$(awk -F= '$1 == "POSTGRES_PASSWORD" { sub("^[^=]*=", ""); print; exit }' "$ENV_FILE")"
    [[ -n "$pg_user" && -n "$pg_db" ]] || die "POSTGRES_USER/POSTGRES_DB are not set in .env"
    backup_file="$BACKUP_DIR/nethelper-db-$(date +%Y%m%d-%H%M%S).sql.gz"
    log "Backing up PostgreSQL to $backup_file"
    if ! "${DOCKER[@]}" exec -e PGPASSWORD="$pg_password" "$postgres_id" \
      pg_dump -U "$pg_user" "$pg_db" | gzip > "$backup_file"; then
      rm -f "$backup_file"
      die "PostgreSQL backup failed. Fix the problem or rerun with --skip-backup."
    fi
    chmod 600 "$backup_file"
  else
    warn "The PostgreSQL container is not running; skipping the database backup."
  fi
fi

if [[ "$NO_UPDATE" -eq 0 ]]; then
  log "Updating Git checkout"
  if ! git -C "$TARGET_DIR" fetch --prune origin "$BRANCH"; then
    die "Cannot fetch origin/$BRANCH. Check network access or apply a Git bundle and rerun with --no-update."
  fi

  if [[ "$FORCE_RESET" -eq 1 ]]; then
    mkdir -p "$BACKUP_DIR"
    git -C "$TARGET_DIR" diff > "$BACKUP_DIR/local-changes-$(date +%Y%m%d-%H%M%S).patch" || true
    git -C "$TARGET_DIR" checkout -f "$BRANCH"
    if ! git -C "$TARGET_DIR" reset --hard "origin/$BRANCH"; then
      die "Cannot reset to origin/$BRANCH"
    fi
  else
    git -C "$TARGET_DIR" checkout "$BRANCH"
    if ! git -C "$TARGET_DIR" merge --ff-only "origin/$BRANCH"; then
      die "Cannot fast-forward to origin/$BRANCH. Resolve local commits/changes or use --force-reset when origin/$BRANCH contains the TLS changes."
    fi
  fi
fi

for required_file in \
  docker-compose.yml \
  docker-compose.tls.yml \
  nginx.tls.conf \
  scripts/setup-local-tls.sh; do
  [[ -f "$TARGET_DIR/$required_file" ]] || \
    die "$required_file is missing after the Git update. Push the TLS changes to $BRANCH first."
done

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$TARGET_DIR/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  warn ".env was created from .env.example. Fill in the real secrets and rerun this script."
  exit 2
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cp "$ENV_FILE" "$BACKUP_DIR/env-$(date +%Y%m%d-%H%M%S).bak"
chmod 600 "$BACKUP_DIR"/env-*.bak

env_get() {
  awk -v key="$1" 'index($0, key "=") == 1 { sub("^" key "=", ""); value = $0 } END { print value }' "$ENV_FILE"
}

env_set() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

for key in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL JWT_SECRET ADMIN_PASSWORD_HASH; do
  value="$(env_get "$key")"
  [[ -n "$value" ]] || die ".env: $key is empty"
  [[ "$value" != *"replace-with"* && "$value" != "ARGON2ID_PASSWORD_HASH" ]] || \
    die ".env: $key still contains a placeholder"
done

jwt_value="$(env_get JWT_SECRET)"
(( ${#jwt_value} >= 32 )) || die ".env: JWT_SECRET must be at least 32 characters"

public_origin="https://$DOMAIN"
[[ "$HTTPS_PORT" == "443" ]] || public_origin="$public_origin:$HTTPS_PORT"

log "Configuring .env"
env_set PUBLIC_ORIGIN "$public_origin"
env_set NETHELPER_HTTP_PORT "$HTTP_PORT"
env_set NETHELPER_HTTPS_PORT "$HTTPS_PORT"
chmod 600 "$ENV_FILE"

if [[ "$PREPARE_ONLY" -eq 1 ]]; then
  log "Preparation complete"
  printf '    PUBLIC_ORIGIN=%s\n' "$public_origin"
  printf '    NETHELPER_HTTP_PORT=%s\n' "$HTTP_PORT"
  printf '    NETHELPER_HTTPS_PORT=%s\n' "$HTTPS_PORT"
  echo "Rerun without --prepare-only to issue the certificate and deploy."
  exit 0
fi

port_owners() {
  "${DOCKER[@]}" ps --filter "publish=$1" --format '{{.Names}}' 2>/dev/null || true
}

check_port() {
  local port="$1" owners
  command -v ss >/dev/null 2>&1 || return 0
  ss -lntH 2>/dev/null | awk '{ print $4 }' | grep -Eq "[:.]${port}$" || return 0
  owners="$(port_owners "$port")"
  if [[ -n "$owners" ]] && grep -qx 'nethelper' <<< "$owners"; then
    return 0
  fi
  die "Host port $port is already in use${owners:+ by: $owners}. Stop that service or choose another port."
}

check_port "$HTTP_PORT"
check_port "$HTTPS_PORT"

certificate_is_valid() {
  local cert="$CERT_DIR/nethelper.crt"
  [[ -f "$cert" ]] || return 1
  [[ -f "$CA_DIR/nethelper-root-ca.crt" ]] || return 1
  openssl x509 -in "$cert" -noout -checkend 2592000 >/dev/null 2>&1 || return 1
  openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:$DOMAIN" || return 1
  openssl x509 -in "$cert" -noout -ext subjectAltName 2>/dev/null | grep -q "IP Address:$IP" || return 1
  openssl verify -CAfile "$CA_DIR/nethelper-root-ca.crt" "$cert" >/dev/null 2>&1 || return 1
}

need_force=0
if [[ "$FORCE_CERT" -eq 1 ]]; then
  need_force=1
elif certificate_is_valid; then
  log "Reusing the existing certificate"
else
  need_force=1
fi

if [[ "$need_force" -eq 1 ]]; then
  log "Issuing the local CA and server certificate"
  cert_args=("$DOMAIN" "$IP" "--force")
  "${SUDO[@]}" env CA_DIR="$CA_DIR" CERT_DIR="$CERT_DIR" \
    bash "$TARGET_DIR/scripts/setup-local-tls.sh" "${cert_args[@]}"
fi

[[ -f "$CA_DIR/nethelper-root-ca.crt" ]] || die "Root CA not found: $CA_DIR/nethelper-root-ca.crt"
[[ -f "$CERT_DIR/nethelper.crt" ]] || die "Server certificate not found: $CERT_DIR/nethelper.crt"

# Make the public CA certificate convenient to copy to clients. The CA key
# itself stays in CA_DIR and is never copied into the repository.
mkdir -p "$CERT_DIR"
if [[ "$EUID" -eq 0 ]]; then
  install -m 644 "$CA_DIR/nethelper-root-ca.crt" "$CA_CERT_PUBLIC"
else
  "${SUDO[@]}" install -m 644 -o "$(id -u)" -g "$(id -g)" \
    "$CA_DIR/nethelper-root-ca.crt" "$CA_CERT_PUBLIC"
fi

openssl verify -CAfile "$CA_CERT_PUBLIC" "$CERT_DIR/nethelper.crt" >/dev/null

resolved_ip="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{ print $1; exit }' || true)"
if [[ -z "$resolved_ip" ]]; then
  warn "$DOMAIN does not resolve. Add a DNS record or a hosts entry pointing to $IP."
elif [[ "$resolved_ip" != "$IP" ]]; then
  warn "$DOMAIN currently resolves to $resolved_ip, not $IP. Clients will need a DNS record or hosts entry."
fi

log "Validating Docker Compose configuration"
(
  cd "$TARGET_DIR"
  "${DOCKER[@]}" compose "${COMPOSE_PROJECT_ARGS[@]}" -f docker-compose.yml -f docker-compose.tls.yml config -q
)

previous_image_tag=""
if "${DOCKER[@]}" image inspect nethelper:latest >/dev/null 2>&1; then
  previous_image_tag="nethelper:pre-tls-$(date +%Y%m%d-%H%M%S)"
  "${DOCKER[@]}" tag nethelper:latest "$previous_image_tag"
  log "Previous image saved as $previous_image_tag"
fi

log "Rebuilding and restarting NetHelper"
(
  cd "$TARGET_DIR"
  "${DOCKER[@]}" compose "${COMPOSE_PROJECT_ARGS[@]}" -f docker-compose.yml -f docker-compose.tls.yml up -d --build
)

log "Waiting for HTTPS"
https_ok=0
for _ in $(seq 1 60); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --noproxy '*' \
    --resolve "$DOMAIN:$HTTPS_PORT:127.0.0.1" \
    --cacert "$CA_CERT_PUBLIC" \
    "https://$DOMAIN:$HTTPS_PORT/" 2>/dev/null || true)"
  if [[ "$code" == "200" ]]; then
    https_ok=1
    break
  fi
  sleep 2
done

if [[ "$https_ok" -ne 1 ]]; then
  warn "HTTPS did not become ready. Recent logs:"
  (
    cd "$TARGET_DIR"
    "${DOCKER[@]}" compose "${COMPOSE_PROJECT_ARGS[@]}" -f docker-compose.yml -f docker-compose.tls.yml ps
    "${DOCKER[@]}" compose "${COMPOSE_PROJECT_ARGS[@]}" -f docker-compose.yml -f docker-compose.tls.yml logs --tail=100 nethelper api
  ) || true
  die "Deployment failed: https://$DOMAIN:$HTTPS_PORT/ did not return 200"
fi

api_code="$(curl -sS -o /dev/null -w '%{http_code}' --noproxy '*' \
  --resolve "$DOMAIN:$HTTPS_PORT:127.0.0.1" \
  --cacert "$CA_CERT_PUBLIC" \
  "https://$DOMAIN:$HTTPS_PORT/api/session" 2>/dev/null || true)"

if [[ "$api_code" != "401" ]]; then
  warn "API check returned $api_code instead of 401. Check the API container logs."
fi

http_code="$(curl -sS -o /dev/null -w '%{http_code}' --noproxy '*' \
  --resolve "$DOMAIN:$HTTP_PORT:127.0.0.1" \
  "http://$DOMAIN:$HTTP_PORT/" 2>/dev/null || true)"

if [[ "$http_code" != "301" && "$http_code" != "308" ]]; then
  warn "HTTP check returned $http_code instead of a redirect to HTTPS."
fi

fingerprint="$(openssl x509 -in "$CA_CERT_PUBLIC" -noout -fingerprint -sha256 | sed 's/^.*=//')"
compose_hint="docker compose"
[[ -n "$PROJECT_NAME" ]] && compose_hint="docker compose -p $PROJECT_NAME"

cat <<EOF

NetHelper is available at:
  https://$DOMAIN$([[ "$HTTPS_PORT" == "443" ]] || printf ':%s' "$HTTPS_PORT")

Root CA for client computers:
  $CA_CERT_PUBLIC

SHA256 fingerprint:
  $fingerprint

Install this CA into the Trusted Root store on clients, then restart Chrome:
  Windows: certutil -addstore -f Root nethelper-root-ca.crt
  GPO:     Computer Configuration -> Policies -> Windows Settings -> Security Settings
           -> Public Key Policies -> Trusted Root Certification Authorities

Verify in the browser console:
  window.isSecureContext          // true
  Boolean(navigator.clipboard)    // true
EOF

if [[ -n "$previous_image_tag" ]]; then
  cat <<EOF

Previous NetHelper image:
  $previous_image_tag
EOF
fi

cat <<EOF

Useful commands:
  cd $TARGET_DIR
  $compose_hint -f docker-compose.yml -f docker-compose.tls.yml ps
  $compose_hint -f docker-compose.yml -f docker-compose.tls.yml logs -f nethelper api
EOF

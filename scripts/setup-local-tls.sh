#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo ./scripts/setup-local-tls.sh <domain> [ip] [--force]

Examples:
  sudo ./scripts/setup-local-tls.sh nethelper.example.internal
  sudo ./scripts/setup-local-tls.sh nethelper.example.internal 192.168.1.10
  sudo ./scripts/setup-local-tls.sh 192.168.1.10
  sudo ./scripts/setup-local-tls.sh nethelper.example.internal 192.168.1.10 --force

Options:
  --force   Replace an existing server certificate (the CA is kept).
  --help    Show this help.

Environment:
  CA_DIR    Directory for the Root CA. Default: /root/nethelper-ca
  CERT_DIR  Directory for the server certificate. Default: ./certs
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

DOMAIN=''
IP=''
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -*)
      die "Unknown option: $1"
      ;;
    *)
      if [[ -z "$DOMAIN" ]]; then
        DOMAIN="$1"
      elif [[ -z "$IP" ]]; then
        IP="$1"
      else
        die "Unexpected argument: $1"
      fi
      shift
      ;;
  esac
done

[[ -n "$DOMAIN" ]] || die "Domain or IP is required"
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "Invalid domain or IP: $DOMAIN"

is_ipv4() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

if is_ipv4 "$DOMAIN"; then
  [[ -z "$IP" ]] && IP="$DOMAIN"
elif [[ -n "$IP" ]] && ! is_ipv4 "$IP"; then
  die "Invalid IPv4 address: $IP"
fi

command -v openssl >/dev/null 2>&1 || die "openssl is not installed"
[[ "$(id -u)" -eq 0 ]] || die "Run this script with sudo"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CA_DIR="${CA_DIR:-/root/nethelper-ca}"
CERT_DIR="${CERT_DIR:-$ROOT_DIR/certs}"
CA_KEY="$CA_DIR/nethelper-root-ca.key"
CA_CERT="$CA_DIR/nethelper-root-ca.crt"
SERVER_KEY="$CERT_DIR/privkey.pem"
SERVER_CERT="$CERT_DIR/nethelper.crt"
FULLCHAIN="$CERT_DIR/fullchain.pem"
REQUEST="$CA_DIR/nethelper.csr"
EXTFILE="$CA_DIR/nethelper.ext"

install -d -m 700 "$CA_DIR"
install -d -m 755 "$CERT_DIR"

if [[ -f "$SERVER_CERT" && "$FORCE" -ne 1 ]]; then
  die "$SERVER_CERT already exists. Use --force to replace the server certificate."
fi

umask 077

if [[ ! -f "$CA_KEY" || ! -f "$CA_CERT" ]]; then
  echo "Creating local Root CA in $CA_DIR"
  openssl genrsa -out "$CA_KEY" 4096
  chmod 600 "$CA_KEY"
  openssl req \
    -x509 \
    -new \
    -sha256 \
    -days 3650 \
    -key "$CA_KEY" \
    -out "$CA_CERT" \
    -subj "/C=RU/O=NetHelper/OU=IT/CN=NetHelper Local Root CA"
else
  echo "Using existing Root CA: $CA_CERT"
fi

if is_ipv4 "$DOMAIN"; then
  echo "Creating server certificate for IP $DOMAIN"
elif [[ -n "$IP" ]]; then
  echo "Creating server certificate for $DOMAIN ($IP)"
else
  echo "Creating server certificate for $DOMAIN"
fi
openssl genrsa -out "$SERVER_KEY" 2048
openssl req \
  -new \
  -sha256 \
  -key "$SERVER_KEY" \
  -out "$REQUEST" \
  -subj "/C=RU/O=NetHelper/OU=IT/CN=$DOMAIN"

{
  echo 'basicConstraints = critical, CA:FALSE'
  echo 'keyUsage = critical, digitalSignature, keyEncipherment'
  echo 'extendedKeyUsage = serverAuth'
  echo 'subjectAltName = @alt_names'
  echo
  echo '[alt_names]'
  if is_ipv4 "$DOMAIN"; then
    echo "IP.1 = $DOMAIN"
  else
    echo "DNS.1 = $DOMAIN"
    if [[ -n "$IP" ]]; then
      echo "IP.1 = $IP"
    fi
  fi
} > "$EXTFILE"

openssl x509 \
  -req \
  -sha256 \
  -days 825 \
  -in "$REQUEST" \
  -CA "$CA_CERT" \
  -CAkey "$CA_KEY" \
  -CAcreateserial \
  -extfile "$EXTFILE" \
  -out "$SERVER_CERT"

cat "$SERVER_CERT" "$CA_CERT" > "$FULLCHAIN"

chmod 640 "$SERVER_KEY"
chmod 644 "$SERVER_CERT" "$FULLCHAIN"
chmod 644 "$CA_CERT"
chown root:101 "$SERVER_KEY"
chown root:root "$SERVER_CERT" "$FULLCHAIN" "$CA_CERT"

if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce)" == "Enforcing" ]]; then
  echo "Applying SELinux context to $CERT_DIR"
  chcon -Rt svirt_sandbox_file_t "$CERT_DIR" || true
fi

echo
echo "Certificate created:"
openssl x509 -in "$SERVER_CERT" -noout -subject -issuer -dates -ext subjectAltName
echo
echo "Root CA for client computers:"
echo "  $CA_CERT"
echo
echo "Next steps:"
echo "  1. Set in .env:"
echo "     PUBLIC_ORIGIN=https://$DOMAIN"
echo "     NETHELPER_HTTP_PORT=80"
echo "     NETHELPER_HTTPS_PORT=443"
echo "  2. Start with TLS:"
echo "     docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build"
echo "  3. Install the Root CA on client computers."
echo "  4. Open https://$DOMAIN and verify window.isSecureContext === true"

#!/bin/bash
set -euo pipefail

: "${KEYSTORE_PASSWORD:?Set KEYSTORE_PASSWORD in your environment before running this script}"
: "${KEY_ALIAS:?Set KEY_ALIAS in your environment before running this script}"
: "${KEY_PASSWORD:?Set KEY_PASSWORD in your environment before running this script}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
KEYSTORE_PATH="$SCRIPT_DIR/android/app/release.keystore"

if [[ -e "$KEYSTORE_PATH" ]]; then
  echo "Refusing to overwrite existing keystore: $KEYSTORE_PATH" >&2
  exit 1
fi

keytool -genkeypair -v -keystore "$KEYSTORE_PATH" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias "$KEY_ALIAS" \
  -dname "CN=VimoreApp, OU=Development, O=VimoreApp, L=Cairo, ST=Cairo, C=EG" \
  -storepass:env KEYSTORE_PASSWORD \
  -keypass:env KEY_PASSWORD

keytool -list -keystore "$KEYSTORE_PATH" -storepass:env KEYSTORE_PASSWORD

echo "Release keystore generated at $KEYSTORE_PATH. Back it up securely and never commit it."
